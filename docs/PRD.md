# SOLD — Social-Origin Listing Discovery

**Status:** Prototype · **Platform in scope:** Instagram (X and TikTok deferred) · **Last updated:** 2026-08-26

---

## 1. The problem

Australia's major property portals — realestate.com.au and Domain — have effectively complete coverage of *on-market* listings. Any product that competes there competes on presentation, not on supply.

The listings they don't have are the ones that never reach them:

- **Off-market** sales, where a vendor wants a discreet transaction and an agent works a private buyer list.
- **Pre-market** teasers — "coming soon", "launching next week" — posted to build interest before the portal listing goes live.
- **Private sales** and small-agency listings where the portal fee isn't justified.
- **Sold results** posted immediately after auction, days before they appear anywhere structured.

These circulate on Instagram first, because that's where agents build their personal brands. A buyer's agent who sees a Bondi off-market post on the morning it goes up has days of advantage over one waiting for a portal listing that may never come.

SOLD finds those posts.

## 2. Users and value

**Primary user (product vision):** buyer's agents and active buyers who need supply the portals don't carry. The value is time — days of lead on off-market stock, and visibility into pre-market inventory.

**Secondary:** market analysts wanting coverage of social-origin listing supply as a dataset.

**This prototype's user is neither.** It is an instrument, and its user is whoever is deciding whether to build the product.

## 3. What the prototype is for

The prototype is a **supply-validation experiment**, not a shippable product. It exists to answer questions we cannot answer by reasoning:

1. **Yield** — how many genuine Australian property listings does a week of Instagram harvesting actually produce?
2. **Precision** — what fraction of collected posts survive detection? What does the noise look like?
3. **Uniqueness** — are these listings absent from the portals, or is this a slower mirror of REA?
4. **Cost** — what does a post cost to collect and classify, and does that scale?
5. **Durability** — how long does a burner session survive, and how quickly do the endpoints move?

Every one of those needs a number, and the system is instrumented to produce them: per-term yield, precision split by failure mode, per-run detector cost in USD, and an explicit termination reason on every crawl.

### Success criteria

The prototype succeeds if it produces a defensible answer to "is there enough unique listing supply on Instagram to build a product on?" — **including a well-evidenced no.**

### Explicit non-goals

Deduplicating against portal listings · address resolution and geocoding · alerting and saved searches · multi-tenancy · anything resembling production infrastructure.

## 4. Architecture

Three components, two of which are interfaces with multiple implementations. That pluggability isn't speculative generality — it's the direct consequence of a real constraint: **platform access is a moving target with a cost/risk/reliability trade-off, and the right choice will change.**

```
Seed terms ──▶ COLLECTOR ──▶ normalised posts ──▶ DETECTOR ──▶ verdicts ──▶ WEB
             (interface)         (SQLite)         (interface)
```

### 4.1 Collector

Takes seed terms and a date range; returns normalised posts. Every implementation emits the identical `CollectedPost` shape, so nothing downstream learns how the posts were obtained.

Access is against Instagram's **web** private API (`www.instagram.com/api/v1/...`) using burner-account browser cookies — the surface gallery-dl has kept working for years. An earlier attempt used instagrapi's client, which speaks to the mobile API at `i.instagram.com`; that surface rejects browser `sessionid` cookies outright, and hitting it with a fabricated device fingerprint invalidated the session it authenticated with. instagrapi remains a dependency only for `extract_media_v1`, since the media payloads share a shape.

| Collector | Status | Cost | Notes |
|---|---|---|---|
| `instagram-cookie` | **Implemented** | Free | Burner session + instagrapi private API |
| `instagram-vendor-api` | Placeholder | High | No session risk, no ToS exposure |
| `instagram-agentic` | Placeholder | High | Playwright + AI; resilient to endpoint change |
| `x-placeholder`, `tiktok-placeholder` | Deferred | — | Different access models |

