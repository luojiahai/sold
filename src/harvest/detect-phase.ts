import type { Detector, DetectorInput } from "@/detectors/types";
import { RunCancelled, isCancelled } from "./lifecycle";
import { bumpRunCounters, logEvent, saveDetection } from "./store";

/** The columns every detection queue selects, whatever its selection rule. */
export interface QueuedPost {
  postId: string;
  text: string;
  authorHandle: string | null;
  hashtags: string[] | null;
  locationName: string | null;
  postedAt: string | null;
  url: string;
  thumbnailPath: string | null;
}

export const toDetectorInput = (row: QueuedPost): DetectorInput => ({
  postId: row.postId,
  text: row.text,
  authorHandle: row.authorHandle,
  hashtags: row.hashtags ?? [],
  locationName: row.locationName,
  postedAt: row.postedAt,
  url: row.url,
  thumbnailPath: row.thumbnailPath,
});

/**
 * Runs a detector over a queue and writes the verdicts.
 *
 * Shared by the harvest — which queues posts with no verdict yet — and by
 * re-detection, which queues posts whose verdict came from an older prompt. The
 * two differ only in how the queue is chosen; everything after that (batching,
 * cancellation checkpoints, cost attribution, counters) is identical, and two
 * copies of it would drift.
 */
export async function runDetectionPhase(
  runId: string,
  detector: Detector,
  inputs: DetectorInput[],
): Promise<void> {
  for await (const event of detector.detect(inputs)) {
    if (isCancelled(runId)) throw new RunCancelled();
    if (event.type === "log") {
      logEvent(runId, "detect", event.message, event.level);
      continue;
    }

    let verified = 0;
    for (const verdict of event.verdicts) {
      // Cost is reported per call, so attribute it evenly across the batch.
      saveDetection(
        verdict,
        runId,
        detector.id,
        detector.model,
        detector.promptVersion,
        event.costUsd / Math.max(event.verdicts.length, 1),
      );
      if (verdict.isListing && verdict.isAustralia) verified += 1;
    }

    bumpRunCounters(
      runId,
      { postsDetected: event.verdicts.length, postsVerified: verified },
      event.costUsd,
    );
    logEvent(
      runId,
      "detect",
      `Batch of ${event.verdicts.length}: ${verified} verified as Australian listings ($${event.costUsd.toFixed(4)}).`,
    );
  }
}
