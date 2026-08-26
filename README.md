# SOLD — Social-Origin Listing Discovery

Discovers Australian property listing posts on social media — off-market, pre-market, and small-agency stock the major portals don't carry.

See [`docs/PRD.md`](docs/PRD.md) for the product document, architecture rationale, and risks.

## Setup

```bash
npm install
npm run setup          # migrate + seed + build the Python collector venv
cp .env.example .env
npm run dev
```

`npm run setup:python` builds the collector's virtualenv. **It requires Python 3.11–3.13** — `pydantic-core` has no wheel for 3.14 and cannot build from source there. The script tries interpreters in order and reports which one worked.

## Before your first run

The Instagram collector authenticates as a burner account. Nothing collects until you add a session:

1. Log into Instagram as a burner account in a browser.
2. DevTools → Network → any request → Request Headers → copy the entire `Cookie` value.
3. Paste it at **Sessions → Add session** (a Netscape `cookies.txt` export works too; only `sessionid` is strictly required).
4. Click **Test**. Green means the session authenticated.
5. Go to **Runs**, click **Preflight**, then **Start harvest**.

> Collecting via burner-account cookies breaches Instagram's Terms of Use and risks account termination. See PRD §6.1.

## How it works

```
Seed terms ──▶ COLLECTOR ──▶ normalised posts ──▶ DETECTOR ──▶ verdicts ──▶ WEB
             (interface)         (SQLite)         (interface)
```

- **Collector** — `src/collectors/`. `instagram-cookie` drives a Python sidecar (`python/sold_collector/`) wrapping instagrapi, streaming NDJSON back to Node. Vendor-API and agentic collectors are declared placeholders.
- **Detector** — `src/detectors/`. `claude-cli` batches posts through `claude -p --output-format json`. Multimodal and API detectors are declared placeholders.
- **Web** — `src/app/`. Feed, Runs, Keywords, Sessions.

## Two things worth knowing

**The strategies are not equivalent.** `hashtag_recent` is roughly chronological and can honour a date cutoff. `keyword_serp` is algorithmically ranked, so it's budgeted and best-effort — it can never claim exhaustive coverage of a date range. Every term records *why* it stopped; `budget_exhausted` means the numbers are a floor, not a measurement.

**Detections are append-only.** Re-running a post through a different detector adds a verdict rather than replacing one, so implementations stay comparable. `posts.latestDetectionId` keeps the feed query a single join.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `SOLD_DB_PATH` | `./data/sold.db` | SQLite file |
| `SOLD_PYTHON` | `./python/.venv/bin/python` | Collector sidecar interpreter |
| `SOLD_CLAUDE_BIN` | `claude` | Claude CLI path |
| `SOLD_DETECT_MODEL` | `claude-sonnet-5` | Detector model |
| `SOLD_DETECT_BATCH_SIZE` | `10` | Posts per detector call |
| `SOLD_DETECT_CONCURRENCY` | `3` | Concurrent detector calls |

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the app |
| `npm run setup` | Migrate, seed, build the Python venv |
| `npm run db:generate` | Generate migrations from the schema |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed Australian property terms |
