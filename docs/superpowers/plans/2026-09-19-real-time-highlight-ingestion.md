# Real-Time Highlight Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver each unambiguous, validated broadcaster highlight to the correct match within two minutes while staying below an enforced 8,000-unit daily YouTube quota budget.

**Architecture:** Extract fail-closed matching into shared pure modules, generate versioned curation catalogs, and extend the Cloudflare Worker with D1-backed candidate/quota/runtime state, a Queue consumer, WebSub ingestion, and shallow/deep recovery polling. The browser overlays a 30-second runtime highlight feed; a narrow GitHub workflow persists accepted entries back to the generated TypeScript maps.

**Tech Stack:** TypeScript 6, React 19, Node/tsx smoke tests, Cloudflare Workers, D1, Cloudflare Queues, YouTube Data API v3, YouTube WebSub, GitHub Actions.

---

## File map

- `src/highlights/sources.ts` — trusted channel/source configuration and channel-specific title parsers.
- `src/highlights/matcher.ts` — environment-neutral, fail-closed candidate-to-fixture decision logic.
- `src/highlights/matcher.smoke.ts` — shared matcher regression coverage, including repeated-pair ambiguity.
- `scripts/curate-videos.ts` — World Cup filesystem adapter using the shared matcher.
- `scripts/curate-club-videos.ts` — club filesystem adapter using the shared matcher.
- `src/data/highlight-state.ts` — runtime payload parser and append-only tournament overlay.
- `src/data/highlight-state.smoke.ts` — runtime state validation/merge tests.
- `scripts/build-curation-catalog.ts` — generates Worker-readable fixture/source/video catalogs.
- `public/api/curation-state/*.json` — generated matcher input.
- `cloudflare-scheduler/highlights.ts` — WebSub parsing, YouTube clients, quota policy, polling, candidate processing, and runtime responses.
- `cloudflare-scheduler/highlights.test.ts` — pure Worker highlight tests with fake D1/Queue/fetch adapters.
- `cloudflare-scheduler/index.ts` — scheduler entry point plus highlight routes, cron work, and queue consumer.
- `cloudflare-scheduler/migrations/0001_highlights.sql` — durable subscription, cursor, candidate, quota, runtime highlight, and outbox schema.
- `cloudflare-scheduler/wrangler.toml` — one-minute cron plus D1 and Queue bindings.
- `scripts/persist-runtime-highlight.ts` — CI-side revalidation and append-only TypeScript serialization for one accepted outbox record.
- `.github/workflows/persist-highlight.yml` — narrow persistence workflow dispatched by the Worker.
- `src/App.tsx` — 30-second runtime highlight fetch and overlay.
- `.github/workflows/update-results.yml` — stop quota-expensive highlight scans after the new pipeline is enabled; continue results/odds.
- `docs/cloudflare-scheduler.md` — resource provisioning, secrets, WebSub subscription, rollback, and production verification.

### Task 1: Make all match assignment strictly fail closed

**Files:**
- Create: `src/highlights/sources.ts`
- Create: `src/highlights/matcher.ts`
- Create: `src/highlights/matcher.smoke.ts`
- Modify: `scripts/curate-videos.ts`
- Modify: `scripts/curate-club-videos.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing shared-matcher tests**

Create tests that construct two finished fixtures for the same pair and assert an undated candidate returns `ambiguous`, while a dated league title or explicit knockout leg resolves exactly one fixture. Also assert wrong channel, wrong competition, unfinished fixture, pre-kickoff publication, unknown embed state, and duplicate cut all reject.

```ts
const ambiguous = matchHighlightCandidate(catalogWithRepeatedPair, {
  videoId: 'abcdefghijk',
  channelId: FOX_CHANNEL_ID,
  title: 'Canada vs Japan Highlights 2026 FIFA World Cup',
  publishedAt: '2026-07-20T00:00:00Z',
  embeddable: 'yes',
})
assert.equal(ambiguous, { status: 'quarantine', reason: 'more_than_one_candidate_fixture' })
```

- [ ] **Step 2: Run the test and confirm the existing latest-fixture behavior fails it**

Run: `npx tsx src/highlights/matcher.smoke.ts`

Expected: FAIL because `src/highlights/matcher.ts` does not exist.

- [ ] **Step 3: Extract source parsing and implement one shared verdict type**

Define these public interfaces and keep all matching pure:

```ts
export type HighlightVerdict =
  | { status: 'accept'; tournamentId: string; matchId: string; video: HighlightVideo }
  | { status: 'ignore'; reason: string }
  | { status: 'quarantine'; reason: string; retryOn: Array<'video' | 'catalog' | 'embed'> }

