import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema";

export const DB_PATH = resolve(process.env.SOLD_DB_PATH ?? "./data/sold.db");

/**
 * Single connection for the whole process. better-sqlite3 is synchronous, which
 * suits a single-process prototype: no pool, no await, no lock dance.
 * Cached on globalThis so Next's dev-mode module reloading doesn't leak handles.
 */
function createClient() {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

const globalForDb = globalThis as unknown as {
  __soldDb?: ReturnType<typeof createClient>;
};

export const db = globalForDb.__soldDb ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__soldDb = db;

export { schema };
export * from "./schema";
