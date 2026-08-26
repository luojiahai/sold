"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { getCollector } from "@/collectors/registry";
import { newId, nowIso } from "@/lib/id";
import { parseCookies } from "./cookies";

export interface AddSessionState {
  ok: boolean | null;
  message: string;
}

/**
 * Returns a result rather than throwing.
 *
 * A bad paste is the most likely outcome of the fiddliest step in the system,
 * and it deserves an inline message telling you what was missing — not an
 * uncaught 500 in the browser console.
 */
export async function addSession(
  _previous: AddSessionState,
  formData: FormData,
): Promise<AddSessionState> {
  const label = String(formData.get("label") ?? "").trim() || "burner";
  const raw = String(formData.get("cookies") ?? "").trim();
  const cookies = parseCookies(raw);

  // A bare sessionid value pasted on its own is a legitimate input.
  const bare = raw && !raw.includes("=") && !/\s/.test(raw) ? raw : "";
  const sessionId = cookies.sessionid ?? bare;

  if (!sessionId) {
    return {
      ok: false,
      message: raw
        ? `No \`sessionid\` found in that paste. Found: ${
            Object.keys(cookies).join(", ") || "nothing recognisable"
          }. Copy the whole Cookie header, or just the sessionid value on its own.`
        : "Paste your burner account's cookies first.",
    };
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
  return {
    ok: true,
    message: `Added “${label}”. Hit Test to check it against Instagram — that takes 10-20 seconds.`,
  };
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
