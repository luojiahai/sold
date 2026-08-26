import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { NextResponse } from "next/server";
import { MEDIA_DIR } from "@/media/cache";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

/** Serves cached thumbnails. `basename` prevents path traversal via the segment. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const path = join(MEDIA_DIR, basename(name));

  try {
    const info = await stat(path);
    if (!info.isFile()) return new NextResponse("Not found", { status: 404 });

    const stream = Readable.toWeb(
      createReadStream(path),
    ) as unknown as WebReadableStream<Uint8Array>;

    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
