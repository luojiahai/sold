import { activeRun, isStalled } from "@/harvest/lifecycle";
import { LiveRun } from "./live-run";

/** Reads the active run on the server so the strip is present in first paint. */
export function LiveRunSlot() {
  const run = activeRun();
  if (!run) return null;

  return (
    <LiveRun
      initial={{
        id: run.id,
        kind: run.kind,
        status: run.status,
        collectorId: run.collectorId,
        detectorId: run.detectorId,
        postsSeen: run.postsSeen,
        postsNew: run.postsNew,
        postsDetected: run.postsDetected,
        postsVerified: run.postsVerified,
        detectorCostUsd: run.detectorCostUsd,
        stalled: isStalled(run),
      }}
    />
  );
}
