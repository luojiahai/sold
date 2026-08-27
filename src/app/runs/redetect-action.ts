"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDetector } from "@/detectors/registry";
import { activeRunCount } from "@/harvest/lifecycle";
import { REDETECT_SCOPES, startRedetect, type RedetectScope } from "@/harvest/redetect";

export async function startRedetection(formData: FormData) {
  // Runs are in-process background work and the status strip tracks one at a
  // time. Two concurrent runs would also double the pressure on the detector
  // while the UI showed a single one.
  if (activeRunCount() > 0) {
    throw new Error("A run is already in progress. Stop it before starting a re-detection.");
  }

  const scope = String(formData.get("scope")) as RedetectScope;
  if (!REDETECT_SCOPES.some((s) => s.id === scope)) {
    throw new Error(`Unknown re-detection scope: ${scope}`);
  }

  const detector = getDetector(String(formData.get("detectorId")));
  if (!detector.implemented) {
    throw new Error(`Detector ${detector.name} is a placeholder.`);
  }

  const runId = startRedetect({
    detectorId: detector.id,
    scope,
    promptVersion: detector.promptVersion,
  });

  revalidatePath("/runs");
  redirect(`/runs/${runId}`);
}
