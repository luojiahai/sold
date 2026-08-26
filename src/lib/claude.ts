import { spawn } from "node:child_process";

const CLAUDE_BIN = process.env.SOLD_CLAUDE_BIN ?? "claude";

export interface ClaudeResult {
  text: string;
  costUsd: number;
}

/** The envelope `claude -p --output-format json` produces. */
interface ClaudeEnvelope {
  is_error?: boolean;
  result?: string;
  total_cost_usd?: number;
}

/**
 * One non-interactive `claude -p` call.
 *
 * `--model` is always passed explicitly. The CLI's default model varies by
 * environment, and a detector whose model drifts underneath it produces
 * verdicts that cannot be compared across runs — which would defeat the point
 * of storing a detector id alongside every detection.
 */
export function runClaude(
  prompt: string,
  model: string,
  timeoutMs = 120_000,
): Promise<ClaudeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      CLAUDE_BIN,
      ["-p", "--output-format", "json", "--model", model],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`claude timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.on("data", (c: string) => (stderr += c));

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          err.code === "ENOENT"
            ? `claude CLI not found (looked for "${CLAUDE_BIN}"). Set SOLD_CLAUDE_BIN.`
            : err.message,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr.trim().slice(0, 500)}`));
        return;
      }

      try {
        const envelope = JSON.parse(stdout) as ClaudeEnvelope;
        if (envelope.is_error) {
          reject(new Error(`claude reported an error: ${envelope.result ?? "unknown"}`));
          return;
        }
        resolve({
          text: envelope.result ?? "",
          costUsd: envelope.total_cost_usd ?? 0,
        });
      } catch {
        reject(new Error(`could not parse claude output: ${stdout.slice(0, 300)}`));
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Extracts a JSON array from model output, tolerating markdown fences and
 * incidental prose. Cheap insurance: a single stray "Here's the JSON:" should
 * not cost a batch of ten classifications.
 */
export function extractJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
  } catch {
    // fall through to bracket scanning
  }

  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start !== -1 && end > start) {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (Array.isArray(parsed)) return parsed;
  }

  throw new Error(`no JSON array in model output: ${candidate.slice(0, 200)}`);
}
