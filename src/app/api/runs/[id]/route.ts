import { asc, eq, gt, and } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { runEvents, runs } from "@/db/schema";

/**
 * Run progress, polled by the run detail page.
 *
 * `?after=<eventId>` returns only newer log lines, so a long-running collect
 * doesn't re-send its whole log every two seconds.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const after = Number(new URL(request.url).searchParams.get("after") ?? 0);

  const run = db.select().from(runs).where(eq(runs.id, id)).get();
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const events = db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, id), gt(runEvents.id, after)))
    .orderBy(asc(runEvents.id))
    .limit(500)
    .all();

  return NextResponse.json({ run, events });
}