export interface HighlightCandidate {
  videoId: string
  channelId: string | null
  title: string
  publishedAt: string | null
  durationSeconds?: number
  embeddable: 'yes' | 'no' | 'unknown'
}

export function matchHighlightCandidate(
  catalog: HighlightCurationCatalog,
  candidate: HighlightCandidate,
): HighlightVerdict
```

Require exactly one eligible fixture after source, title, competition, team, completion, kickoff, date/round/leg, and existing-cut filters. Never use “latest fixture” as a tie-breaker.

- [ ] **Step 4: Make both curator scripts thin adapters**

Keep playlist/network access and filesystem serialization in the scripts. Replace their independent fixture-selection branches with `matchHighlightCandidate`; translate `quarantine` to retryable output and preserve existing append-only serialization rules.

- [ ] **Step 5: Run focused and full matcher tests**

Run: `npx tsx src/highlights/matcher.smoke.ts && npx tsx scripts/curate-videos.smoke.ts && npx tsx scripts/curate-club-videos.smoke.ts`

Expected: all print their success sentinels with no `FAIL`.

- [ ] **Step 6: Commit**

```bash
git add src/highlights scripts/curate-videos.ts scripts/curate-club-videos.ts package.json
git commit -m "Make highlight matching fail closed"
```

### Task 2: Add versioned curation catalogs

**Files:**
- Create: `scripts/build-curation-catalog.ts`
- Create: `scripts/build-curation-catalog.smoke.ts`
- Create: `public/api/curation-state/wc2026.json`
- Create: `public/api/curation-state/eng1-2026.json`
- Create: `public/api/curation-state/esp1-2026.json`
- Create: `public/api/curation-state/ucl-2026.json`
- Modify: `package.json`
- Modify: `.github/workflows/update-results.yml`

- [ ] **Step 1: Write a failing catalog round-trip test**

Assert each generated catalog validates, has a deterministic SHA-256 version, includes every fixture with resolved participant IDs and completion state, and contains existing video keys.

```ts
const catalog = buildHighlightCurationCatalog(eng1_2026)
assert.equal(catalog.tournamentId, 'eng1-2026')
assert.equal(catalog.fixtures.length, 380)
assert.match(catalog.version, /^[a-f0-9]{64}$/)
assert.deepEqual(parseHighlightCurationCatalog(JSON.parse(JSON.stringify(catalog))), catalog)
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx scripts/build-curation-catalog.smoke.ts`

Expected: FAIL because the builder is missing.

- [ ] **Step 3: Implement deterministic catalog generation**

Serialize stable, sorted JSON with:

```ts
interface HighlightCurationCatalog {
  schemaVersion: 1
  version: string
  generatedAt: string
  tournamentId: string
  teams: Record<string, { name: string }>
  fixtures: Array<{
    id: string
    home: string | null
    away: string | null
    kickoff: string
    date: string
    competitionId: string
    roundId: string | null
    leg: 1 | 2 | null
    finished: boolean
    existingVideoKeys: string[]
  }>
}
```

Calculate `version` from the stable payload excluding `generatedAt` and `version`.

- [ ] **Step 4: Wire catalog generation into update validation**

Add `build:curation-state` and run it beside `build:hot-state` before commits. Stage the four generated catalog paths.

- [ ] **Step 5: Verify generation and invariants**

Run: `npm run build:curation-state && npx tsx scripts/build-curation-catalog.smoke.ts && git diff --check`

Expected: four files written; all assertions pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-curation-catalog.ts scripts/build-curation-catalog.smoke.ts public/api/curation-state package.json .github/workflows/update-results.yml
git commit -m "Generate highlight curation catalogs"
```

