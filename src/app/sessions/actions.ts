"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { getCollector } from "@/collectors/registry";
import { newId, nowIso } from "@/lib/id";
import { parseCookies } from "./cookies";

export async function addSession(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim() || "burner";
  const cookies = parseCookies(String(formData.get("cookies") ?? ""));
  const sessionId = cookies.sessionid ?? String(formData.get("sessionId") ?? "").trim();

  if (!sessionId) {
    throw new Error(
      "No `sessionid` found. Paste the full Cookie header or cookies.txt, or set the sessionid field.",
    );
  }

  const id = newId();
  delete cookies.sessionid;

  db.insert(sessions)
    .values({
      id,
      platform: "instagram",
      label,
      sessionId,
      cookies,
      // Persisting the device fingerprint per account keeps repeat runs looking
      // like the same phone rather than a new one each time.
      settingsPath: resolve(`./data/sessions/${id}.json`),
      status: "untested",
    })
    .run();

  revalidatePath("/sessions");
}

/** Marking one active deactivates the others: the collector uses a single session. */
export async function activateSession(formData: FormData) {
  const id = String(formData.get("id"));
  db.update(sessions).set({ status: "untested" }).where(eq(sessions.status, "active")).run();
  db.update(sessions).set({ status: "active" }).where(eq(sessions.id, id)).run();
  revalidatePath("/sessions");
}

export async function testSession(formData: FormData) {
  const id = String(formData.get("id"));

  // Preflight reads whichever session is active, so activate first.
  db.update(sessions).set({ status: "untested" }).where(eq(sessions.status, "active")).run();
  db.update(sessions).set({ status: "active" }).where(eq(sessions.id, id)).run();

  const result = await getCollector("instagram-cookie").preflight();

  db.update(sessions)
    .set({
      status: result.ok ? "active" : "expired",
      statusDetail: result.detail,
      lastCheckedAt: nowIso(),
    })
    .where(eq(sessions.id, id))
    .run();

  revalidatePath("/sessions");
}

export async function deleteSession(formData: FormData) {
  db.delete(sessions).where(eq(sessions.id, String(formData.get("id")))).run();
  revalidatePath("/sessions");
}
