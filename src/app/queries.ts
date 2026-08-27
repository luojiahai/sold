import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { detections, posts } from "@/db/schema";
import { normaliseState } from "@/lib/property";

export interface FeedFilters {
  /** verified | rejected | all */
  view?: string;
  state?: string;
  listingType?: string;
  q?: string;
  /** "1" to show only listings with a street-level address. */
  hasAddress?: string;
}

/**
 * Every raw spelling that canonicalises to `canonical`.
 *
 * State is normalised as verdicts are written, but detections are append-only
 * and historical rows were written before that — so the column still holds
 * "Victoria" alongside "VIC". Normalising at read time keeps the filter
 * dropdown from fragmenting; this is what keeps the filter itself matching the
 * rows behind those older spellings.
 */
function stateVariants(canonical: string): string[] {
  return db
    .selectDistinct({ value: detections.state })
    .from(detections)
    .where(sql`${detections.state} IS NOT NULL AND ${detections.state} != ''`)
    .all()
    .map((row) => row.value!)
    .filter((value) => normaliseState(value) === canonical);
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

  if (filters.state) {
    const variants = stateVariants(filters.state);
    conditions.push(
      variants.length > 0 ? inArray(detections.state, variants) : sql`1 = 0`,
    );
  }
  if (filters.listingType) conditions.push(eq(detections.listingType, filters.listingType));
  // `street` rather than `addressText`: a post can write "West Melbourne VIC"
  // as its address, and that is a locality, not somewhere you can knock.
  if (filters.hasAddress === "1") conditions.push(sql`${detections.street} IS NOT NULL`);
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      sql`(${posts.text} LIKE ${like} COLLATE NOCASE
        OR ${detections.suburb} LIKE ${like} COLLATE NOCASE
        OR ${detections.street} LIKE ${like} COLLATE NOCASE
        OR ${detections.addressText} LIKE ${like} COLLATE NOCASE
        OR ${detections.postcode} LIKE ${like} COLLATE NOCASE
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
      addressText: detections.addressText,
      street: detections.street,
      suburb: detections.suburb,
      state: detections.state,
      postcode: detections.postcode,
      propertyCount: detections.propertyCount,
      priceText: detections.priceText,
      agency: detections.agency,
    })
    .from(posts)
    .innerJoin(detections, eq(posts.latestDetectionId, detections.id))
    .where(and(...conditions))
    .orderBy(desc(sql`COALESCE(${posts.postedAt}, ${posts.collectedAt})`))
    .limit(limit)
    .all()
    // Older verdicts wrote the state however the model phrased it. Show the
    // canonical form when it is recognisable, and the row as written when it
    // isn't — the stored value is never touched either way.
    .map((row) => ({ ...row, state: normaliseState(row.state) ?? row.state }));
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
  // Normalised and de-duplicated here rather than rewritten in the table:
  // detections are append-only, and a migration that edited historical verdicts
  // would break the head-to-head comparability that invariant exists to give.
  const states = [
    ...new Set(
      db
        .selectDistinct({ value: detections.state })
        .from(detections)
        .where(sql`${detections.state} IS NOT NULL AND ${detections.state} != ''`)
        .all()
        .map((r) => normaliseState(r.value))
        .filter((v) => v !== null),
    ),
  ].sort();

  const types = db
    .selectDistinct({ value: detections.listingType })
    .from(detections)
    .where(sql`${detections.listingType} IS NOT NULL`)
    .all()
    .map((r) => r.value!)
    .sort();

  return { states, types };
}

/**
 * Every dollar the detector has reported, across every verdict ever written.
 *
 * Detections are append-only, so re-detections count too — they cost money
 * as surely as a first pass did, and "what has this experiment cost" is one
 * of the five questions the prototype exists to answer.
 */
export function detectorSpend() {
  const row = db
    .select({
      spend: sql<number>`COALESCE(SUM(${detections.costUsd}), 0)`,
      verdicts: sql<number>`COUNT(*)`,
    })
    .from(detections)
    .get();

  return { spend: row?.spend ?? 0, verdicts: row?.verdicts ?? 0 };
}

/**
 * Verified listings first collected on each of the last `days` days, oldest
 * first, with quiet days filled in as zero.
 *
 * Keyed on `collectedAt` — when SOLD found the post, not when it was written —
 * because "is the harvest producing" is the question a sparkline on the feed
 * answers. Days are UTC, matching the stored timestamps.
 */
export function verifiedByDay(days = 7): { day: string; count: number }[] {
  const dayOf = (offset: number) =>
    new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const since = dayOf(days - 1);

  const rows = db
    .select({
      day: sql<string>`substr(${posts.collectedAt}, 1, 10)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(posts)
    .innerJoin(detections, eq(posts.latestDetectionId, detections.id))
    .where(
      and(
        eq(detections.isListing, true),
        eq(detections.isAustralia, true),
        sql`${posts.collectedAt} >= ${since}`,
      ),
    )
    .groupBy(sql`substr(${posts.collectedAt}, 1, 10)`)
    .all();

  const byDay = new Map(rows.map((r) => [r.day, r.count]));
  return Array.from({ length: days }, (_, i) => {
    const day = dayOf(days - 1 - i);
    return { day, count: byDay.get(day) ?? 0 };
  });
}
