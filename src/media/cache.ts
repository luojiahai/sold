import { createHash } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";

export const MEDIA_DIR = resolve(process.env.SOLD_MEDIA_DIR ?? "./data/media");

/**
 * Caches a post thumbnail to local disk.
 *
 * Instagram CDN URLs are signed and expire within hours to days, so a post
 * collected on Monday renders as a broken image by Wednesday. For a prototype
 * whose job is to make a human judge whether the results look like property
 * listings, that is the difference between a working demo and a broken one.
 *
 * Failures are non-fatal: a missing thumbnail costs a placeholder tile, not a
 * lost post.
 */
export async function cacheThumbnail(
  url: string | null,
  platformPostId: string,
): Promise<string | null> {
  if (!url) return null;

  const name = `${createHash("sha1").update(platformPostId).digest("hex")}.jpg`;
  const absolute = join(MEDIA_DIR, name);

  try {
    await access(absolute);
    return name; // already cached
  } catch {
    // not cached yet
  }

  try {
    await mkdir(MEDIA_DIR, { recursive: true });
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength === 0) return null;

    await writeFile(absolute, buffer);
    return name;
  } catch {
    return null;
  }
}
