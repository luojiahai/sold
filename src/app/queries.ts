import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { detections, posts } from "@/db/schema";

export interface FeedFilters {
  /** verified | rejected | all */
  view?: string;
  state?: string;
  listingType?: string;
  q?: string;
}

/**
 * The feed query.
 *
 * Joins each post to its latest detection via the denormalised pointer, so
 * "show me verified listings" stays a single join even though detections are
 * append-only and a post may carry several competing verdicts.
 */
export function feedPosts(filters: FeedFilters, limit = 120) {
  const conditions = [sql`${posts.latestDetectionId} IS NOT NULL`];

  if (filters.view === "rejected") {
    conditions.push(
      sql`NOT (${detections.isListing} = 1 AND ${detections.isAustralia} = 1)`,
    );
  } else if (filters.view !== "all") {
    conditions.push(and(eq(detections.isListing, true), eq(detections.isAustralia, true))!);
  }

  if (filters.state) conditions.push(eq(detections.state, filters.state));
  if (filters.listingType) conditions.push(eq(detections.listingType, filters.listingType));
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      sql`(${posts.text} LIKE ${like} COLLATE NOCASE
        OR ${detections.suburb} LIKE ${like} COLLATE NOCASE
        OR ${detections.agency} LIKE ${like} COLLATE NOCASE
        OR ${posts.authorHandle} LIKE ${like} COLLATE NOCASE)`,
    );
  }

  return db
    .select({
      id: posts.id,
      url: posts.url,
      authorHandle: posts.authorHandle,
      text: posts.text,
      postedAt: posts.postedAt,
      thumbnailPath: posts.thumbnailPath,
      likeCount: posts.likeCount,
      isListing: detections.isListing,
      isAustralia: detections.isAustralia,
      confidence: detections.confidence,
      reason: detections.reason,
      listingType: detections.listingType,
      suburb: detections.suburb,
      state: detections.state,
      priceText: detections.priceText,
      agency: detections.agency,
    })
    .from(posts)
    .innerJoin(detections, eq(posts.latestDetectionId, detections.id))
    .where(and(...conditions))
    .orderBy(desc(sql`COALESCE(${posts.postedAt}, ${posts.collectedAt})`))
    .limit(limit)
    .all();
}

export function feedStats() {
  const row = db
    .select({
      total: sql<number>`COUNT(*)`,
      detected: sql<number>`SUM(CASE WHEN ${posts.latestDetectionId} IS NOT NULL THEN 1 ELSE 0 END)`,
      verified: sql<number>`SUM(CASE WHEN ${detections.isListing} = 1 AND ${detections.isAustralia} = 1 THEN 1 ELSE 0 END)`,
      listingNotAu: sql<number>`SUM(CASE WHEN ${detections.isListing} = 1 AND ${detections.isAustralia} = 0 THEN 1 ELSE 0 END)`,
      notListing: sql<number>`SUM(CASE WHEN ${detections.isListing} = 0 THEN 1 ELSE 0 END)`,
    })
    .from(posts)
    .leftJoin(detections, eq(posts.latestDetectionId, detections.id))
    .get();

  return {
    total: row?.total ?? 0,
    detected: row?.detected ?? 0,
    verified: row?.verified ?? 0,
    listingNotAu: row?.listingNotAu ?? 0,
    notListing: row?.notListing ?? 0,
  };
}

export function distinctValues() {
  const states = db
    .selectDistinct({ value: detections.state })
    .from(detections)
    .where(sql`${detections.state} IS NOT NULL AND ${detections.state} != ''`)
    .all()
    .map((r) => r.value!)
    .sort();

  const types = db
    .selectDistinct({ value: detections.listingType })
    .from(detections)
    .where(sql`${detections.listingType} IS NOT NULL`)
    .all()
    .map((r) => r.value!)
    .sort();

  return { states, types };
}
