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
