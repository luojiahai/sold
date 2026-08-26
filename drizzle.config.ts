import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.SOLD_DB_PATH ?? "./data/sold.db" },
} satisfies Config;