The placeholders are declared in code and visible in the UI. They are the architecture's justification made concrete: the same contract can be satisfied by a free-but-fragile burner session or a paid-but-durable vendor, and that choice belongs to whoever runs the harvest.

#### The two Instagram strategies are not equivalent

This is the most important operational fact in the system.

**`hashtag_recent`** walks `tags/{tag}/sections/` with the recency filter. Results are approximately reverse-chronological, so the crawl can stop once posts fall before the start date and claim reasonable coverage of the window.

**`keyword_serp`** walks `fbsearch/top_serp/`, which is **algorithmically ranked**. Page 5 may be older *or* newer than page 2. There is no valid stopping condition and no coverage guarantee. It gets a fixed budget and a client-side date filter, and it reports `budget_exhausted` — never `date_cutoff` — so no downstream number can mistake it for exhaustive.

Neither endpoint supports server-side date filtering. Every run therefore records a **termination reason** per term:

| Reason | Meaning |
|---|---|
| `date_cutoff` | Walked back past the start date — good coverage |
| `budget_exhausted` | Hit the page/post cap — **counts are a floor, not a measurement** |
| `source_exhausted` | Instagram stopped returning results |
| `error` | Request failed |

Without this, a quiet week and a truncated crawl produce identical numbers, and every yield figure becomes uninterpretable.

### 4.2 Detector

AI-powered, because relevance here is a judgement call: a post mentioning property is not a listing, and a listing is not necessarily Australian.

The detector answers **two separate booleans**:

- `isListing` — does this advertise a specific real property?
- `isAustralia` — is that property in Australia?

Collapsing these would destroy the diagnostic signal. A Portland bungalow listing and a mortgage-broker ad both fail the filter, but they fail for opposite reasons: one is a seed-list problem, the other is a prompt problem. The run stats show that split.

The same call also extracts `listingType`, `suburb`, `state`, `priceText`, and `agency` — near-zero marginal cost once the model has read the caption, and the difference between a browsable feed and a list of links.

| Detector | Status | Notes |
|---|---|---|
| `claude-cli` | **Implemented** | `claude -p --output-format json`, batched, explicit `--model` |
| `claude-cli-vision` | Placeholder | Reads the cached thumbnail alongside the caption |
| `anthropic-api` | Placeholder | Metered API; the volume path |

Detections are stored **append-only**, one row per (post, detector, run). A re-run under a different detector adds a verdict rather than replacing one, which is what makes two detectors comparable head-to-head — the entire reason detection is an interface.

Reliability: batches of ~10 with 3 concurrent calls; a batch that fails to parse retries once, then falls back to per-post calls, so one malformed caption cannot poison nine good ones. A model that silently drops a post from its response fails the batch rather than leaving that post permanently undetected.

### 4.3 Web

- **Feed** — verified listings, filterable by state, listing type, and free text. Rejected posts are one dropdown away, with reasons.
- **Runs** — configure collector, detector, strategies, terms, date range, and budget; preflight; live progress; per-term outcomes; full config for reproducibility.
- **Post detail** — caption, verdict with reasoning, extracted fields, full detection history, and provenance (which runs saw it, via which term).
- **Keywords** — CRUD over the seed list with per-term yield: runs, posts seen, new, verified, and how often the term was truncated.
- **Sessions** — paste cookies, test, activate.

**The rejected view is a deliberate product decision.** During validation, what the detector throws away is the more informative half: it's how you see good posts being discarded, or noise the seed list should never have dragged in.

## 5. Data model

`posts` is the immutable raw record, deduped on `(platform, platformPostId)`. Re-collection refreshes engagement counts and the signed thumbnail URL but never rewrites provenance, and never re-queues an already-detected post.

`posts.raw` keeps the untouched source payload. When you discover in week three that Instagram was returning a field you didn't map, you backfill from the database instead of re-crawling — and re-crawling is the expensive, risky operation here.