### Task 3: Add append-only runtime highlight state to the client

**Files:**
- Create: `src/data/highlight-state.ts`
- Create: `src/data/highlight-state.smoke.ts`
- Modify: `src/App.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write failing parser and overlay tests**

Cover valid YouTube/FOX records, malformed IDs, wrong tournament, duplicate runtime entries, bundled-video preservation, and runtime attempts to replace an existing kind.

```ts
const next = applyRuntimeHighlights(baseTournament, {
  schemaVersion: 1,
  tournamentId: baseTournament.id,
  version: 4,
  generatedAt: '2026-09-19T23:00:00Z',
  matches: { A1: [{ youtubeId: 'abcdefghijk', kind: 'normal' }] },
})
assert.equal(next.groupMatches[0].videos?.[0]?.youtubeId, 'abcdefghijk')
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx src/data/highlight-state.smoke.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement schema parsing and append-only overlay**

Export `parseRuntimeHighlightState`, `applyRuntimeHighlights`, and `applyHighlightPollFailure`. Reject unknown fields that can affect playback, validate 11-character YouTube IDs, and use `highlightKey` plus existing preferred-video rules without replacing bundled entries.

- [ ] **Step 4: Poll runtime highlights independently in `TournamentShell`**

Add `HIGHLIGHT_STATE_POLL_MS = 30_000`, fetch immediately on season mount, apply the overlay after result hot state, honor `ETag` with `If-None-Match`, and retain the last valid payload for five minutes on transient failure.

- [ ] **Step 5: Run client tests and typecheck**

Run: `npx tsx src/data/highlight-state.smoke.ts && npm run test:components && npx tsc -b`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/highlight-state.ts src/data/highlight-state.smoke.ts src/App.tsx package.json
git commit -m "Overlay runtime highlight updates"
```

### Task 4: Add D1 state and quota enforcement

**Files:**
- Create: `cloudflare-scheduler/migrations/0001_highlights.sql`
- Create: `cloudflare-scheduler/highlights.ts`
- Create: `cloudflare-scheduler/highlights.test.ts`
- Create: `cloudflare-scheduler/tsconfig.json`
- Modify: `cloudflare-scheduler/wrangler.toml`
- Modify: `package.json`

- [ ] **Step 1: Write failing quota-policy tests**

Assert normal mode below 7,000, no deep scan at 7,000, two-minute shallow mode at 7,500, no quota-bearing poll at 8,000, and reset at midnight America/Los_Angeles.

```ts
assert.equal(quotaMode(6999), 'normal')
assert.equal(quotaMode(7000), 'no_deep')
assert.equal(quotaMode(7500), 'slow_shallow')
assert.equal(quotaMode(8000), 'websub_only')
```

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test cloudflare-scheduler/highlights.test.ts`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Create the D1 schema**

Create tables `subscriptions`, `channel_cursors`, `candidates`, `quota_usage`, `runtime_highlights`, and `persistence_outbox`. Add unique constraints on `(video_id, content_version)`, `(tournament_id, match_id, video_key)`, and outbox acceptance ID.

- [ ] **Step 4: Implement quota accounting behind an adapter**

Expose:

```ts
interface HighlightStore {
  quotaUsed(day: string): Promise<number>
  consumeQuota(day: string, method: string, units: number): Promise<boolean>
  upsertCandidate(candidate: CandidateRecord): Promise<'inserted' | 'updated' | 'unchanged'>
}
```

`consumeQuota` must use one atomic D1 statement that refuses a write causing total usage above 8,000.

- [ ] **Step 5: Configure local bindings without creating remote resources**

Add D1 binding `HIGHLIGHT_DB`, Queue producer/consumer `HIGHLIGHT_QUEUE`, migrations directory, one-minute cron, and queue retry/dead-letter settings to `wrangler.toml`. Do not run remote create/apply/deploy commands in this task.

