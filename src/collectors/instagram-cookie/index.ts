import { spawn } from "node:child_process";
import { join, sep } from "node:path";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { readNdjson } from "@/lib/ndjson";
import { nowIso } from "@/lib/id";
import type {
  CollectEvent,
  CollectRequest,
  CollectedPost,
  Collector,
} from "../types";

/**
 * Assembled at runtime rather than written as a literal path.
 *
 * The bundler statically traces `resolve("...")` calls and tries to walk the
 * result — which means it follows the Python venv, hits its interpreter symlink
 * pointing outside the project, and fails the build. Joining the segments
 * defeats that analysis; these are process arguments, not module imports, and
 * were never meant to be bundled.
 */
const PYTHON_DIR = process.env.SOLD_PYTHON_DIR ?? [process.cwd(), "python"].join(sep);
const PYTHON_BIN =
  process.env.SOLD_PYTHON ?? join(PYTHON_DIR, ".venv", "bin", "python");

/** Events as the Python sidecar emits them. */
type SidecarEvent =
  | { type: "log"; level: "debug" | "info" | "warn" | "error"; message: string }
  | { type: "post"; post: CollectedPost }
  | {
      type: "term_complete";
      kind: "hashtag" | "keyword";
      term: string;
      strategy: string;
      postsSeen: number;
      postsInRange: number;
      pagesFetched: number;
      terminationReason: "date_cutoff" | "budget_exhausted" | "source_exhausted" | "error";
      error?: string;
    }
  | { type: "session_expired"; message: string }
  | { type: "error"; message: string }
  | { type: "preflight"; ok: boolean; username?: string; pk?: string }
  | { type: "done" };

interface SidecarRequest {
  mode: "collect" | "preflight";
  sessionId: string;
  cookies?: Record<string, string>;
  settingsPath?: string | null;
  since?: string;
  until?: string;
  maxPagesPerTerm?: number;
  maxPostsPerTerm?: number;
  delayRange?: [number, number];
  strategies?: string[];
  terms?: { kind: string; term: string }[];
}

function activeSession() {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.platform, "instagram"), eq(sessions.status, "active")))
    .limit(1)
    .get();
}

/**
 * Runs the sidecar and yields its events.
 *
 * stdin carries the request rather than argv, so long term lists and the
 * sessionid never appear in the process table.
 */
async function* runSidecar(request: SidecarRequest): AsyncGenerator<SidecarEvent> {
  const child = spawn(PYTHON_BIN, ["-m", "sold_collector"], {
    cwd: PYTHON_DIR,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    if (stderr.length > 8_000) stderr = stderr.slice(-8_000);
  });

  const spawnFailure = new Promise<never>((_, reject) => {
    child.once("error", (err: NodeJS.ErrnoException) =>
      reject(
        new Error(
          err.code === "ENOENT"
            ? `Python sidecar not found at ${PYTHON_BIN}. Run \`npm run setup:python\`.`
            : `Failed to start the collector sidecar: ${err.message}`,
        ),
      ),
    );
  });
  spawnFailure.catch(() => {}); // handled below; avoids an unhandled rejection

  child.stdin.write(JSON.stringify(request));
  child.stdin.end();

  try {
    yield* readNdjson<SidecarEvent>(child);
  } catch (err) {
    await Promise.race([spawnFailure, Promise.resolve()]);
    throw err;
  }

  const code = await new Promise<number>((res) => child.once("close", res));
  // Exit codes 3 (session expired) and 4 (rate limited) already emitted a typed
  // event; only unexplained failures need synthesising into one.
  if (code !== 0 && code !== 3 && code !== 4) {
    yield {
      type: "error",
      message: `collector sidecar exited with code ${code}${stderr ? `: ${stderr.trim().split("\n").slice(-3).join(" | ")}` : ""}`,
    };
  }
}

export const instagramCookieCollector: Collector = {
  id: "instagram-cookie",
  name: "Instagram (cookie session)",
  description:
    "Authenticated collection against Instagram's web API using burner-account browser cookies. Hashtag strategy walks the recency surface and can honour a date cutoff; keyword strategy uses the ranked search SERP and is best-effort only.",
  implemented: true,
  capabilities: {
    platform: "instagram",
    supportsDateCutoff: true,
    strategies: ["hashtag_recent", "keyword_serp"],
    costTier: "free",
  },

  async preflight() {
    const session = activeSession();
    if (!session) {
      return {
        ok: false,
        detail:
          "No active Instagram session. Add burner account cookies on the Sessions page.",
      };
    }

    try {
      for await (const event of runSidecar({
        mode: "preflight",
        sessionId: session.sessionId,
        cookies: session.cookies,
        settingsPath: session.settingsPath,
      })) {
        if (event.type === "preflight" && event.ok) {
          return {
            ok: true,
            detail: `Authenticated as @${event.username ?? "unknown"}.`,
          };
        }
        if (event.type === "session_expired" || event.type === "error") {
          return { ok: false, detail: event.message };
        }
      }
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
    return { ok: false, detail: "Sidecar produced no preflight result." };
  },

  async *collect(request: CollectRequest): AsyncIterable<CollectEvent> {
    const session = activeSession();
    if (!session) {
      yield {
        type: "session_expired",
        message: "No active Instagram session configured.",
      };
      return;
    }

    const strategies =
      (request.options?.strategies as string[] | undefined) ??
      this.capabilities.strategies;

    for await (const event of runSidecar({
      mode: "collect",
      sessionId: session.sessionId,
      cookies: session.cookies,
      settingsPath: session.settingsPath,
      since: request.since,
      until: request.until,
      maxPagesPerTerm: request.maxPagesPerTerm,
      maxPostsPerTerm: request.maxPostsPerTerm,
      delayRange: request.delayRange,
      strategies,
      terms: request.terms,
    })) {
      switch (event.type) {
        case "post":
        case "log":
        case "term_complete":
          yield event as CollectEvent;
          break;
        case "session_expired":
          db.update(sessions)
            .set({
              status: "expired",
              statusDetail: event.message,
              lastCheckedAt: nowIso(),
            })
            .where(eq(sessions.id, session.id))
            .run();
          yield { type: "session_expired", message: event.message };
          return;
        case "error":
          yield { type: "log", level: "error", message: event.message };
          break;
        case "done":
          return;
      }
    }
  },
};
