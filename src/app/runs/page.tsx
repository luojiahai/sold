import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { keywords, runs } from "@/db/schema";
import { COLLECTORS } from "@/collectors/registry";
import { DETECTORS } from "@/detectors/registry";
import { money, relativeTime } from "../format";
import { isStalled } from "@/harvest/lifecycle";
import { cancelRun } from "./cancel-action";
import { NewRunForm } from "./new-run-form";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  completed: "ok",
  failed: "bad",
  cancelled: "",
  collecting: "accent live",
  detecting: "accent live",
  pending: "",
};

const LIVE = ["pending", "collecting", "detecting"];

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
        <div>
          <h1>Harvest runs</h1>
          <p className="lede">
            A run collects posts for a date range, then classifies everything that
            doesn&apos;t already have a verdict. Collector and detector are both
            interchangeable — that&apos;s the architecture the prototype exists to
            demonstrate.
          </p>
        </div>
      </div>

      <NewRunForm
        collectors={collectors}
        detectors={detectors}
        enabledHashtags={enabled.filter((k) => k.kind === "hashtag").length}
        enabledKeywords={enabled.filter((k) => k.kind === "keyword").length}
      />

      <h2>History</h2>
      {history.length === 0 ? (
        <div className="empty">
          <b>No runs yet.</b>
          <p className="small" style={{ margin: 0 }}>
            Configure a collector and detector above, then start a harvest.
          </p>
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
              {history.map((run) => {
                const live = LIVE.includes(run.status);
                return (
                  <tr key={run.id}>
                    <td>
                      <Link href={`/runs/${run.id}`}>{relativeTime(run.startedAt)}</Link>
                      <div className="small faint mono">{run.id.slice(0, 8)}</div>
                    </td>
                    <td>
                      <span className={`tag ${STATUS_TONE[run.status] ?? ""}`}>
                        {live && <span className="dot" />}
                        {run.status}
                      </span>
                      {isStalled(run) && (
                        <div style={{ marginTop: 4 }}>
                          <span className="tag warn">stalled</span>
                        </div>
                      )}
                    </td>
                    <td className="small mono">{run.collectorId}</td>
                    <td className="small mono">{run.detectorId}</td>
                    <td className="small mono faint">
                      {run.sinceDate} → {run.untilDate}
                    </td>
                    <td className="num">{run.postsSeen}</td>
                    <td className="num">{run.postsNew}</td>
                    <td className="num">
                      {run.postsVerified > 0 ? (
                        <b>{run.postsVerified}</b>
                      ) : (
                        <span className="faint">0</span>
                      )}
                    </td>
                    <td className="num small">{money(run.detectorCostUsd)}</td>
                    <td>
                      {live && (
                        <form action={cancelRun}>
                          <input type="hidden" name="runId" value={run.id} />
                          <button className="small danger" type="submit">
                            Stop
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
