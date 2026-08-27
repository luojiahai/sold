import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { keywords, runs } from "@/db/schema";
import { COLLECTORS } from "@/collectors/registry";
import { DETECTORS } from "@/detectors/registry";
import { money, relativeTime } from "../format";
import { activeRunCount, isStalled } from "@/harvest/lifecycle";
import { REDETECT_SCOPES, estimatedCostPerPost, redetectCount } from "@/harvest/redetect";
import { cancelRun } from "./cancel-action";
import { NewRunForm } from "./new-run-form";
import { RedetectPanel } from "./redetect-panel";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  completed: "ok",
  failed: "bad",
  cancelled: "warn",
  collecting: "live",
  detecting: "live",
  pending: "",
};

export default async function RunsPage() {
  const history = db.select().from(runs).orderBy(desc(runs.startedAt)).limit(30).all();
  const enabled = db.select().from(keywords).all().filter((k) => k.enabled);

  const collectors = COLLECTORS.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    implemented: c.implemented,
    strategies: c.capabilities.strategies,
    costTier: c.capabilities.costTier,
    supportsDateCutoff: c.capabilities.supportsDateCutoff,
  }));

  // Counts are per (detector, scope) because "stale" is defined against the
  // detector's own prompt version, not a global one.
  const redetectDetectors = DETECTORS.filter((d) => d.implemented).map((d) => ({
    id: d.id,
    name: d.name,
    promptVersion: d.promptVersion,
    counts: Object.fromEntries(
      REDETECT_SCOPES.map((scope) => [scope.id, redetectCount(scope.id, d.promptVersion)]),
    ),
  }));
  // `stale_all` contains `stale_verified`, so it alone answers "is anything
  // out of date?".
  const staleTotal = redetectDetectors.reduce((n, d) => n + (d.counts.stale_all ?? 0), 0);

  const detectors = DETECTORS.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    implemented: d.implemented,
    batchSize: d.capabilities.batchSize,
    costTier: d.capabilities.costTier,
  }));

  return (
    <>
      <div className="page-head">
        <h1>Harvest runs</h1>
        <p className="lede">
          A run collects posts for a date range, then classifies everything that
          doesn&apos;t already have a verdict. Collector and detector are both
          interchangeable — that&apos;s the architecture the prototype exists to
          demonstrate.
        </p>
      </div>

      <NewRunForm
        collectors={collectors}
        detectors={detectors}
        enabledHashtags={enabled.filter((k) => k.kind === "hashtag").length}
        enabledKeywords={enabled.filter((k) => k.kind === "keyword").length}
      />

      {redetectDetectors.length > 0 && (
        <RedetectPanel
          detectors={redetectDetectors}
          scopes={REDETECT_SCOPES}
          costPerPost={estimatedCostPerPost()}
          runActive={activeRunCount() > 0}
          staleTotal={staleTotal}
        />
      )}

      <h2>History</h2>
      {history.length === 0 ? (
        <div className="empty">
          <b>No runs yet.</b>
          Start one above once a session is active.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Collector</th>
                <th>Detector</th>
                <th>Range</th>
                <th className="num">Seen</th>
                <th className="num">New</th>
                <th className="num">Verified</th>
                <th className="num">Cost</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr key={run.id}>
                  <td className="nowrap">
                    <Link href={`/runs/${run.id}`}>{relativeTime(run.startedAt)}</Link>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <span className={`tag ${STATUS_TONE[run.status] ?? ""}`}>
                        {run.status}
                      </span>
                      {run.kind !== "harvest" && <span className="tag">{run.kind}</span>}
                      {isStalled(run) && <span className="tag warn">stalled</span>}
                    </div>
                  </td>
                  <td className="mono">
                    {run.collectorId === "none" ? "—" : run.collectorId}
                  </td>
                  <td className="mono">{run.detectorId}</td>
                  <td className="mono">
                    {run.sinceDate} → {run.untilDate}
                  </td>
                  <td className="num">{run.postsSeen.toLocaleString("en-AU")}</td>
                  <td className="num">{run.postsNew.toLocaleString("en-AU")}</td>
                  <td className="num">{run.postsVerified.toLocaleString("en-AU")}</td>
                  <td className="num">{money(run.detectorCostUsd)}</td>
                  <td>
                    {["pending", "collecting", "detecting"].includes(run.status) && (
                      <form action={cancelRun} className="actions">
                        <input type="hidden" name="runId" value={run.id} />
                        <button className="small" type="submit">
                          Stop
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
