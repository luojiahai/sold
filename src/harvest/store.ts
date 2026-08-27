import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { detections, posts, runEvents, runPosts, runTerms, runs } from "@/db/schema";
import { newId, nowIso } from "@/lib/id";
import type { CollectedPost, TermKind, TerminationReason } from "@/collectors/types";
import type { DetectionVerdict } from "@/detectors/types";

/** Append-only run log, read by the run detail page. */
export function logEvent(
  runId: string,
  phase: string,
  message: string,
  level: "debug" | "info" | "warn" | "error" = "info",
): void {
  db.insert(runEvents).values({ runId, phase, message, level }).run();
  db.update(runs).set({ heartbeatAt: nowIso() }).where(eq(runs.id, runId)).run();
}

/**
 * Upserts a collected post.
 *
 * Dedup is on (platform, platformPostId). Re-collection refreshes the mutable
 * facts — engagement counts move, captions can be edited — but never rewrites
 * provenance: `firstSeenRunId` and `collectedAt` record when this post entered
 * the system, and an already-detected post is never re-queued for detection.
 */
export function upsertPost(
  post: CollectedPost,
  runId: string,
  collectorId: string,
  thumbnailPath: string | null,
): { id: string; isNew: boolean } {
  const existing = db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.platform, post.platform),
        eq(posts.platformPostId, post.platformPostId),
      ),
    )
    .get();

  if (existing) {
    db.update(posts)
      .set({
        lastSeenAt: nowIso(),
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        text: post.text,
        // Refresh the signed URL, and backfill the cache if it was missed before.
        thumbnailUrl: post.thumbnailUrl,
        ...(thumbnailPath ? { thumbnailPath } : {}),
      })
      .where(eq(posts.id, existing.id))
      .run();
    return { id: existing.id, isNew: false };
  }

  const id = newId();
  db.insert(posts)
    .values({
      id,
      platform: post.platform,
      platformPostId: post.platformPostId,
      url: post.url,
      authorHandle: post.authorHandle,
      authorName: post.authorName,
      text: post.text,
      postedAt: post.postedAt,
      mediaType: post.mediaType,
      thumbnailUrl: post.thumbnailUrl,
      thumbnailPath,
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      hashtags: post.hashtags,
      mentions: post.mentions,
      locationName: post.locationName,
      raw: post.raw,
      collectorId,
      firstSeenRunId: runId,
    })
    .run();

  return { id, isNew: true };
}

/** Records that a run saw a post via a given term — survives dedup. */
export function linkRunPost(
  runId: string,
  postId: string,
  term: string,
  strategy: string,
  isNew: boolean,
): void {
  db.insert(runPosts)
    .values({ runId, postId, term, strategy, isNew })
    .onConflictDoNothing()
    .run();
}

export function recordTerm(
  runId: string,
  kind: TermKind,
  term: string,
  strategy: string,
  stats: {
    postsSeen: number;
    postsInRange: number;
    postsNew: number;
    pagesFetched: number;
    terminationReason: TerminationReason;
    error?: string;
  },
): void {
  db.insert(runTerms)
    .values({ id: newId(), runId, kind, term, strategy, ...stats, error: stats.error ?? null })
    .run();
}

/**
 * Writes a verdict and repoints the post at it.
 *
 * Detections are append-only: a re-run under a different detector adds a row
 * rather than replacing one, so two detectors' verdicts on the same post stay
 * comparable. `latestDetectionId` is the denormalised pointer that keeps the
 * feed query a single join.
 */
export function saveDetection(
  verdict: DetectionVerdict,
  runId: string,
  detectorId: string,
  model: string | null,
  promptVersion: number,
  costUsd: number,
): void {
  const id = newId();
  db.insert(detections)
    .values({
      id,
      postId: verdict.postId,
      runId,
      detectorId,
      model,
      promptVersion,
      isListing: verdict.isListing,
      isAustralia: verdict.isAustralia,
      confidence: verdict.confidence,
      reason: verdict.reason,
      listingType: verdict.listingType,
      addressText: verdict.addressText,
      unit: verdict.unit,
      streetNumber: verdict.streetNumber,
      street: verdict.street,
      suburb: verdict.suburb,
      state: verdict.state,
      postcode: verdict.postcode,
      propertyCount: verdict.propertyCount,
      priceText: verdict.priceText,
      priceMin: verdict.priceMin,
      priceMax: verdict.priceMax,
      pricePeriod: verdict.pricePeriod,
      priceCurrency: verdict.priceCurrency,
      priceQualifier: verdict.priceQualifier,
      agency: verdict.agency,
      costUsd,
      viaFallback: verdict.viaFallback ?? false,
      error: verdict.error ?? null,
    })
    .run();

  db.update(posts)
    .set({ latestDetectionId: id })
    .where(eq(posts.id, verdict.postId))
    .run();
}

/** Posts with no verdict yet — the detector's work queue. */
export function undetectedPosts(limit = 500) {
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
    .where(sql`${posts.latestDetectionId} IS NULL`)
    .limit(limit)
    .all();
}

export function updateRun(runId: string, patch: Partial<typeof runs.$inferInsert>): void {
  db.update(runs).set(patch).where(eq(runs.id, runId)).run();
}

export function bumpRunCounters(
  runId: string,
  delta: Partial<Record<"postsSeen" | "postsNew" | "postsDetected" | "postsVerified", number>>,
  costDelta = 0,
): void {
  db.update(runs)
    .set({
      ...(delta.postsSeen ? { postsSeen: sql`${runs.postsSeen} + ${delta.postsSeen}` } : {}),
      ...(delta.postsNew ? { postsNew: sql`${runs.postsNew} + ${delta.postsNew}` } : {}),
      ...(delta.postsDetected
        ? { postsDetected: sql`${runs.postsDetected} + ${delta.postsDetected}` }
        : {}),
      ...(delta.postsVerified
        ? { postsVerified: sql`${runs.postsVerified} + ${delta.postsVerified}` }
        : {}),
      ...(costDelta ? { detectorCostUsd: sql`${runs.detectorCostUsd} + ${costDelta}` } : {}),
      heartbeatAt: nowIso(),
    })
    .where(eq(runs.id, runId))
    .run();
}
