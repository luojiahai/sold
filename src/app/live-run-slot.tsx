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
        status: run.status,
        collectorId: run.collectorId,
        postsSeen: run.postsSeen,
        postsNew: run.postsNew,
        postsVerified: run.postsVerified,
        detectorCostUsd: run.detectorCostUsd,
        stalled: isStalled(run),
      }}
    />
  );
}
