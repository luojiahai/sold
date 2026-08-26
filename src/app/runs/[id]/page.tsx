import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { runEvents, runTerms, runs } from "@/db/schema";
import { TERMINATION_LABELS, terminationTone } from "../../format";
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
  const truncated = terms.filter((t) => t.terminationReason === "budget_exhausted").length;

  return (
    <>
      <p className="small muted" style={{ margin: "0 0 6px" }}>
        <Link href="/runs">← All runs</Link>
      </p>
      <h1>Run {run.id.slice(0, 8)}</h1>
      <p className="lede">
        {run.collectorId} → {run.detectorId} · {run.sinceDate} to {run.untilDate}
      </p>

      <RunMonitor runId={run.id} initialRun={run} initialEvents={events} />

      <h2>Per-term outcome</h2>
      {terms.length === 0 ? (
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
                  <th>Pages</th>
                  <th>Seen</th>
                  <th>In range</th>
                  <th>New</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.id}>
                    <td>
                      <b>{term.kind === "hashtag" ? `#${term.term}` : term.term}</b>
                    </td>
                    <td className="small mono">{term.strategy}</td>
                    <td>{term.pagesFetched}</td>
                    <td>{term.postsSeen}</td>
                    <td>{term.postsInRange}</td>
                    <td>{term.postsNew}</td>
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
      <pre className="log mono" style={{ maxHeight: 260 }}>
        {JSON.stringify(run.config, null, 2)}
      </pre>
    </>
  );
}
