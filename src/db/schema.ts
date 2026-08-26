import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Schema notes
 * ------------
 * - Deliberately avoids SQLite-only constructs so the Postgres port is a
 *   dialect swap rather than a rewrite.
 * - `posts` is the immutable raw record. Detection verdicts never mutate it;
 *   they live in `detections`, one row per (post, detector, run).
 * - Timestamps are stored as ISO-8601 UTC strings for portability and because
 *   the prototype's queries are all range scans, not arithmetic.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/* ------------------------------------------------------------------ *
 * Sessions — burner platform credentials
 * ------------------------------------------------------------------ */

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(),
    /** Human label, e.g. "burner-01". Not the real account handle necessarily. */
    label: text("label").notNull(),
    /** Instagram sessionid cookie value. */
    sessionId: text("session_id").notNull(),
    /** Remaining cookies as JSON, e.g. csrftoken/ds_user_id/mid/ig_did. */
    cookies: text("cookies", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'`),
    /**
     * Reserved for collector-specific persisted state. Unused by the web-API
     * collector, which needs no device identity — the browser cookies are the
     * whole credential.
     */
    settingsPath: text("settings_path"),
    /** active | expired | challenged | untested */
    status: text("status").notNull().default("untested"),
    statusDetail: text("status_detail"),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("sessions_platform_status_idx").on(t.platform, t.status)],
);

/* ------------------------------------------------------------------ *
 * Keywords — the seed list, the system's highest-leverage tuning knob
 * ------------------------------------------------------------------ */

export const keywords = sqliteTable(
  "keywords",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull().default("instagram"),
    /** hashtag | keyword */
    kind: text("kind").notNull(),
    /** Bare term: no leading '#'. */
    term: text("term").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("keywords_platform_kind_term_idx").on(t.platform, t.kind, t.term)],
);

/* ------------------------------------------------------------------ *
 * Runs — one harvest (collect + detect) execution
 * ------------------------------------------------------------------ */

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    /** pending | collecting | detecting | completed | failed | cancelled */
    status: text("status").notNull().default("pending"),
    collectorId: text("collector_id").notNull(),
    detectorId: text("detector_id").notNull(),
    /** Full RunConfig as submitted, so a run is reproducible from its record. */
    config: text("config", { mode: "json" }).$type<unknown>().notNull(),
    sinceDate: text("since_date").notNull(),
    untilDate: text("until_date").notNull(),

    postsSeen: integer("posts_seen").notNull().default(0),
    postsNew: integer("posts_new").notNull().default(0),
    postsDetected: integer("posts_detected").notNull().default(0),
    postsVerified: integer("posts_verified").notNull().default(0),
    /** Sum of `total_cost_usd` reported by the detector across all calls. */
    detectorCostUsd: real("detector_cost_usd").notNull().default(0),

    error: text("error"),
    startedAt: text("started_at").notNull().default(now),
    /**
     * Touched on every progress write. Runs execute in-process, so a run whose
     * heartbeat has gone quiet is dead rather than slow — that distinction is
     * the only way to tell a stalled run from a working one.
     */
    heartbeatAt: text("heartbeat_at"),
    finishedAt: text("finished_at"),
  },
  (t) => [index("runs_status_started_idx").on(t.status, t.startedAt)],
);

/**
 * Per-term outcome for a run. Exists so a quiet week is distinguishable from a
 * truncated crawl: without `terminationReason`, every yield figure is
 * uninterpretable.
 */
export const runTerms = sqliteTable(
  "run_terms",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    /** hashtag | keyword */
    kind: text("kind").notNull(),
    term: text("term").notNull(),
    strategy: text("strategy").notNull(),
    postsSeen: integer("posts_seen").notNull().default(0),
    postsNew: integer("posts_new").notNull().default(0),
    postsInRange: integer("posts_in_range").notNull().default(0),
    pagesFetched: integer("pages_fetched").notNull().default(0),
    /** date_cutoff | budget_exhausted | source_exhausted | error */
    terminationReason: text("termination_reason"),
    error: text("error"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("run_terms_run_idx").on(t.runId)],
);

