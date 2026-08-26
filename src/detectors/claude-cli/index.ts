import { z } from "zod";
import { extractJsonArray, runClaude } from "@/lib/claude";
import { buildPrompt } from "./prompt";
import type {
  DetectEvent,
  DetectionVerdict,
  Detector,
  DetectorInput,
  ListingType,
} from "../types";

const LISTING_TYPES = [
  "for_sale",
  "auction",
  "rent",
  "sold",
  "off_market",
  "other",
] as const;

/**
 * Lenient on shape, strict on meaning: models reliably produce the right
 * fields but not always the right primitive (confidence as "85", isListing as
 * "true"). Coercing here is cheaper than a retry.
 */
const verdictSchema = z.object({
  id: z.string(),
  isListing: z.coerce.boolean(),
  isAustralia: z.coerce.boolean(),
  confidence: z.coerce.number().min(0).max(100).catch(0),
  reason: z.string().default(""),
  listingType: z.enum(LISTING_TYPES).nullable().catch(null),
  suburb: z.string().nullable().catch(null),
  state: z.string().nullable().catch(null),
  priceText: z.string().nullable().catch(null),
  agency: z.string().nullable().catch(null),
});

const BATCH_SIZE = Number(process.env.SOLD_DETECT_BATCH_SIZE ?? 10);
const CONCURRENCY = Number(process.env.SOLD_DETECT_CONCURRENCY ?? 3);
const MODEL = process.env.SOLD_DETECT_MODEL ?? "claude-sonnet-5";

function toVerdict(raw: unknown, fallbackId: string): DetectionVerdict {
  const parsed = verdictSchema.parse(raw);
  return {
    postId: parsed.id || fallbackId,
    isListing: parsed.isListing,
    isAustralia: parsed.isAustralia,
    confidence: Math.round(parsed.confidence),
    reason: parsed.reason,
    listingType: parsed.listingType as ListingType | null,
    suburb: parsed.suburb,
    state: parsed.state,
    priceText: parsed.priceText,
    agency: parsed.agency,
  };
}

function errorVerdict(postId: string, message: string): DetectionVerdict {
  return {
    postId,
    isListing: false,
    isAustralia: false,
    confidence: 0,
    reason: `Detection failed: ${message}`,
    listingType: null,
    suburb: null,
    state: null,
    priceText: null,
    agency: null,
    viaFallback: true,
    error: message,
  };
}

async function detectBatch(
  posts: DetectorInput[],
): Promise<{ verdicts: DetectionVerdict[]; costUsd: number; note?: string }> {
  const { text, costUsd } = await runClaude(buildPrompt(posts), MODEL);
  const rows = extractJsonArray(text);

  const byId = new Map<string, unknown>();
  rows.forEach((row, index) => {
    const id =
      row && typeof row === "object" && "id" in row
        ? String((row as { id: unknown }).id)
        : posts[index]?.postId;
    if (id) byId.set(id, row);
  });

  // Every post must come back with a verdict. A model that silently drops one
  // would otherwise leave it permanently undetected and invisible.
  const missing = posts.filter((p) => !byId.has(p.postId));
  if (missing.length) {
    throw new Error(`model omitted ${missing.length} of ${posts.length} post(s)`);
  }

  return {
    verdicts: posts.map((p) => toVerdict(byId.get(p.postId), p.postId)),
    costUsd,
  };
}

/** Runs `tasks` with a bounded number in flight, preserving input order. */
async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    }),
  );

  return results;
}

export const claudeCliDetector: Detector = {
  id: "claude-cli",
  name: `Claude CLI (${MODEL})`,
  description:
    "Classifies posts by shelling out to `claude -p` with a JSON-only prompt. Batches posts per call; a batch that fails to parse retries once, then falls back to per-post calls so one malformed caption cannot poison nine good ones.",
  model: MODEL,
  implemented: true,
  capabilities: {
    multimodal: false,
    batchSize: BATCH_SIZE,
    concurrency: CONCURRENCY,
    costTier: "low",
  },

  async preflight() {
    try {
      const { text } = await runClaude(
        'Reply with only this JSON array and nothing else: [{"ok":true}]',
        MODEL,
        60_000,
      );
      const rows = extractJsonArray(text);
      return rows.length > 0
        ? { ok: true, detail: `claude CLI responding on ${MODEL}.` }
        : { ok: false, detail: "claude CLI returned an empty result." };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  },

  async *detect(posts: DetectorInput[]): AsyncIterable<DetectEvent> {
    const batches: DetectorInput[][] = [];
    for (let i = 0; i < posts.length; i += BATCH_SIZE) {
      batches.push(posts.slice(i, i + BATCH_SIZE));
    }

    yield {
      type: "log",
      level: "info",
      message: `Detecting ${posts.length} post(s) in ${batches.length} batch(es) of up to ${BATCH_SIZE}, ${CONCURRENCY} concurrent, model ${MODEL}.`,
    };

    // Batches are pooled, but results are yielded in order so the run log reads
    // sequentially rather than interleaved.
    const settled = await pooled(batches, CONCURRENCY, async (batch) => {
      try {
        return await detectBatch(batch);
      } catch (firstError) {
        try {
          const retried = await detectBatch(batch);
          return { ...retried, note: `batch retried: ${(firstError as Error).message}` };
        } catch (secondError) {
          // Per-post fallback: isolate the caption that is breaking the batch.
          let costUsd = 0;
          const verdicts: DetectionVerdict[] = [];
          for (const post of batch) {
            try {
              const single = await detectBatch([post]);
              costUsd += single.costUsd;
              verdicts.push({ ...single.verdicts[0], viaFallback: true });
            } catch (postError) {
              verdicts.push(errorVerdict(post.postId, (postError as Error).message));
            }
          }
          return {
            verdicts,
            costUsd,
            note: `batch failed twice (${(secondError as Error).message}); fell back to per-post`,
          };
        }
      }
    });

    for (const result of settled) {
      if (result.note) {
        yield { type: "log", level: "warn", message: result.note };
      }
      yield { type: "verdicts", verdicts: result.verdicts, costUsd: result.costUsd };
    }
  },
};
