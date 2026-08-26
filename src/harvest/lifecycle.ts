import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { runEvents, runs } from "@/db/schema";
import { nowIso } from "@/lib/id";

/** Statuses a run can sit in while it is supposed to be doing work. */
export const ACTIVE_STATUSES = ["pending", "collecting", "detecting"] as const;

/** A run whose heartbeat is older than this is treated as dead, not slow. */
export const STALE_AFTER_MS = 120_000;

export function isStalled(run: {
  status: string;
  heartbeatAt: string | null;
  startedAt: string;
}): boolean {
  if (!ACTIVE_STATUSES.includes(run.status as (typeof ACTIVE_STATUSES)[number])) {
    return false;
  }
  const last = new Date(run.heartbeatAt ?? run.startedAt).getTime();
  return Number.isFinite(last) && Date.now() - last > STALE_AFTER_MS;
}

/**
 * Marks runs that cannot possibly still be executing.
 *
 * Runs are in-process background work, so a non-terminal run present when the
 * server boots was orphaned by whatever killed the previous process. Left
 * alone it sits in `collecting` forever, which reads as "still working" and is
 * the most misleading state the UI can show.
 */
export function reconcileOrphanedRuns(): number {
  const orphans = db
    .select({ id: runs.id, status: runs.status })
    .from(runs)
    .where(inArray(runs.status, [...ACTIVE_STATUSES]))
    .all();

  for (const orphan of orphans) {
    db.update(runs)
      .set({
        status: "cancelled",
        error: `Interrupted while ${orphan.status} — the process that was running it exited.`,
        finishedAt: nowIso(),
      })
      .where(eq(runs.id, orphan.id))
      .run();

    db.insert(runEvents)
      .values({
        runId: orphan.id,
        level: "warn",
        phase: "cancelled",
        message: "Run orphaned by a process exit and marked cancelled on startup.",
      })
      .run();
  }

  return orphans.length;
}

/**
 * Requests cancellation.
 *
 * The runner checks this between units of work, so a live run stops at the next
 * post or batch rather than being abandoned mid-write. For a run whose process
 * is already gone, this is simply the record catching up with reality.
 */
export function requestCancel(runId: string): void {
  db.update(runs)
    .set({ status: "cancelled", finishedAt: nowIso() })
    .where(and(eq(runs.id, runId), inArray(runs.status, [...ACTIVE_STATUSES])))
    .run();

  db.insert(runEvents)
    .values({ runId, level: "warn", phase: "cancelled", message: "Cancellation requested." })
    .run();
}

export function isCancelled(runId: string): boolean {
  const row = db
    .select({ status: runs.status })
    .from(runs)
    .where(eq(runs.id, runId))
    .get();
  return row?.status === "cancelled";
}

export function touchHeartbeat(runId: string): void {
  db.update(runs).set({ heartbeatAt: nowIso() }).where(eq(runs.id, runId)).run();
}

/** Thrown internally to unwind a cancelled run without marking it failed. */
export class RunCancelled extends Error {
  constructor() {
    super("Run cancelled.");
    this.name = "RunCancelled";
  }
}

export const activeRunCount = (): number =>
  db
    .select({ n: sql<number>`COUNT(*)` })
    .from(runs)
    .where(inArray(runs.status, [...ACTIVE_STATUSES]))
    .get()?.n ?? 0;