/** Append-only progress log, streamed to the run detail page. */
export const runEvents = sqliteTable(
  "run_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    /** debug | info | warn | error */
    level: text("level").notNull().default("info"),
    phase: text("phase").notNull(),
    message: text("message").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("run_events_run_id_idx").on(t.runId, t.id)],
);

/* ------------------------------------------------------------------ *
 * Posts — the normalised, platform-agnostic record
 * ------------------------------------------------------------------ */

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(),
    platformPostId: text("platform_post_id").notNull(),
    url: text("url").notNull(),

    authorHandle: text("author_handle"),
    authorName: text("author_name"),
    text: text("text").notNull().default(""),
    postedAt: text("posted_at"),

    /** image | video | carousel | unknown */
    mediaType: text("media_type").notNull().default("unknown"),
    /** Signed IG CDN URL. Expires within hours-to-days; kept for provenance. */
    thumbnailUrl: text("thumbnail_url"),
    /** Local cache path under data/media. This is what the UI renders. */
    thumbnailPath: text("thumbnail_path"),

    likeCount: integer("like_count"),
    commentCount: integer("comment_count"),
    hashtags: text("hashtags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    mentions: text("mentions", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    locationName: text("location_name"),

    /**
     * Untouched source payload. Kept so an unmapped field can be backfilled
     * from the database instead of re-crawling — re-crawling being the
     * expensive and risky operation here.
     */
    raw: text("raw", { mode: "json" }).$type<unknown>(),

    collectorId: text("collector_id").notNull(),
    firstSeenRunId: text("first_seen_run_id").references(() => runs.id),
    collectedAt: text("collected_at").notNull().default(now),
    lastSeenAt: text("last_seen_at").notNull().default(now),

    /** Denormalised pointer so the feed query stays a single join. */
    latestDetectionId: text("latest_detection_id"),
  },
  (t) => [
    uniqueIndex("posts_platform_post_idx").on(t.platform, t.platformPostId),
    index("posts_posted_at_idx").on(t.postedAt),
    index("posts_latest_detection_idx").on(t.latestDetectionId),
  ],
);

/** Which run saw which post — survives dedup, so per-term yield is attributable. */
export const runPosts = sqliteTable(
  "run_posts",
  {
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    /** The seed term that surfaced this post in this run. */
    term: text("term").notNull(),
    strategy: text("strategy").notNull(),
    isNew: integer("is_new", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("run_posts_pk").on(t.runId, t.postId, t.term),
    index("run_posts_post_idx").on(t.postId),
  ],
);

/* ------------------------------------------------------------------ *
 * Detections — one row per (post, detector, run). Never overwritten.
 * ------------------------------------------------------------------ */

export const detections = sqliteTable(
  "detections",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => runs.id, { onDelete: "set null" }),
    detectorId: text("detector_id").notNull(),
    model: text("model"),

    isListing: integer("is_listing", { mode: "boolean" }).notNull(),
    isAustralia: integer("is_australia", { mode: "boolean" }).notNull(),
    confidence: integer("confidence").notNull().default(0),
    reason: text("reason"),

    /** for_sale | auction | rent | sold | off_market | other | null */
    listingType: text("listing_type"),
    suburb: text("suburb"),
    state: text("state"),
    priceText: text("price_text"),
    agency: text("agency"),

    costUsd: real("cost_usd"),
    /** true when this verdict came from the per-post fallback path. */
    viaFallback: integer("via_fallback", { mode: "boolean" }).notNull().default(false),
    error: text("error"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [
    index("detections_post_idx").on(t.postId, t.createdAt),
    index("detections_verified_idx").on(t.isListing, t.isAustralia),
    index("detections_run_idx").on(t.runId),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type RunTerm = typeof runTerms.$inferSelect;
export type RunEvent = typeof runEvents.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Detection = typeof detections.$inferSelect;
