import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const path = resolve(process.env.SOLD_DB_PATH ?? "./data/sold.db");
mkdirSync(dirname(path), { recursive: true });

const sqlite = new Database(path);
sqlite.pragma("journal_mode = WAL");
migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
sqlite.close();

console.log(`migrated ${path}`);
