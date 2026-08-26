import { instagramCookieCollector } from "./instagram-cookie";
import {
  instagramAgenticCollector,
  instagramVendorApiCollector,
  tiktokCollector,
  xCollector,
} from "./placeholders";
import type { Collector } from "./types";

export const COLLECTORS: Collector[] = [
  instagramCookieCollector,
  instagramVendorApiCollector,
  instagramAgenticCollector,
  xCollector,
  tiktokCollector,
];

export function getCollector(id: string): Collector {
  const collector = COLLECTORS.find((c) => c.id === id);
  if (!collector) throw new Error(`Unknown collector: ${id}`);
  return collector;
}

export * from "./types";
