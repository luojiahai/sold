/**
 * The Collector contract.
 *
 * Every collector — regardless of platform, cost tier, or access technique —
 * emits the same `CollectedPost` shape. That uniformity is the whole point:
 * the storage layer, the detector, and the UI never learn that Instagram's
 * pagination cursors are base64-wrapped JSON, or that one vendor charges per
 * thousand posts while another charges per minute of browser time.
 */

export type Platform = "instagram" | "x" | "tiktok";

export type TermKind = "hashtag" | "keyword";

/**
 * Why a term stopped producing posts. Without this a truncated crawl is
 * indistinguishable from a quiet week, and every yield metric derived from the
 * run becomes uninterpretable.
 */
export type TerminationReason =
  | "date_cutoff"
  | "budget_exhausted"
  | "source_exhausted"
  | "error";

export interface CollectorTerm {
  kind: TermKind;
  /** Bare term — no leading '#'. */
  term: string;
}

export interface CollectRequest {
  runId: string;
  terms: CollectorTerm[];
  /** Inclusive ISO date (YYYY-MM-DD), interpreted in UTC. */
  since: string;
  /** Inclusive ISO date (YYYY-MM-DD), interpreted in UTC. */
  until: string;
  /** Hard ceiling on pages fetched per term — the backstop against runaway crawls. */
  maxPagesPerTerm: number;
  /** Hard ceiling on posts kept per term. */
  maxPostsPerTerm: number;
  /** Seconds between requests; a range, sampled uniformly, to avoid a metronome signature. */
  delayRange: [number, number];
  /** Collector-specific options (e.g. which strategies to enable). */
  options?: Record<string, unknown>;
}

/** The normalised, platform-agnostic post. Identical across every collector. */
export interface CollectedPost {
  platform: Platform;
  platformPostId: string;
  url: string;
  authorHandle: string | null;
  authorName: string | null;
  text: string;
  /** ISO-8601 UTC, or null when the source doesn't expose a timestamp. */
  postedAt: string | null;
  mediaType: "image" | "video" | "carousel" | "unknown";
  thumbnailUrl: string | null;
  likeCount: number | null;
  commentCount: number | null;
  hashtags: string[];
  mentions: string[];
  locationName: string | null;
  /** Untouched source payload, preserved so unmapped fields can be backfilled. */
  raw: unknown;
  /** The seed term that surfaced this post. */
  sourceTerm: string;
  /** The strategy that surfaced it, e.g. "hashtag_recent" or "keyword_serp". */
  sourceStrategy: string;
}

/** Emitted as collection proceeds, so the UI shows progress rather than a spinner. */
export type CollectEvent =
  | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string }
  | { type: "post"; post: CollectedPost }
  | {
      type: "term_complete";
      kind: TermKind;
      term: string;
      strategy: string;
      postsSeen: number;
      postsInRange: number;
      pagesFetched: number;
      terminationReason: TerminationReason;
      error?: string;
    }
  | { type: "session_expired"; message: string };

export interface CollectorCapabilities {
  platform: Platform;
  /** Can this collector stop early once posts fall outside the date range? */
  supportsDateCutoff: boolean;
  strategies: string[];
  /** Rough cost signal shown in the UI so the choice is informed. */
  costTier: "free" | "low" | "medium" | "high";
}

export interface Collector {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: CollectorCapabilities;
  /** False for placeholders; the UI shows them but won't let you start a run. */
  readonly implemented: boolean;
  /**
   * Preflight check — verifies credentials and reachability before a run
   * commits twenty minutes to a doomed crawl.
   */
  preflight(): Promise<{ ok: boolean; detail: string }>;
  collect(request: CollectRequest): AsyncIterable<CollectEvent>;
}

/** Thrown when a collector's credentials are dead. Aborts the run immediately. */
export class SessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/** Thrown by placeholder collectors. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented in the prototype.`);
    this.name = "NotImplementedError";
  }
}