- [ ] **Step 6: Apply migration locally and run tests**

Run: `npm exec --yes wrangler -- d1 migrations apply HIGHLIGHT_DB --local --config cloudflare-scheduler/wrangler.toml && npx tsx --test cloudflare-scheduler/highlights.test.ts`

Expected: migration applied; all quota/store tests pass.

- [ ] **Step 7: Commit**

```bash
git add cloudflare-scheduler package.json
git commit -m "Add durable highlight ingestion state"
```

### Task 5: Implement WebSub ingestion and subscription renewal

**Files:**
- Modify: `cloudflare-scheduler/highlights.ts`
- Modify: `cloudflare-scheduler/highlights.test.ts`
- Modify: `cloudflare-scheduler/index.mjs` (rename to `index.ts`)
- Modify: `cloudflare-scheduler/index.test.mjs` (rename to `index.test.ts`)
- Modify: `cloudflare-scheduler/wrangler.toml`

- [ ] **Step 1: Write failing verification and notification tests**

Replay a real-format verification GET and Atom POST. Assert unknown channels reject, approved notifications persist before enqueue, duplicate versions do not enqueue twice, and malformed XML returns 400.

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test cloudflare-scheduler/index.test.ts cloudflare-scheduler/highlights.test.ts`

Expected: route tests fail because `/websub/youtube` is absent.

- [ ] **Step 3: Implement WebSub routes and Atom parsing**

Handle `hub.mode`, `hub.topic`, `hub.challenge`, `hub.lease_seconds`, and Atom entries containing `yt:videoId`, `yt:channelId`, title, published, and updated. Hash the normalized title/published/updated tuple as `contentVersion`.

- [ ] **Step 4: Implement renewal**

On cron, renew any subscription expiring within 24 hours by POSTing to `https://pubsubhubbub.appspot.com/subscribe`. Store requested/verified/expiry timestamps and surface them in `/` diagnostics.

- [ ] **Step 5: Run Worker tests**

Run: `npx tsx --test cloudflare-scheduler/index.test.ts cloudflare-scheduler/highlights.test.ts && npx tsc -p cloudflare-scheduler/tsconfig.json`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cloudflare-scheduler
git commit -m "Receive YouTube highlight notifications"
```

### Task 6: Implement quota-bounded shallow and deep recovery

**Files:**
- Modify: `cloudflare-scheduler/highlights.ts`
- Modify: `cloudflare-scheduler/highlights.test.ts`
- Modify: `cloudflare-scheduler/index.ts`

- [ ] **Step 1: Write failing recovery tests**

Assert four one-page requests per normal minute, full page counts of 2/3/12/8 only on the hourly deep pass, no metadata request for unchanged ID/version, title changes requeue, and budget degradation preserves WebSub.

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test cloudflare-scheduler/highlights.test.ts`

Expected: recovery tests fail.

- [ ] **Step 3: Implement YouTube playlist and batched metadata clients**

Each request must reserve quota atomically before fetching. Shallow scans request one 50-item page. Deep scans stop at configured depth or 30-day floor. `videos.list` batches up to 50 candidate IDs with `part=snippet,contentDetails`.

- [ ] **Step 4: Integrate polling into one-minute cron**

Keep existing GitHub results scheduling, then run shallow recovery according to quota mode and deep recovery only at minute `00`. Failures are isolated and logged with structured status.

- [ ] **Step 5: Verify quota projection and recovery**

Run: `npx tsx --test cloudflare-scheduler/highlights.test.ts && npx tsc -p cloudflare-scheduler/tsconfig.json`

Expected: tests report projected base daily cost `6360` and hard maximum `8000`.

- [ ] **Step 6: Commit**

```bash
git add cloudflare-scheduler
git commit -m "Add quota-safe highlight recovery polling"
```

### Task 7: Process candidates and serve runtime highlights

**Files:**
- Modify: `cloudflare-scheduler/highlights.ts`
- Modify: `cloudflare-scheduler/highlights.test.ts`
- Modify: `cloudflare-scheduler/index.ts`
- Modify: `cloudflare-scheduler/wrangler.toml`

