import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { detections, posts, runs } from "@/db/schema";
import { getDetector } from "@/detectors/registry";
import { newId, nowIso } from "@/lib/id";
import { RunCancelled } from "./lifecycle";
import { runDetectionPhase, toDetectorInput } from "./detect-phase";
import { logEvent, updateRun } from "./store";

/**
 * Re-detection: replaying already-collected posts through the current prompt.
 *
 * Selection is keyed on `promptVersion`, not on which fields happen to be null.
 * Field-nullness cannot tell "never asked" apart from "asked, and the post
 * genuinely didn't say" — an off-market teaser with no address would otherwise
 * be re-detected forever and never settle.
 *
 * Verdicts are appended, never overwritten, exactly as a harvest's are. The
 * run is a real `runs` row so the money it spends appears in the same ledger as
 * everything else, and it goes through the normal lifecycle so heartbeats,
 * cancellation and orphan reconciliation all work without special cases.
 */

export type RedetectScope = "stale_verified" | "stale_all" | "all_verified";

/** Ordered cheapest-first; the UI relies on that order to show a cost gradient. */
export const REDETECT_SCOPES: Array<{
  id: RedetectScope;
  label: string;
  note: string;
}> = [
  {
    id: "stale_verified",
    label: "Verified listings with an outdated verdict",
    note: "The posts you already care about, re-read by the current prompt.",
  },
  {
    id: "stale_all",
    label: "Every detected post with an outdated verdict",
    note: "Includes rejected posts. The only scope that can show a prompt change fixing a false negative — and much the larger pile.",
  },
  {
    id: "all_verified",
    label: "All verified listings, whatever their verdict version",
    note: "Re-reads posts the current prompt has already seen. Only useful for comparing a model or detector against itself.",
  },
];

/** Every re-detection queue is posts joined to their latest verdict. */
function scopeCondition(scope: RedetectScope, promptVersion: number) {
  const verified = and(eq(detections.isListing, true), eq(detections.isAustralia, true));
  const stale = lt(detections.promptVersion, promptVersion);

  if (scope === "stale_all") return stale;
  if (scope === "all_verified") return verified;
  return and(verified, stale);
}

export interface RedetectConfig {
  detectorId: string;
  scope: RedetectScope;
  /** The version being brought up to. Recorded so the run is reproducible. */
  promptVersion: number;
}

export function redetectCount(scope: RedetectScope, promptVersion: number): number {
  return (
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(posts)
      .innerJoin(detections, eq(posts.latestDetectionId, detections.id))
      .where(scopeCondition(scope, promptVersion))
      .get()?.n ?? 0
  );
}

/**
 * One run's worth of work.
 *
 * Capped, because a run holds its queue in memory and executes in-process. When
 * the cap bites the run says so in its log rather than reporting a clean
 * completion over a partial corpus — re-running picks up where it left off,
 * since the posts it did finish are no longer stale.
 */
export const REDETECT_RUN_LIMIT = 2_000;

function redetectQueue(scope: RedetectScope, promptVersion: number, limit = REDETECT_RUN_LIMIT) {
  return db
    .select({
      postId: posts.id,
      text: posts.text,
      authorHandle: posts.authorHandle,
      hashtags: posts.hashtags,
      locationName: posts.locationName,
      postedAt: posts.postedAt,
      url: posts.url,
      thumbnailPath: posts.thumbnailPath,
    })
    .from(posts)
    .innerJoin(detections, eq(posts.latestDetectionId, detections.id))
    .where(scopeCondition(scope, promptVersion))
    .orderBy(desc(sql`COALESCE(${posts.postedAt}, ${posts.collectedAt})`))
    .limit(limit)
    .all();
}

/**
 * Mean observed cost per detected post, or null when nothing has been detected
 * yet.
 *
 * Null rather than a hardcoded fallback: this number's only job is informed
 * consent before a paid operation, and a fabricated estimate is worse there
 * than an admitted absence. It also under-states the current prompt, which asks
 * for more output than the runs it averages over — the UI says so.
 */
export function estimatedCostPerPost(sampleSize = 200): number | null {
  const rows = db
    .select({ costUsd: detections.costUsd })
    .from(detections)
    .where(and(isNotNull(detections.costUsd), sql`${detections.costUsd} > 0`))
    .orderBy(desc(detections.createdAt))
    .limit(sampleSize)
    .all();

  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0) / rows.length;
}

/**
 * The date range a re-detection covers.
 *
 * `runs.sinceDate`/`untilDate` are NOT NULL and the Runs list renders them, so
 * a re-detection has to put something there. The span of the posts it actually
 * touches is the one value that is true; a start-timestamp placeholder would be
 * a lie in a column people read.
 */
function queueDateRange(queue: Array<{ postedAt: string | null }>, fallback: string) {
  const dates = queue
    .map((row) => row.postedAt?.slice(0, 10))
    .filter((d): d is string => Boolean(d))
    .sort();

  return dates.length === 0
    ? { since: fallback, until: fallback }
    : { since: dates[0], until: dates[dates.length - 1] };
}

export function startRedetect(config: RedetectConfig): string {
  // Fail on an unknown detector before a run row exists to be left behind.
  getDetector(config.detectorId);

  const queue = redetectQueue(config.scope, config.promptVersion);
  const { since, until } = queueDateRange(queue, nowIso().slice(0, 10));

  const id = newId();
  db.insert(runs)
    .values({
      id,
      kind: "redetect",
      status: "pending",
      heartbeatAt: nowIso(),
      // A re-detection collects nothing. The column is NOT NULL, and "none" is
      // more honest in the Runs table than naming a collector that never ran.
      collectorId: "none",
      detectorId: config.detectorId,
      config,
      sinceDate: since,
      untilDate: until,
    })
    .run();

  void executeRedetect(id, config, queue);
  return id;
}

async function executeRedetect(
  runId: string,
  config: RedetectConfig,
  queue: ReturnType<typeof redetectQueue>,
): Promise<void> {
  const detector = getDetector(config.detectorId);

  try {
    if (!detector.implemented) throw new Error(`Detector ${detector.name} is a placeholder.`);

    updateRun(runId, { status: "detecting", heartbeatAt: nowIso() });

    if (queue.length === 0) {
      logEvent(runId, "detect", "Nothing to re-detect — every verdict is already current.");
    } else {
      logEvent(
        runId,
        "detect",
        `Re-detecting ${queue.length} post(s) with ${detector.name} at prompt version ${detector.promptVersion} (scope: ${config.scope}).`,
      );
      if (queue.length === REDETECT_RUN_LIMIT) {
        const remaining = redetectCount(config.scope, config.promptVersion) - queue.length;
        logEvent(
          runId,
          "detect",
          `Queue capped at ${REDETECT_RUN_LIMIT}; roughly ${Math.max(remaining, 0)} post(s) are left for a second run.`,
          "warn",
        );
      }
      await runDetectionPhase(runId, detector, queue.map(toDetectorInput));
    }

    updateRun(runId, { status: "completed", finishedAt: nowIso() });
    logEvent(runId, "done", "Re-detection complete.");
  } catch (err) {
    if (err instanceof RunCancelled) {
      logEvent(runId, "cancelled", "Re-detection stopped at the next checkpoint.", "warn");
      updateRun(runId, { finishedAt: nowIso() });
      return;
    }
    const message = (err as Error).message;
    updateRun(runId, { status: "failed", error: message, finishedAt: nowIso() });
    logEvent(runId, "error", message, "error");
  }
}
