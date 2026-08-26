"use server";

import { revalidatePath } from "next/cache";
import { requestCancel } from "@/harvest/lifecycle";

export async function cancelRun(formData: FormData) {
  const runId = String(formData.get("runId"));
  requestCancel(runId);
  revalidatePath(`/runs/${runId}`);
  revalidatePath("/runs");
}
