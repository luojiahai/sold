import { db } from "@/db";
import { runs } from "@/db/schema";
import { getCollector } from "@/collectors/registry";
import { getDetector } from "@/detectors/registry";
import type { CollectorTerm, TermKind, TerminationReason } from "@/collectors/types";
import type { DetectorInput } from "@/detectors/types";
import { cacheThumbnail } from "@/media/cache";
import { newId, nowIso } from "@/lib/id";
import { RunCancelled, isCancelled, touchHeartbeat } from "./lifecycle";
import {
  bumpRunCounters,
  linkRunPost,
  logEvent,
  recordTerm,
  saveDetection,
  undetectedPosts,
  updateRun,
  upsertPost,
} from "./store";

export interface HarvestConfig {
  collectorId: string;
  detectorId: string;
  terms: CollectorTerm[];
  since: string;
  until: string;
  maxPagesPerTerm: number;
  maxPostsPerTerm: number;
  delayRange: [number, number];
  strategies: string[];
  /** Run the detector over the entire undetected backlog, not just this run's finds. */
  detectBacklog: boolean;
}

export function createRun(config: HarvestConfig): string {
  const id = newId();
  db.insert(runs)
    .values({
      id,
      status: "pending",
      heartbeatAt: nowIso(),
      collectorId: config.collectorId,
      detectorId: config.detectorId,
      config,
      sinceDate: config.since,
      untilDate: config.until,
    })
    .run();
  return id;
}

/** Per-term tallies accumulated while the collector streams. */
interface TermTally {
  kind: TermKind;
  strategy: string;
  postsSeen: number;
  postsNew: number;
  postsInRange: number;
  pagesFetched: number;
}

/**
 * Executes a harvest: collect, then detect.
 *
 * Runs in-process as a background task. Progress is written to the database as
 * it happens rather than returned at the end, so the run page can show a live
 * log — and so a crashed run leaves evidence behind instead of vanishing.
 */
