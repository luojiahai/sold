import { NotImplementedError, type Collector } from "./types";

/**
 * Unimplemented collectors are declared rather than omitted.
 *
 * They appear in the UI greyed out, which makes the cost/access trade-off the
 * architecture exists to support visible from the first screen: the same
 * `Collector` contract can be satisfied by a burner session, a paid vendor API,
 * or a browser-driving agent, and the choice belongs to whoever runs the
 * harvest.
 */
function placeholder(
  config: Pick<Collector, "id" | "name" | "description" | "capabilities">,
): Collector {
  return {
    ...config,
    implemented: false,
    async preflight() {
      return { ok: false, detail: "Not implemented in the prototype." };
    },
    // eslint-disable-next-line require-yield
    async *collect() {
      throw new NotImplementedError(config.name);
    },
  };
}

export const instagramVendorApiCollector = placeholder({
  id: "instagram-vendor-api",
  name: "Instagram (third-party vendor API)",
  description:
    "Paid API vendor doing the platform access. Higher per-post cost, but no session management, no ban risk, and no Terms-of-Use exposure — the mitigation path if cookie collection becomes untenable.",
  capabilities: {
    platform: "instagram",
    supportsDateCutoff: true,
    strategies: ["vendor_search"],
    costTier: "high",
  },
});

export const instagramAgenticCollector = placeholder({
  id: "instagram-agentic",
  name: "Instagram (AI browser agent)",
  description:
    "Playwright-driven browsing with an AI agent reading the rendered page. Slowest and most expensive per post, but resilient to endpoint changes because it reads what a human sees rather than a private API contract.",
  capabilities: {
    platform: "instagram",
    supportsDateCutoff: false,
    strategies: ["browse_search", "browse_hashtag"],
    costTier: "high",
  },
});

export const xCollector = placeholder({
  id: "x-placeholder",
  name: "X / Twitter",
  description: "Deferred. Different search semantics and access model to Instagram.",
  capabilities: {
    platform: "x",
    supportsDateCutoff: true,
    strategies: [],
    costTier: "medium",
  },
});

export const tiktokCollector = placeholder({
  id: "tiktok-placeholder",
  name: "TikTok",
  description: "Deferred. Video-first, so detection would be multimodal from the start.",
  capabilities: {
    platform: "tiktok",
    supportsDateCutoff: false,
    strategies: [],
    costTier: "medium",
  },
});
