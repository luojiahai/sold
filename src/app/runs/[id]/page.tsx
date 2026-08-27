import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { runEvents, runTerms, runs } from "@/db/schema";
import { TERMINATION_LABELS, terminationTone } from "../../format";
import { isStalled } from "@/harvest/lifecycle";
import { cancelRun } from "../cancel-action";
import { RunMonitor } from "./run-monitor";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const run = db.select().from(runs).where(eq(runs.id, id)).get();
  if (!run) notFound();

  const events = db
    .select()
    .from(runEvents)
    .where(eq(runEvents.runId, id))
    .orderBy(asc(runEvents.id))
    .all();

  const terms = db.select().from(runTerms).where(eq(runTerms.runId, id)).all();
  // A re-detection collects nothing, so it has no terms — and an empty
  // "no terms yet" section would read as work still to come.
  const redetect = run.kind === "redetect";
  const truncated = terms.filter((t) => t.terminationReason === "budget_exhausted").length;

  return (
    <>
      <p className="backlink">
        <Link href="/runs">← All runs</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>
            {redetect ? "Re-detection" : "Run"}{" "}
            <span className="mono">{run.id.slice(0, 8)}</span>
          </h1>
          <p className="lede">
            {!redetect && (
              <>
                <span className="mono">{run.collectorId}</span> →{" "}
              </>
            )}
            <span className="mono">{run.detectorId}</span> · {run.sinceDate} to{" "}
            {run.untilDate}
            {redetect && " (the span of the posts it re-read)"}
          </p>
        </div>
        {["pending", "collecting", "detecting"].includes(run.status) && (
          <form action={cancelRun}>
            <input type="hidden" name="runId" value={run.id} />
            <button type="submit">Stop this run</button>
          </form>
        )}
      </div>

      {isStalled(run) && (
        <div className="banner warn">
          <b>This run has stalled.</b> It is still marked <code>{run.status}</code>, but it
          has not written progress in over two minutes — runs execute in-process, so the
          process running it has almost certainly exited. Stopping it just brings the
          record in line with reality; no work is lost.
        </div>
      )}

      <RunMonitor runId={run.id} initialRun={run} initialEvents={events} />

      {!redetect && <h2>Per-term outcome</h2>}
      {redetect ? null : terms.length === 0 ? (
        <p className="small muted">No terms have finished yet.</p>
      ) : (
        <>
          {truncated > 0 && (
            <div className="banner warn">
              {truncated} of {terms.length} term(s) stopped on their page budget rather
              than reaching the date cutoff. Those counts are a floor, not a measurement —
              raise the budget to see how much more is there.
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Strategy</th>
                  <th className="num">Pages</th>
                  <th className="num">Seen</th>
                  <th className="num">In range</th>
                  <th className="num">New</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.id}>
                    <td className="nowrap">
                      <b>{term.kind === "hashtag" ? `#${term.term}` : term.term}</b>
                    </td>
                    <td className="mono">{term.strategy}</td>
                    <td className="num">{term.pagesFetched}</td>
                    <td className="num">{term.postsSeen}</td>
                    <td className="num">{term.postsInRange}</td>
                    <td className="num">{term.postsNew}</td>
                    <td>
                      <span className={`tag ${terminationTone(term.terminationReason)}`}>
                        {TERMINATION_LABELS[term.terminationReason ?? ""] ??
                          term.terminationReason}
                      </span>
                      {term.error && (
                        <div className="small muted" style={{ marginTop: 4 }}>
                          {term.error}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Configuration</h2>
      <pre className="log" style={{ maxHeight: 260 }}>
        {JSON.stringify(run.config, null, 2)}
      </pre>
    </>
  );
}