| Table | Purpose |
|---|---|
| `posts` | Normalised, immutable post record |
| `detections` | Append-only verdicts, one per (post, detector, run) |
| `runs` | Harvest execution: status, counters, detector cost in USD |
| `run_terms` | Per-term outcome **including termination reason** |
| `run_posts` | Which run saw which post via which term — survives dedup |
| `run_events` | Append-only progress log |
| `keywords` | Seed terms, enabled flags |
| `sessions` | Burner credentials, status, device-fingerprint path |

SQLite via Drizzle, with checked-in migrations and no SQLite-only constructs — the Postgres port is a dialect swap.

## 6. Risks

### 6.1 Terms of Use — the central platform risk

**Cookie-based collection with burner accounts breaches Instagram's Terms of Use.** Meta has litigated against scrapers. The exposure is real and it is not mitigated by using throwaway accounts — it is only made cheaper to absorb.

This is acceptable for a local prototype whose purpose is to decide whether the product is worth building. It is **not** a foundation for a commercial product. If SOLD proceeds, the vendor-API collector stops being a placeholder and becomes the production path — which is precisely why it exists in the interface from day one. That migration is a config change, not a rewrite.

### 6.2 Platform fragility

Instagram removed the chronological "Recent" hashtag tab from the UI between 2020 and 2023; everything is ranked now. The API parameter that requests recency still exists and is what both gallery-dl and instagrapi send, but whether Instagram still honours it is **unverified against a live session** and is the largest open technical question in the build. If it is ignored, "collect a date range" degrades from a guarantee to a best-effort filter on both strategies.

Endpoints and payload shapes move without notice. Mitigation: instagrapi is a maintained dependency rather than hand-rolled endpoint archaeology, and `posts.raw` means a shape change is recoverable without re-crawling.

### 6.3 Detection blind spot

A significant share of Australian agency posts put the address, price, and auction time **in the image**, with a caption that is emojis and hashtags. Text-only detection misses those systematically. The multimodal detector placeholder exists to measure that gap: run both over the same post set and compare. *How much recall does caption-only detection cost?* is a finding this prototype should produce.

### 6.4 Session mortality

Session death is the most likely run failure — the first burner session tested for this project was invalidated within minutes, by our own mobile-API attempt. Mitigations: stay entirely on the web API surface a browser session is actually entitled to, conservative serial pacing with 3–8s jitter, an auth-gated preflight before every run, and a hard abort that marks the session expired on a login or challenge redirect rather than limping on.

Preflight endpoint choice is load-bearing: `users/web_profile_info/` answers 200 to an unauthenticated caller and would pass a dead session, so the check uses `accounts/edit/web_form_data/`, which redirects to login without a live session.

### 6.5 Prototype-grade execution

Runs execute in-process and die with the server. The `runs` table is the mitigation — an interrupted run is visibly stuck in `collecting` rather than silently absent. A job queue is the production fix and is out of scope.

## 7. Roadmap

**Now (prototype):** Instagram cookie collector, Claude CLI detector, web UI. → *Is there supply?*

**Next, if validated:**
1. Multimodal detector — measure the caption-only recall gap.
2. Vendor-API collector — remove the ToS and session-mortality risks.
3. Portal cross-reference — the uniqueness question, and the actual product claim.
4. Address resolution and geocoding.
5. X and TikTok collectors.
6. Alerting on saved searches — the first thing resembling a product.

## 8. Open questions

1. Does `tab=recent` still return chronological results on a live session? *Blocks the date-range guarantee.*
2. What is the real per-post cost at batch size 10 across a full run?
3. How long does a burner session survive at conservative pacing?
4. What share of verified listings are genuinely absent from REA and Domain?
5. Does the caption-only blind spot cost 5% of recall or 40%?

---

A designed, shareable version of this document is published at
https://claude.ai/code/artifact/33cd0b99-6d14-490b-877f-aa79fc6d3e76
(source: `docs/prd.html`).
