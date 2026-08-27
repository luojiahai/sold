/**
 * Property field normalisation.
 *
 * Lives in `lib` rather than under `src/detectors/` because it has consumers on
 * both sides of the detector interface: the detector's Zod transform canonicalises
 * what the model returns, and the query layer canonicalises historical values at
 * read time. Putting it in the detector would make the query layer import from an
 * implementation the interface exists to keep it away from.
 *
 * Every function here is pure and conservative. The parser in particular returns
 * null rather than guessing: a wrong number written into `priceMin` is permanent
 * and silent, whereas a null is visibly missing.
 */

/* ------------------------------------------------------------------ *
 * State / territory
 * ------------------------------------------------------------------ */

export const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;

export type AuState = (typeof AU_STATES)[number];

const STATE_LOOKUP: Record<string, AuState> = {
  NSW: "NSW",
  NEWSOUTHWALES: "NSW",
  VIC: "VIC",
  VICTORIA: "VIC",
  QLD: "QLD",
  QUEENSLAND: "QLD",
  WA: "WA",
  WESTERNAUSTRALIA: "WA",
  SA: "SA",
  SOUTHAUSTRALIA: "SA",
  TAS: "TAS",
  TASMANIA: "TAS",
  ACT: "ACT",
  AUSTRALIANCAPITALTERRITORY: "ACT",
  NT: "NT",
  NORTHERNTERRITORY: "NT",
};

/**
 * Canonicalises a state to its abbreviation, or null if it isn't one.
 *
 * Null rather than passthrough: the feed's state filter is built from the
 * distinct values in this column, so an unrecognised string would become a
 * dropdown option that matches one post and means nothing.
 */
export function normaliseState(raw: string | null | undefined): AuState | null {
  if (!raw) return null;
  const key = raw.replace(/[^a-z]/gi, "").toUpperCase();
  return STATE_LOOKUP[key] ?? null;
}

/* ------------------------------------------------------------------ *
 * Suburb
 * ------------------------------------------------------------------ */

/**
 * Title-cases a suburb, but only when the input carries no case information of
 * its own. "WEST MELBOURNE" and "west melbourne" are shouting and sloppiness
 * respectively; "McMahons Point" and "Kurrajong Heights" are deliberate, and
 * blind title-casing would corrupt the first of those.
 */
export function normaliseSuburb(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  if (hasLower && hasUpper) return trimmed;

  return trimmed
    .toLowerCase()
    .replace(/(^|[\s'\-’])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/* ------------------------------------------------------------------ *
 * Postcode
 * ------------------------------------------------------------------ */

/** Australian postcodes are exactly four digits. Anything else isn't one. */
export function normalisePostcode(raw: string | null | undefined): string | null {
  const digits = raw?.trim();
  return digits && /^\d{4}$/.test(digits) ? digits : null;
}

/* ------------------------------------------------------------------ *
 * Price
 * ------------------------------------------------------------------ */

export type PricePeriod = "once" | "week" | "month" | "year";

export type PriceQualifier =
  | "exact"
  | "from"
  | "range"
  | "offers_over"
  | "guide"
  | "undisclosed"
  | "contact_agent";

export interface ParsedPrice {
  min: number | null;
  max: number | null;
  /** Null whenever there is no number to attach a period to. */
  period: PricePeriod | null;
  /** ISO code. Null whenever there is no number. */
  currency: string | null;
  qualifier: PriceQualifier | null;
}

const NO_PRICE: ParsedPrice = {
  min: null,
  max: null,
  period: null,
  currency: null,
  qualifier: null,
};

/**
 * A sale price below this is a typo, a deposit, or a number that isn't a price.
 * Weekly rents are legitimately in the hundreds, so the floor is period-aware.
 */
const SALE_FLOOR = 1_000;
const MAX_PLAUSIBLE = 1_000_000_000;

const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:nzd|nz\s*\$)/i, "NZD"],
  [/\b(?:usd|us\s*\$)/i, "USD"],
  [/\b(?:gbp)|£/i, "GBP"],
  [/\b(?:eur)|€/i, "EUR"],
  [/\b(?:sgd|sg\s*\$)/i, "SGD"],
  [/\b(?:aud|a\s*\$)|\$/i, "AUD"],
];

const MULTIPLIERS: Record<string, number> = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };

/**
 * Numbers that are plausibly prices: either carrying a currency marker, a
 * k/m/b suffix, or a thousands separator. A bare "3" from "3 bed" is not a
 * price, and this is the rule that keeps it out.
 */