- [ ] **Step 1: Write failing queue and runtime endpoint tests**

Cover accepted, ignored, retryable, and ambiguous candidates; duplicate queue deliveries; catalog version changes; oEmbed failure; atomic accepted write plus outbox; ETag/304; and wrong tournament 404.

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx --test cloudflare-scheduler/highlights.test.ts cloudflare-scheduler/index.test.ts`

Expected: queue/runtime tests fail.

- [ ] **Step 3: Implement queue processing**

Fetch authoritative metadata only when the stored version lacks it, check oEmbed, fetch the latest catalog, run `matchHighlightCandidate`, and persist the verdict. Retry transient fetch/embed/catalog failures with exponential backoff; acknowledge permanent ignore/quarantine results.

- [ ] **Step 4: Implement runtime endpoint**

Serve `GET /api/highlights/{tournamentId}` with the validated schema, stable ETag, CORS, `cache-control: public, max-age=15`, and 304 handling. Unknown tournaments return a CORS-enabled 404.

- [ ] **Step 5: Verify Worker behavior**

Run: `npx tsx --test cloudflare-scheduler/*.test.ts && npx tsc -p cloudflare-scheduler/tsconfig.json`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cloudflare-scheduler
git commit -m "Publish validated runtime highlights"
```

### Task 8: Persist accepted highlights back to the repository

**Files:**
- Create: `scripts/persist-runtime-highlight.ts`
- Create: `scripts/persist-runtime-highlight.smoke.ts`
- Create: `.github/workflows/persist-highlight.yml`
- Modify: `cloudflare-scheduler/highlights.ts`
- Modify: `cloudflare-scheduler/highlights.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing persistence tests**

Given an accepted payload, assert the script reloads the current catalog/tournament, reruns the matcher, appends only the expected video, refuses stale/ambiguous decisions, and is a no-op for an existing video ID.

- [ ] **Step 2: Run and verify failure**

Run: `npx tsx scripts/persist-runtime-highlight.smoke.ts`

Expected: FAIL because the script is missing.

- [ ] **Step 3: Implement the narrow persistence script**

Accept JSON only through a named file path, validate every field, rerun matching against repository data, update only the owning generated video map, and print a machine-readable acceptance ID.

- [ ] **Step 4: Add the persistence workflow**

Use `workflow_dispatch` inputs `acceptance_id` and `payload_url`; download only from the configured Worker origin using a bearer secret, run the persistence script and focused tests, commit, pull with rebase, and push `main`. Keep a separate concurrency group `persist-highlight` and retry-safe no-op behavior.

- [ ] **Step 5: Add Worker outbox dispatch and acknowledgment**

Dispatch pending outbox items through the GitHub Actions API. Expose a secret-authenticated acknowledgment endpoint that verifies the acceptance ID and committed video key before marking the outbox complete.

- [ ] **Step 6: Run persistence and Worker tests**

Run: `npx tsx scripts/persist-runtime-highlight.smoke.ts && npx tsx --test cloudflare-scheduler/*.test.ts && npm run check:update`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/persist-runtime-highlight.ts scripts/persist-runtime-highlight.smoke.ts .github/workflows/persist-highlight.yml cloudflare-scheduler package.json
git commit -m "Persist runtime highlights to main"
```

### Task 9: Cut over workflows and document operations

**Files:**
- Modify: `.github/workflows/update-results.yml`
- Modify: `docs/cloudflare-scheduler.md`
- Modify: `README.md`

- [ ] **Step 1: Add a guarded cutover flag**

Keep the legacy five-minute curators enabled unless Worker variable `RUNTIME_HIGHLIGHTS_ENABLED` is true and diagnostics report healthy subscriptions, a successful shallow poll within three minutes, and quota mode below `websub_only`. Document the rollback as setting the flag false and redeploying the Worker.

- [ ] **Step 2: Remove redundant quota spend only behind the flag**

When runtime ingestion is enabled, skip YouTube curation inside `update-results.yml` while continuing all results, live-status, odds, validation, and hot-state work.

- [ ] **Step 3: Document provisioning and subscriptions**

Document exact commands for creating/applying D1 and Queue resources, setting `YOUTUBE_API_KEY`, `GITHUB_TOKEN`, `PERSISTENCE_TOKEN`, applying migrations, deploying, requesting four WebSub subscriptions, checking diagnostics, enabling observation mode, enabling publication, and rolling back.

- [ ] **Step 4: Run the complete local verification suite**

Run: `npm run check && npm run lint && npm run build && npx tsx --test cloudflare-scheduler/*.test.ts && npx tsc -p cloudflare-scheduler/tsconfig.json && npm exec --yes wrangler -- deploy --dry-run --config cloudflare-scheduler/wrangler.toml`

Expected: every command exits 0; Wrangler reports a valid bundle and bindings without deploying.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/update-results.yml docs/cloudflare-scheduler.md README.md
git commit -m "Document real-time highlight operations"
```

### Task 10: Provision, deploy, observe, and verify production

**Files:**
- Modify only generated resource IDs in `cloudflare-scheduler/wrangler.toml` if Wrangler writes them.
- Save non-secret verification artifacts under `.context/`.

- [ ] **Step 1: Confirm authentication and inventory without mutation**

Run: `npm exec --yes wrangler -- whoami` and `gh auth status`.

Expected: authenticated Cloudflare and GitHub accounts with access to the existing Worker/repository. Stop before provisioning if either identity is unexpected.

- [ ] **Step 2: Create missing resources and apply the migration**

Use explicit names `nospoilersoccer-highlights` and `nospoilersoccer-highlight-candidates`; list resources first and create only those absent. Apply `0001_highlights.sql` remotely and verify the migration list.

- [ ] **Step 3: Set required secrets without printing values**

Use Wrangler secret input for the dedicated YouTube key and persistence token. Reuse the existing scoped GitHub token only if its repository permissions are sufficient; otherwise stop and report the missing permission rather than broadening it silently.

- [ ] **Step 4: Deploy in observation mode**

Deploy the Worker with runtime publication disabled. Request all four WebSub subscriptions and confirm their verified expiries plus successful one-minute polling in diagnostics.

- [ ] **Step 5: Observe quota and verdict parity**

For at least one complete shallow/deep cycle, compare new candidates and verdicts with the legacy curator, confirm no duplicate metadata fetches, and record projected daily quota below 8,000.

- [ ] **Step 6: Enable runtime publication and perform a controlled replay**

Replay a known already-persisted highlight notification. Verify idempotent no-op behavior, then use a test-only candidate fixture in local/preview state to verify acceptance, endpoint propagation, browser overlay, and outbox persistence without adding a fake production highlight.

- [ ] **Step 7: Production verification**

Confirm the live endpoints return fresh ETags, the site requests runtime highlights every 30 seconds, all four subscriptions are healthy, quota counters match expected API calls, and no existing match/video assignment changed.

- [ ] **Step 8: Enable cutover and preserve rollback**

Enable `RUNTIME_HIGHLIGHTS_ENABLED`, verify the next results cycle skips only legacy YouTube scans, and retain the documented one-variable rollback until at least one real highlight has completed the full notification-to-client-to-repository path.

- [ ] **Step 9: Commit any generated binding IDs**

```bash
git add cloudflare-scheduler/wrangler.toml
git diff --cached --quiet || git commit -m "Record highlight ingestion bindings"
```

## Final acceptance

- [ ] An ambiguous repeated pairing is quarantined in both club and World Cup paths.
- [ ] A valid candidate reaches the correct runtime match and persists idempotently.
- [ ] An open production page observes runtime additions without reload or Render deploy.
- [ ] A missed notification is recovered by the next shallow scan.
- [ ] A prolonged gap is recovered by the hourly scan.
- [ ] The measured/projected daily cost remains below 8,000 and all degradation thresholds work.
- [ ] Subscription, polling, quota, candidate, runtime, and outbox health are visible without exposing secrets or spoilers.
- [ ] Full repository, Worker, build, lint, and dry-run deploy verification passes.
