/**
 * The Detector contract.
 *
 * A detector answers two questions that are deliberately separate booleans:
 * "is this a property listing?" and "is it in Australia?". Collapsing them
 * loses the diagnostic signal — a post rejected for locale is a different
 * problem from a post rejected for relevance, and the run stats need to show
 * that split to be worth reading.
 */

export interface DetectorInput {
  postId: string;
  text: string;
  authorHandle: string | null;
  hashtags: string[];
  locationName: string | null;
  postedAt: string | null;
  url: string;
  /** Local thumbnail path; used only by multimodal detectors. */
  thumbnailPath: string | null;
}

export type ListingType =
  | "for_sale"
  | "auction"
  | "rent"
  | "sold"
  | "off_market"
  | "other";

export interface DetectionVerdict {
  postId: string;
  isListing: boolean;
  isAustralia: boolean;
  /** 0-100. */
  confidence: number;
  reason: string;
  listingType: ListingType | null;
  suburb: string | null;
  state: string | null;
  priceText: string | null;
  agency: string | null;
  /** True when this verdict came from the per-post fallback path. */
  viaFallback?: boolean;
  error?: string;
}

export interface DetectBatchResult {
  verdicts: DetectionVerdict[];
  /** USD reported by the underlying tool, when it reports one. */
  costUsd: number;
}

export type DetectEvent =
  | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string }
  | { type: "verdicts"; verdicts: DetectionVerdict[]; costUsd: number };

export interface DetectorCapabilities {
  multimodal: boolean;
  batchSize: number;
  concurrency: number;
  costTier: "free" | "low" | "medium" | "high";
}

export interface Detector {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly model: string | null;
  readonly capabilities: DetectorCapabilities;
  readonly implemented: boolean;
  preflight(): Promise<{ ok: boolean; detail: string }>;
  detect(posts: DetectorInput[]): AsyncIterable<DetectEvent>;
}
