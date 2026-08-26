import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { keywords, runs } from "@/db/schema";
import { COLLECTORS } from "@/collectors/registry";
import { DETECTORS } from "@/detectors/registry";
import { money, relativeTime } from "../format";
import { NewRunForm } from "./new-run-form";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  completed: "ok",
  failed: "bad",
  collecting: "accent",
  detecting: "accent",
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
      <h1>Harvest runs</h1>
      <p className="lede">
        A run collects posts for a date range, then classifies everything that
        doesn&apos;t already have a verdict. Collector and detector are both
        interchangeable — that&apos;s the architecture the prototype exists to
        demonstrate.
      </p>

      <NewRunForm
        collectors={collectors}
        detectors={detectors}
        enabledHashtags={enabled.filter((k) => k.kind === "hashtag").length}
        enabledKeywords={enabled.filter((k) => k.kind === "keyword").length}
      />

      <h2>History</h2>
      {history.length === 0 ? (
        <div className="empty">No runs yet.</div>
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
                <th>Seen</th>
                <th>New</th>
                <th>Verified</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link href={`/runs/${run.id}`}>{relativeTime(run.startedAt)}</Link>
                  </td>
                  <td>
                    <span className={`tag ${STATUS_TONE[run.status] ?? ""}`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="small">{run.collectorId}</td>
                  <td className="small">{run.detectorId}</td>
                  <td className="small mono">
                    {run.sinceDate} → {run.untilDate}
                  </td>
                  <td>{run.postsSeen}</td>
                  <td>{run.postsNew}</td>
                  <td>{run.postsVerified}</td>
                  <td className="small">{money(run.detectorCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
