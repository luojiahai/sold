export function relativeTime(iso: string | null): string {
  if (!iso) return "unknown date";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown date";

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const LISTING_TYPE_LABELS: Record<string, string> = {
  for_sale: "For sale",
  auction: "Auction",
  rent: "Rent",
  sold: "Sold",
  off_market: "Off-market",
  other: "Other",
};

export const TERMINATION_LABELS: Record<string, string> = {
  date_cutoff: "Reached date cutoff",
  budget_exhausted: "Hit page/post budget",
  source_exhausted: "Source ran out",
  error: "Errored",
};

/**
 * `budget_exhausted` is the one that matters: it means the crawl was truncated,
 * so any yield figure derived from it is a floor, not a measurement.
 */
export function terminationTone(reason: string | null): string {
  if (reason === "date_cutoff" || reason === "source_exhausted") return "ok";
  if (reason === "budget_exhausted") return "warn";
  if (reason === "error") return "bad";
  return "";
}

export const money = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

export const PRICE_QUALIFIER_LABELS: Record<string, string> = {
  exact: "exact",
  from: "from",
  range: "range",
  offers_over: "offers over",
  guide: "guide",
  undisclosed: "undisclosed",
  contact_agent: "contact agent",
};

const PRICE_PERIOD_LABELS: Record<string, string> = {
  once: "",
  week: "per week",
  month: "per month",
  year: "per year",
};

/**
 * The parsed price, rendered for the detail page only.
 *
 * The feed always shows `priceText` as the post wrote it — these numbers exist
 * to be filtered and grouped on, and showing a derived figure where a quoted
 * one belongs would put a number in front of the user that the post never said.
 * Here, beside the verbatim string, the derivation is the point.
 */
export function formatParsedPrice(detection: {
  priceMin: number | null;
  priceMax: number | null;
  pricePeriod: string | null;
  priceCurrency: string | null;
  priceQualifier: string | null;
}): string | null {
  const qualifier = detection.priceQualifier
    ? PRICE_QUALIFIER_LABELS[detection.priceQualifier] ?? detection.priceQualifier
    : null;

  if (detection.priceMin === null && detection.priceMax === null) return qualifier;

  const amount = (n: number) => n.toLocaleString("en-AU");
  const span =
    detection.priceMin !== null && detection.priceMax !== null
      ? detection.priceMin === detection.priceMax
        ? amount(detection.priceMin)
        : `${amount(detection.priceMin)}–${amount(detection.priceMax)}`
      : `${amount((detection.priceMin ?? detection.priceMax)!)}+`;

  const period = detection.pricePeriod ? PRICE_PERIOD_LABELS[detection.pricePeriod] ?? "" : "";

  return [span, detection.priceCurrency, period, qualifier && `(${qualifier})`]
    .filter(Boolean)
    .join(" ");
}
