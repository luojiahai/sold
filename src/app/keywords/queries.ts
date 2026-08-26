import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { runTerms } from "@/db/schema";

/**
 * Per-term yield, aggregated across every run that used the term.
 *
 * This is the feedback loop that makes the seed list tunable: a term that has
 * been crawled repeatedly and never produced a verified listing is costing
 * requests for nothing.
 */
export function termYield() {
  return db
    .select({
      term: runTerms.term,
      kind: runTerms.kind,
      runs: sql<number>`COUNT(DISTINCT ${runTerms.runId})`,
      postsSeen: sql<number>`SUM(${runTerms.postsSeen})`,
      postsInRange: sql<number>`SUM(${runTerms.postsInRange})`,
      postsNew: sql<number>`SUM(${runTerms.postsNew})`,
      truncated: sql<number>`SUM(CASE WHEN ${runTerms.terminationReason} = 'budget_exhausted' THEN 1 ELSE 0 END)`,
    })
    .from(runTerms)
    .groupBy(runTerms.term, runTerms.kind)
    .all();
}

/** Verified-listing counts per seed term, joined through run_posts. */
export function verifiedByTerm(): Map<string, number> {
  const rows = db.all<{ term: string; verified: number }>(sql`
    SELECT rp.term AS term, COUNT(DISTINCT rp.post_id) AS verified
    FROM run_posts rp
    JOIN posts p ON p.id = rp.post_id
    JOIN detections d ON d.id = p.latest_detection_id
    WHERE d.is_listing = 1 AND d.is_australia = 1
    GROUP BY rp.term
  `);
  return new Map(rows.map((r) => [r.term, Number(r.verified)]));
}
