import type { DetectorInput } from "../types";

/**
 * The classification prompt.
 *
 * Two design points worth preserving if this gets edited:
 *
 * 1. `isListing` and `isAustralia` are separate booleans. A post rejected for
 *    locale is a different diagnostic signal from one rejected for relevance,
 *    and collapsing them makes the run stats unreadable.
 * 2. Extraction happens in the same call as classification. The model has
 *    already read the caption to classify it, so the marginal cost of pulling
 *    out suburb/state/price is close to zero — and those fields are what turn
 *    the feed into something browsable rather than a list of links.
 */

export const SYSTEM_PROMPT = `You classify social media posts for an Australian property-listing discovery system.

For each post decide two SEPARATE things:
1. isListing — does this post advertise a specific real property that is available or was recently transacted? This includes: for sale, for auction, for rent/lease, recently sold, and "coming soon"/off-market teasers for a specific property.
   NOT listings: generic market commentary, agent self-promotion with no specific property, mortgage/finance ads, interior design or renovation content, property investment courses, recruitment posts, or a business advertising its services.
2. isAustralia — is the property located in Australia? Look for suburbs, states (NSW, VIC, QLD, WA, SA, TAS, ACT, NT), postcodes, Australian agency names, .com.au domains, or AUD pricing. If the post is a listing but you cannot establish the country, set isAustralia false and say so in the reason.

Also extract, when clearly present (null otherwise):
- listingType: one of for_sale, auction, rent, sold, off_market, other
- suburb: the suburb/locality name only
- state: the Australian state/territory abbreviation
- priceText: the price exactly as written, e.g. "$1.2M", "Offers over $850,000", "Contact agent"
- agency: the real estate agency name

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

{"id": "<the post id, copied exactly>", "isListing": true|false, "isAustralia": true|false, "confidence": 0-100, "reason": "<one short sentence>", "listingType": "for_sale"|"auction"|"rent"|"sold"|"off_market"|"other"|null, "suburb": string|null, "state": string|null, "priceText": string|null, "agency": string|null}`;
}
