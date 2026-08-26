"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { keywords } from "@/db/schema";
import { startRun, type HarvestConfig } from "@/harvest/runner";
import type { CollectorTerm, TermKind } from "@/collectors/types";

function parseTerms(raw: FormDataEntryValue | null, kind: TermKind): CollectorTerm[] {
  return String(raw ?? "")
    .split(/[\n,]/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean)
    .map((term) => ({ kind, term }));
}

export async function startHarvest(formData: FormData) {
  const strategies = formData.getAll("strategies").map(String);
  const useSeedList = formData.get("termSource") !== "custom";

  let terms: CollectorTerm[];
  if (useSeedList) {
    const enabled = db
      .select()
      .from(keywords)
      .where(eq(keywords.enabled, true))
      .all();
    terms = enabled.map((k) => ({ kind: k.kind as TermKind, term: k.term }));
  } else {
    terms = [
      ...parseTerms(formData.get("customHashtags"), "hashtag"),
      ...parseTerms(formData.get("customKeywords"), "keyword"),
    ];
  }

  // Only send terms whose strategy is actually enabled, so the run's term list
  // matches what it will really attempt.
  const kindEnabled = new Set(
    strategies.map((s) => (s === "hashtag_recent" ? "hashtag" : "keyword")),
  );
  terms = terms.filter((t) => kindEnabled.has(t.kind));

  if (terms.length === 0) {
    throw new Error("No terms selected for the enabled strategies.");
  }

  const config: HarvestConfig = {
    collectorId: String(formData.get("collectorId")),
    detectorId: String(formData.get("detectorId")),
    terms,
    since: String(formData.get("since")),
    until: String(formData.get("until")),
    maxPagesPerTerm: Number(formData.get("maxPagesPerTerm") || 3),
    maxPostsPerTerm: Number(formData.get("maxPostsPerTerm") || 60),
    delayRange: [
      Number(formData.get("delayMin") || 3),
      Number(formData.get("delayMax") || 8),
    ],
    strategies,
    detectBacklog: formData.get("detectBacklog") === "on",
  };

  const runId = startRun(config);
  revalidatePath("/runs");
  redirect(`/runs/${runId}`);
}
