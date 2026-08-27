import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalisePostcode,
  normaliseState,
  normaliseSuburb,
  parsePrice,
  type ParsedPrice,
} from "./property";

describe("normaliseState", () => {
  const cases: Array<[string | null, string | null]> = [
    ["VIC", "VIC"],
    ["vic", "VIC"],
    ["Victoria", "VIC"],
    ["N.S.W.", "NSW"],
    ["New South Wales", "NSW"],
    ["Queensland", "QLD"],
    ["Western Australia", "WA"],
    ["Australian Capital Territory", "ACT"],
    ["Northern Territory", "NT"],
    // Not a state: must be dropped rather than become a filter option.
    ["Auckland", null],
    ["New Zealand", null],
    ["", null],
    [null, null],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(normaliseState(input), expected);
    });
  }
});

describe("normaliseSuburb", () => {
  const cases: Array<[string | null, string | null]> = [
    ["west melbourne", "West Melbourne"],
    ["WEST MELBOURNE", "West Melbourne"],
    ["st kilda east", "St Kilda East"],
    ["mount waverley", "Mount Waverley"],
    ["surfers paradise", "Surfers Paradise"],
    ["port macquarie", "Port Macquarie"],
    ["frankston south", "Frankston South"],
    // Already mixed-case: the author's capitalisation is deliberate and survives.
    ["McMahons Point", "McMahons Point"],
    ["O'Connor", "O'Connor"],
    ["Kurrajong Heights", "Kurrajong Heights"],
    ["  fitzroy  ", "Fitzroy"],
    ["", null],
    [null, null],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(normaliseSuburb(input), expected);
    });
  }
});

describe("normalisePostcode", () => {
  it("accepts four digits", () => assert.equal(normalisePostcode("3003"), "3003"));
  it("accepts a leading-zero postcode", () => assert.equal(normalisePostcode("0800"), "0800"));
  it("rejects five digits", () => assert.equal(normalisePostcode("30031"), null));
  it("rejects a state-plus-postcode string", () => assert.equal(normalisePostcode("VIC 3003"), null));
  it("rejects null", () => assert.equal(normalisePostcode(null), null));
});

describe("parsePrice", () => {
  /** Asserts only the fields a case names, so each case states just its point. */
  const expect = (
    input: string | null,
    listingType: string | null,
    expected: Partial<ParsedPrice>,
  ) => {
    it(`${JSON.stringify(input)} (${listingType ?? "no type"})`, () => {
      const actual = parsePrice(input, listingType);
      for (const [field, value] of Object.entries(expected)) {
        assert.equal(actual[field as keyof ParsedPrice], value, field);
      }
    });
  };

  /* --- plain sale prices --- */
  expect("$1,200,000", "for_sale", {
    min: 1_200_000, max: 1_200_000, period: "once", currency: "AUD", qualifier: "exact",
  });
  expect("$1.2M", "for_sale", {
    min: 1_200_000, max: 1_200_000, period: "once", currency: "AUD", qualifier: "exact",
  });
  expect("$850k", "for_sale", {
    min: 850_000, max: 850_000, period: "once", currency: "AUD", qualifier: "exact",
  });

  /* --- qualified sale prices --- */
  expect("Offers over $850,000", "for_sale", {
    min: 850_000, max: null, qualifier: "offers_over",
  });
  expect("Offers above $1.1m", "for_sale", { min: 1_100_000, max: null, qualifier: "offers_over" });
  expect("From $499,000", "for_sale", { min: 499_000, max: null, qualifier: "from" });
  expect("$500,000+", "for_sale", { min: 500_000, max: null, qualifier: "from" });
  expect("Price guide $1.35m", "for_sale", {
    min: 1_350_000, max: 1_350_000, qualifier: "guide",
  });

  /* --- ranges --- */
  expect("$800k - $880k", "for_sale", {
    min: 800_000, max: 880_000, period: "once", qualifier: "range",
  });
  expect("$800,000 – $880,000", "for_sale", {
    min: 800_000, max: 880_000, qualifier: "range",
  });
  expect("$1.2m to $1.4m", "auction", { min: 1_200_000, max: 1_400_000, qualifier: "range" });

  /* --- rent --- */
  expect("$650 per week", "rent", {
    min: 650, max: 650, period: "week", currency: "AUD", qualifier: "exact",
  });
  expect("$450pw", "rent", { min: 450, max: 450, period: "week" });
  // No period written, but the listing type supplies the default.
  expect("$720", "rent", { min: 720, max: 720, period: "week", qualifier: "exact" });
  expect("$2,800 pcm", "rent", { min: 2_800, max: 2_800, period: "month" });
  expect("$95,000 per annum", "other", { min: 95_000, max: 95_000, period: "year" });

  /* --- no number --- */
  expect("Contact agent", "for_sale", {
    min: null, max: null, period: null, currency: null, qualifier: "contact_agent",
  });
  expect("Price on application", "for_sale", { qualifier: "contact_agent" });
  expect("POA", "for_sale", { qualifier: "contact_agent" });
  expect("Undisclosed", "sold", { qualifier: "undisclosed" });
  expect("Sale price withheld", "sold", { qualifier: "undisclosed" });
  expect(null, "for_sale", { min: null, max: null, qualifier: null });
  expect("", "for_sale", { min: null, max: null, qualifier: null });

  /* --- refusals: the parser must not invent a number --- */
  // Bare digits with no currency marker are bedroom counts, not prices.
  expect("3 bed 2 bath 2 car", "for_sale", { min: null, max: null, qualifier: null });
  // Below the sale floor: a $850 house price is not a house price.
  expect("$850", "for_sale", { min: null, max: null, qualifier: null });
  // Two amounts with no range separator — a price plus something else.
  expect("$1,200,000 deposit $120,000", "for_sale", { min: null, max: null, qualifier: null });
  // A ceiling has no representation in the qualifier enum, so it is dropped.
  expect("Under $1m", "for_sale", { min: null, max: null, qualifier: null });
  expect("Up to $900k", "rent", { min: null, max: null, qualifier: null });
  // Auction times are not prices.
  expect("Auction Saturday 12pm", "auction", { min: null, max: null, qualifier: null });

  /* --- currency --- */
  expect("NZ$650,000", "for_sale", { min: 650_000, currency: "NZD" });
  expect("US$1.2m", "for_sale", { min: 1_200_000, currency: "USD" });
  expect("A$1,450,000", "for_sale", { min: 1_450_000, currency: "AUD" });
});
