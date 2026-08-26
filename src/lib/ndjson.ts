import type { ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * Turns a child process's stdout into an async iterable of parsed JSON objects,
 * one per line. Buffers partial lines across chunk boundaries — a post payload
 * with a long caption will not arrive in a single chunk.
 */
export async function* readNdjson<T>(
  child: ChildProcessWithoutNullStreams,
): AsyncGenerator<T> {
  let buffer = "";
  child.stdout.setEncoding("utf8");

  for await (const chunk of child.stdout) {
    buffer += chunk;
    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) yield JSON.parse(line) as T;
    }
  }

  const rest = buffer.trim();
  if (rest) yield JSON.parse(rest) as T;
}
