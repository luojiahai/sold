import type { DetectorInput } from "../types";

/**
 * The classification prompt.
 *
 * Design points worth preserving if this gets edited:
 *
 * 1. `isListing` and `isAustralia` are separate booleans. A post rejected for
 *    locale is a different diagnostic signal from one rejected for relevance,
 *    and collapsing them makes the run stats unreadable.
 * 2. Extraction happens in the same call as classification. The model has
 *    already read the caption to classify it, so the marginal cost of pulling
 *    out the address and price is close to zero — and those fields are what
 *    turn the feed into something browsable rather than a list of links.
 * 3. Extraction is strictly verbatim. The model is told, repeatedly, that a
 *    field not written in the post is null. This is what makes `addressText`
 *    checkable against the caption, and one invented postcode would cost that
 *    property for every field at once. Suburb-to-postcode is a table lookup and
 *    belongs in code, if it is ever wanted at all.
 * 4. Nothing derived belongs here. Price numerics are parsed from `priceText`
 *    by `lib/property.ts` and state is canonicalised by the same module, both
 *    because a pure function can be tested and a prompt can only be hoped at.
 *
 * Bump PROMPT_VERSION on any change to SYSTEM_PROMPT or the response shape.
 * It is stored on every verdict, and it is the predicate the re-detection tool
 * uses to find verdicts produced by an older prompt.
 */

export const PROMPT_VERSION = 2;

export const SYSTEM_PROMPT = `You classify social media posts for an Australian property-listing discovery system.

For each post decide two SEPARATE things:
1. isListing — does this post advertise a specific real property that is available or was recently transacted? This includes: for sale, for auction, for rent/lease, recently sold, and "coming soon"/off-market teasers for a specific property.
   NOT listings: generic market commentary, agent self-promotion with no specific property, mortgage/finance ads, interior design or renovation content, property investment courses, recruitment posts, or a business advertising its services.
2. isAustralia — is the property located in Australia? Look for suburbs, states (NSW, VIC, QLD, WA, SA, TAS, ACT, NT), postcodes, Australian agency names, .com.au domains, or AUD pricing. If the post is a listing but you cannot establish the country, set isAustralia false and say so in the reason.

EXTRACTION RULE — read this twice.
Every field below is null unless it is LITERALLY WRITTEN in the post. Do not infer, complete, expand, or look anything up. You may know that West Melbourne is postcode 3003; if the post does not write 3003, postcode is null. You may recognise a street from a photo; if the caption does not name it, street is null. A field you filled in from your own knowledge is worse than an empty one, because it cannot be told apart from a real one.

WHERE YOU MAY READ FROM.
- caption and hashtags: any field.
- location (the platform's location tag): suburb and state ONLY. It is chosen from a gazetteer and is frequently the agency's office or a nearby landmark rather than the property, so it must never populate a street-level field.

Extract, when present (null otherwise):
- listingType: one of for_sale, auction, rent, sold, off_market, other
- addressText: the property's address exactly as written, in the post's own wording and order, e.g. "12/40 Rosslyn St, West Melbourne VIC 3003". This is the record everything else is checked against, so copy it, do not tidy it.
- unit: unit/apartment/suite number only, e.g. "12" from "12/40 Rosslyn St"
- streetNumber: street number only, e.g. "40"
- street: street name including its type as written, e.g. "Rosslyn St"
- suburb: the suburb/locality name only
- state: the Australian state or territory as written
- postcode: the four-digit postcode, only if the post writes it
- priceText: the price exactly as written, e.g. "$1.2M", "Offers over $850,000", "$650 per week", "Contact agent"
- agency: the real estate agency name
- propertyCount: how many DISTINCT properties this post advertises. 1 for a normal listing. For a round-up such as "our open homes this Saturday" listing several properties, give the count and extract the address fields for the FIRST property only. Null if you cannot tell.

Be strict. A post that merely mentions property is not a listing. When genuinely uncertain, set isListing false and set confidence low.`;

export interface BatchPost {
  id: string;
  caption: string;
  author: string | null;
  hashtags: string[];
  location: string | null;
  postedAt: string | null;
}

export function toBatchPost(post: DetectorInput): BatchPost {
  return {
    id: post.postId,
    // Captions can be enormous; the signal is overwhelmingly in the opening.
    caption: post.text.slice(0, 2_000),
    author: post.authorHandle,
    hashtags: post.hashtags.slice(0, 30),
    location: post.locationName,
    postedAt: post.postedAt,
  };
}

export function buildPrompt(posts: DetectorInput[]): string {
  const payload = posts.map(toBatchPost);

  return `${SYSTEM_PROMPT}

Here are ${payload.length} post(s) as JSON:

${JSON.stringify(payload, null, 2)}

Respond with ONLY a JSON array — no prose, no markdown fences — with exactly one object per post, in the same order, each shaped:

{"id": "<the post id, copied exactly>", "isListing": true|false, "isAustralia": true|false, "confidence": 0-100, "reason": "<one short sentence>", "listingType": "for_sale"|"auction"|"rent"|"sold"|"off_market"|"other"|null, "addressText": string|null, "unit": string|null, "streetNumber": string|null, "street": string|null, "suburb": string|null, "state": string|null, "postcode": string|null, "propertyCount": number|null, "priceText": string|null, "agency": string|null}`;
}