export async function executeRun(runId: string, config: HarvestConfig): Promise<void> {
  const collector = getCollector(config.collectorId);
  const detector = getDetector(config.detectorId);

  try {
    if (!collector.implemented) throw new Error(`Collector ${collector.name} is a placeholder.`);
    if (!detector.implemented) throw new Error(`Detector ${detector.name} is a placeholder.`);

    /* ---------------------------- collect ---------------------------- */

    updateRun(runId, { status: "collecting", heartbeatAt: nowIso() });
    logEvent(runId, "collect", `Starting ${collector.name} over ${config.terms.length} term(s).`);

    const tallies = new Map<string, TermTally>();
    const kindFor = new Map(config.terms.map((t) => [t.term, t.kind]));
    let sessionExpired = false;

    for await (const event of collector.collect({
      runId,
      terms: config.terms,
      since: config.since,
      until: config.until,
      maxPagesPerTerm: config.maxPagesPerTerm,
      maxPostsPerTerm: config.maxPostsPerTerm,
      delayRange: config.delayRange,
      options: { strategies: config.strategies },
    })) {
      if (event.type === "log") {
        logEvent(runId, "collect", event.message, event.level);
        continue;
      }

      if (event.type === "session_expired") {
        sessionExpired = true;
        logEvent(runId, "collect", `Session expired: ${event.message}`, "error");
        throw new Error(`Instagram session expired: ${event.message}`);
      }

      // Checked per post rather than per term: a cancelled run should stop
      // within seconds, not after the current hashtag finishes paginating.
      if (isCancelled(runId)) throw new RunCancelled();

      if (event.type === "post") {
        const { post } = event;
        const thumbnailPath = await cacheThumbnail(post.thumbnailUrl, post.platformPostId);
        const { id, isNew } = upsertPost(post, runId, collector.id, thumbnailPath);
        linkRunPost(runId, id, post.sourceTerm, post.sourceStrategy, isNew);

        const key = `${post.sourceTerm}::${post.sourceStrategy}`;
        const tally =
          tallies.get(key) ??
          {
            kind: kindFor.get(post.sourceTerm) ?? "hashtag",
            strategy: post.sourceStrategy,
            postsSeen: 0,
            postsNew: 0,
            postsInRange: 0,
            pagesFetched: 0,
          };
        tally.postsNew += isNew ? 1 : 0;
        tallies.set(key, tally);

        bumpRunCounters(runId, { postsSeen: 1, postsNew: isNew ? 1 : 0 });
        continue;
      }

      if (event.type === "term_complete") {
        const key = `${event.term}::${event.strategy}`;
        const tally = tallies.get(key);
        recordTerm(runId, event.kind, event.term, event.strategy, {
          postsSeen: event.postsSeen,
          postsInRange: event.postsInRange,
          postsNew: tally?.postsNew ?? 0,
          pagesFetched: event.pagesFetched,
          terminationReason: event.terminationReason as TerminationReason,
          error: event.error,
        });
        logEvent(
          runId,
          "collect",
          `${event.term} [${event.strategy}]: ${event.postsInRange} in range of ${event.postsSeen} seen across ${event.pagesFetched} page(s) — ${event.terminationReason}`,
          event.terminationReason === "error" ? "warn" : "info",
        );
      }
    }

    if (sessionExpired) return;

    /* ---------------------------- detect ----------------------------- */

    updateRun(runId, { status: "detecting" });

    const queue = undetectedPosts(config.detectBacklog ? 1_000 : 500);
    if (queue.length === 0) {
      logEvent(runId, "detect", "Nothing to detect — every collected post already has a verdict.");
    } else {
      logEvent(runId, "detect", `${queue.length} undetected post(s) queued for ${detector.name}.`);

      const inputs: DetectorInput[] = queue.map((row) => ({
        postId: row.postId,
        text: row.text,
        authorHandle: row.authorHandle,
        hashtags: row.hashtags ?? [],
        locationName: row.locationName,
        postedAt: row.postedAt,
        url: row.url,
        thumbnailPath: row.thumbnailPath,
      }));

      for await (const event of detector.detect(inputs)) {
        if (isCancelled(runId)) throw new RunCancelled();
        if (event.type === "log") {
          logEvent(runId, "detect", event.message, event.level);
          continue;
        }

        let verified = 0;
        for (const verdict of event.verdicts) {
          // Cost is reported per call, so attribute it evenly across the batch.
          saveDetection(
            verdict,
            runId,
            detector.id,
            detector.model,
            event.costUsd / Math.max(event.verdicts.length, 1),
          );
          if (verdict.isListing && verdict.isAustralia) verified += 1;
        }

        bumpRunCounters(
          runId,
          { postsDetected: event.verdicts.length, postsVerified: verified },
          event.costUsd,
        );
        logEvent(
          runId,
          "detect",
          `Batch of ${event.verdicts.length}: ${verified} verified as Australian listings ($${event.costUsd.toFixed(4)}).`,
        );
      }
    }

    updateRun(runId, { status: "completed", finishedAt: nowIso() });
    logEvent(runId, "done", "Run complete.");
  } catch (err) {
    if (err instanceof RunCancelled) {
      // Already marked cancelled by whoever asked; just record where it stopped.
      logEvent(runId, "cancelled", "Run stopped at the next checkpoint.", "warn");
      updateRun(runId, { finishedAt: nowIso() });
      return;
    }
    const message = (err as Error).message;
    updateRun(runId, { status: "failed", error: message, finishedAt: nowIso() });
    logEvent(runId, "error", message, "error");
  }
}

/**
 * Starts a run without blocking the request.
 *
 * A deliberate prototype simplification: in-process background work dies with
 * the server. The `runs` table is the mitigation — an interrupted run is
 * visibly stuck in `collecting` rather than silently absent, and the PRD names
 * a job queue as the production fix.
 */
export function startRun(config: HarvestConfig): string {
  const runId = createRun(config);
  void executeRun(runId, config);
  return runId;
}
