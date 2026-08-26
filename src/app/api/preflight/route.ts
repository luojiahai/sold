import { NextResponse } from "next/server";
import { getCollector } from "@/collectors/registry";
import { getDetector } from "@/detectors/registry";

/**
 * Preflight both halves of a harvest before committing to it.
 *
 * The whole point is failing in seconds rather than discovering a dead session
 * twenty minutes into a crawl.
 */
export async function POST(request: Request) {
  const { collectorId, detectorId } = (await request.json()) as {
    collectorId?: string;
    detectorId?: string;
  };

  const checks: Record<string, { ok: boolean; detail: string }> = {};

  try {
    if (collectorId) checks.collector = await getCollector(collectorId).preflight();
    if (detectorId) checks.detector = await getDetector(detectorId).preflight();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  return NextResponse.json(checks);
}
