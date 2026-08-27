import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { detections, keywords, posts, sessions } from "@/db/schema";
import { activeRunCount } from "@/harvest/lifecycle";

export interface ShellSummary {
  /** Posts whose latest verdict is a verified Australian listing. */
  verified: number;
  liveRuns: number;
  enabledTerms: number;
  /** The session a collector would use next, or null when none exists. */
  session: { label: string; status: string } | null;
}

/**
 * What the sidebar shows beside each section.
 *
 * Four cheap aggregate queries on every page render. The point is that "can I
 * run?" — is there a live session, is a run already going — is answered
 * before you open the page that would tell you.
 */
export function shellSummary(): ShellSummary {
  const verified =
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(posts)
      .innerJoin(detections, eq(posts.latestDetectionId, detections.id))
      .where(and(eq(detections.isListing, true), eq(detections.isAustralia, true)))
      .get()?.n ?? 0;

  const enabledTerms =
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(keywords)
      .where(eq(keywords.enabled, true))
      .get()?.n ?? 0;

  // Active first, then newest: the pill should say "expired" when there is a
  // session to fix, and "no session" only when there is nothing at all.
  const session =
    db
      .select({ label: sessions.label, status: sessions.status })
      .from(sessions)
      .orderBy(
        sql`CASE WHEN ${sessions.status} = 'active' THEN 0 ELSE 1 END`,
        desc(sessions.createdAt),
      )
      .get() ?? null;

  return { verified, liveRuns: activeRunCount(), enabledTerms, session };
}
