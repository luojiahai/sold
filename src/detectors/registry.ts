import { claudeCliDetector } from "./claude-cli";
import type { Detector } from "./types";

/**
 * The API-based detector is declared but unimplemented. Its presence is the
 * point: swapping detection from a subscription CLI to a metered API — or from
 * text-only to multimodal — should be a choice made at run time, not a rewrite.
 */
const anthropicApiDetector: Detector = {
  id: "anthropic-api",
  name: "Anthropic API (batch)",
  description:
    "Direct Messages API with tool-use structured output. Cheaper and faster than process-spawning at volume, and the natural home for the Batches API, but needs an API key and metered billing.",
  model: null,
  promptVersion: 0,
  implemented: false,
  capabilities: { multimodal: false, batchSize: 50, concurrency: 8, costTier: "medium" },
  async preflight() {
    return { ok: false, detail: "Not implemented in the prototype." };
  },
  // eslint-disable-next-line require-yield
  async *detect() {
    throw new Error("anthropic-api detector is not implemented.");
  },
};

const claudeVisionDetector: Detector = {
  id: "claude-cli-vision",
  name: "Claude CLI (multimodal)",
  description:
    "Reads the cached thumbnail alongside the caption. Australian agency posts routinely put the address, price and auction time in the graphic with an emoji-only caption, so caption-only detection has a systematic blind spot this would measure.",
  model: null,
  promptVersion: 0,
  implemented: false,
  capabilities: { multimodal: true, batchSize: 5, concurrency: 2, costTier: "medium" },
  async preflight() {
    return { ok: false, detail: "Not implemented in the prototype." };
  },
  // eslint-disable-next-line require-yield
  async *detect() {
    throw new Error("claude-cli-vision detector is not implemented.");
  },
};

export const DETECTORS: Detector[] = [
  claudeCliDetector,
  claudeVisionDetector,
  anthropicApiDetector,
];

export function getDetector(id: string): Detector {
  const detector = DETECTORS.find((d) => d.id === id);
  if (!detector) throw new Error(`Unknown detector: ${id}`);
  return detector;
}

export * from "./types";
