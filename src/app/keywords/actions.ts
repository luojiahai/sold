"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { keywords } from "@/db/schema";
import { newId } from "@/lib/id";
import type { TermKind } from "@/collectors/types";

export async function addKeywords(formData: FormData) {
  const kind = String(formData.get("kind")) as TermKind;
  const terms = String(formData.get("terms") ?? "")
    .split(/[\n,]/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);

  if (terms.length > 0) {
    db.insert(keywords)
      .values(
        terms.map((term) => ({
          id: newId(),
          platform: "instagram",
          kind,
          term,
          enabled: true,
        })),
      )
      .onConflictDoNothing()
      .run();
  }

  revalidatePath("/keywords");
}

export async function toggleKeyword(formData: FormData) {
  const id = String(formData.get("id"));
  db.update(keywords)
    .set({ enabled: sql`NOT ${keywords.enabled}` })
    .where(eq(keywords.id, id))
    .run();
  revalidatePath("/keywords");
}

export async function deleteKeyword(formData: FormData) {
  db.delete(keywords).where(eq(keywords.id, String(formData.get("id")))).run();
  revalidatePath("/keywords");
}