const AMOUNT = /(?:([$£€])\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([kmb])?/gi;

const RANGE_SEPARATOR = /\d\s*[kmb]?\s*(?:-|–|—|\bto\b)\s*(?:[$£€]?\s*)?\d/i;

function periodFor(text: string, listingType: string | null): PricePeriod {
  if (/\bp\.?\s?w\.?\b|per\s+week|weekly|\/\s*(?:w|wk|week)\b/i.test(text)) return "week";
  if (/\bp\.?\s?c\.?\s?m\.?\b|per\s+month|monthly|\/\s*(?:m|mo|month)\b/i.test(text)) return "month";
  if (/per\s+annum|\bp\.?\s?a\.?\b|annually|per\s+year|\/\s*(?:yr|year)\b/i.test(text)) return "year";
  return listingType === "rent" ? "week" : "once";
}

function currencyFor(text: string): string {
  for (const [pattern, code] of CURRENCY_PATTERNS) {
    if (pattern.test(text)) return code;
  }
  return "AUD";
}

function amountsIn(text: string): number[] {
  const found: number[] = [];

  for (const match of text.matchAll(AMOUNT)) {
    const [, symbol, digits, suffix] = match;
    const separated = digits.includes(",");
    const value = Number(digits.replace(/,/g, "")) * (suffix ? MULTIPLIERS[suffix.toLowerCase()] : 1);

    // Require some evidence this number is money rather than a bedroom count.
    const isMoney = Boolean(symbol) || Boolean(suffix) || separated;
    if (!isMoney || !Number.isFinite(value)) continue;
    if (value <= 0 || value > MAX_PLAUSIBLE) continue;

    found.push(value);
  }

  return found;
}

/**
 * Derives numeric price fields from the verbatim `priceText`.
 *
 * Deliberately done in code rather than asked of the model: it is a pure
 * function over a short string, so it can be tested exhaustively, and a
 * deterministic parser cannot drift between runs the way a prompt can.
 *
 * `listingType` only supplies the default period — an unqualified rent price is
 * weekly, an unqualified sale price is once — and is never used to invent a
 * number.
 */
export function parsePrice(
  priceText: string | null | undefined,
  listingType: string | null = null,
): ParsedPrice {
  const text = priceText?.trim();
  if (!text) return NO_PRICE;

  if (/contact\s+agent|price\s+on\s+application|\bpoa\b|contact\s+for\s+price/i.test(text)) {
    return { ...NO_PRICE, qualifier: "contact_agent" };
  }
  if (/undisclosed|withheld|not\s+disclosed/i.test(text)) {
    return { ...NO_PRICE, qualifier: "undisclosed" };
  }

  const amounts = amountsIn(text);
  if (amounts.length === 0) return NO_PRICE;

  const period = periodFor(text, listingType);
  const currency = currencyFor(text);
  const floor = period === "once" ? SALE_FLOOR : 1;
  const usable = amounts.filter((n) => n >= floor);
  if (usable.length === 0) return NO_PRICE;

  const isRange = usable.length >= 2 && RANGE_SEPARATOR.test(text);

  if (isRange) {
    const sorted = [...usable].sort((a, b) => a - b);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      period,
      currency,
      qualifier: "range",
    };
  }

  // Two prices with no range separator is ambiguous — a price plus a deposit, a
  // price plus a rates figure. Cowardice is correct here.
  if (usable.length > 1) return NO_PRICE;

  const value = usable[0];

  // "Under $1m" and "up to $900k" state a ceiling, and the qualifier enum has no
  // value for one. Storing it as `exact` would assert a price the post never
  // claimed, so the number is dropped and `priceText` remains the record.
  if (/\bunder\b|\bbelow\b|\bup\s+to\b|\bless\s+than\b/i.test(text)) {
    return NO_PRICE;
  }

  if (/offers?\s+(?:over|above|from)|\bo\.?\s?[\/]?\s?o\b/i.test(text)) {
    return { min: value, max: null, period, currency, qualifier: "offers_over" };
  }
  if (/\bfrom\b|starting\s+(?:at|from)|\bplus\b|\+$/i.test(text)) {
    return { min: value, max: null, period, currency, qualifier: "from" };
  }
  if (/guide|expressions?\s+of\s+interest|\beoi\b|\bcirca\b|approx/i.test(text)) {
    return { min: value, max: value, period, currency, qualifier: "guide" };
  }

  return { min: value, max: value, period, currency, qualifier: "exact" };
}
