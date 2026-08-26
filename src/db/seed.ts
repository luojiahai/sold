import { db, keywords } from "./index";
import { newId } from "../lib/id";
import { SEED_HASHTAGS, SEED_KEYWORDS } from "./seed-keywords";

const rows = [
  ...SEED_HASHTAGS.map((term) => ({ kind: "hashtag" as const, term })),
  ...SEED_KEYWORDS.map((term) => ({ kind: "keyword" as const, term })),
].map(({ kind, term }) => ({
  id: newId(),
  platform: "instagram",
  kind,
  term,
  enabled: true,
  notes: null,
}));

const result = db
  .insert(keywords)
  .values(rows)
  .onConflictDoNothing()
  .run();

console.log(`seeded ${result.changes} keyword(s) (${rows.length} candidates)`);
