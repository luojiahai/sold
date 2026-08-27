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

export type PricePeriod = "once" | "week" | "month" | "year";

export type PriceQualifier =
  | "exact"
  | "from"
  | "range"
  | "offers_over"
  | "guide"
  | "undisclosed"
  | "contact_agent";

/**
 * A verdict.
 *
 * Deliberately flat rather than nesting `address` and `price` sub-objects: the
 * table it lands in is flat — these fields exist to be filtered and grouped on,
 * not stored as a blob — so nesting would add a mapping layer at the database
 * boundary whose only job is to undo itself.
 *
 * Every extracted field is null unless it was literally written in the post.
 * Nothing here is inferred: the whole value of `addressText` is that you can
 * check it against the caption, and that stops being true the moment any
 * sibling field can be invented.
 */
export interface DetectionVerdict {
  postId: string;
  isListing: boolean;
  isAustralia: boolean;
  /** 0-100. */
  confidence: number;
  reason: string;
  listingType: ListingType | null;

  /** The address exactly as the post wrote it. The auditable record. */
  addressText: string | null;
  unit: string | null;
  streetNumber: string | null;
  street: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  /**
   * Null when unknown. Greater than 1 means the post advertises several
   * properties and the address fields describe only the first — partial data,
   * but flagged as partial rather than passed off as complete.
   */
  propertyCount: number | null;

  /** The price exactly as written. This is what the UI renders. */
  priceText: string | null;
  /* Derived from `priceText` by `parsePrice`, never asked of the model. */
  priceMin: number | null;
  priceMax: number | null;
  pricePeriod: PricePeriod | null;
  /** ISO code. */
  priceCurrency: string | null;
  priceQualifier: PriceQualifier | null;

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
  /**
   * Which revision of this detector's prompt is current.
   *
   * Recorded on every verdict for the same reason `model` is — the prompt is at
   * least as large a determinant of an answer — and it is what the re-detection
   * tool selects on when replaying a corpus through a newer prompt.
   */
  readonly promptVersion: number;
  readonly capabilities: DetectorCapabilities;
  readonly implemented: boolean;
  preflight(): Promise<{ ok: boolean; detail: string }>;
  detect(posts: DetectorInput[]): AsyncIterable<DetectEvent>;
}
