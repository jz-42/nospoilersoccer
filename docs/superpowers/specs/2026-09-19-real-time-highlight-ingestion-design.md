# Real-Time Highlight Ingestion Design

**Goal:** Put an eligible broadcaster highlight on the correct match with the least practical delay, without exhausting YouTube quota and without guessing when assignment is ambiguous.

## Success criteria

- New eligible highlights normally become visible in an already-open browser within two minutes of publication.
- A missed notification is recovered by a quota-free poll within one minute.
- A video is attached only when the existing curator resolves exactly one finished fixture.
- Expensive historical discovery runs hourly instead of every five minutes.
- Runtime delivery does not wait for a Render deployment or page reload.
- Duplicate notifications, retries, and lost callbacks are idempotent.

## Trusted sources

- FOX Sports for World Cup highlights
- CBS Sports Golazo for Champions League highlights
- NBC Sports for Premier League highlights
- ESPN FC for La Liga highlights

The source-specific prefilter requires both the broadcaster's full-match highlight title shape and the expected competition. It rejects unrelated uploads such as CBS Serie A or NBC college-football highlights before they can start CI work.

## Production architecture

The fast path intentionally reuses the battle-tested Node curators as the only authoritative matcher:

1. The Cloudflare Worker receives a YouTube WebSub notification, or finds the upload in the channel's public Atom feed on its next one-minute cron.
2. The Worker verifies the exact configured channel and source-specific title shape, versions and deduplicates the candidate in D1, then sends it through Cloudflare Queues.
3. The Queue consumer dispatches `curate-highlight.yml` with the exact video ID and trusted source ID.
4. The narrow GitHub workflow fetches authoritative metadata for only that ID and invokes the existing competition-specific curator.
5. The curator verifies channel, title, teams, competition, completion, publication timing, fixture uniqueness, embeddability, and duplicates. It fails closed on ambiguity.
6. If accepted, CI validates, builds compact runtime highlight JSON, and commits it to `main`.
7. The Worker serves the generated JSON with a 15-second edge cache and ETag. Open clients poll every 30 seconds and append valid new cuts without replacing bundled data.

This avoids maintaining two independent matchers. The same code that has repository context makes every final match decision, so the fast discovery path cannot weaken correctness.

## Discovery and recovery

### WebSub fast path

The Worker exposes `/websub/youtube` and supports Google's subscription verification and Atom notifications. It automatically requests or renews all four channel subscriptions, records the verified lease, and renews before expiry. Video ID plus a hash of title/published/updated is the idempotency key, so retitles are reconsidered while duplicate delivery is harmless.

### One-minute quota-free recovery

Every Worker cron fetches each channel's public Atom feed. These requests do not use the YouTube Data API key or its daily quota. Changed candidates enter the same D1/Queue path as WebSub. This catches missed or late push notifications within one minute.

### Hourly deep recovery

The long-running results workflow retains the existing bounded playlist scans, but runs them only on cycle 1 (roughly hourly), not every five-minute cycle:

- FOX: 100 uploads
- Golazo: 150 uploads
- NBC: 600 uploads
- ESPN FC: 400 uploads

This repairs gaps older than the short Atom feeds. Results and odds continue at their existing five-minute cadence.

## Fail-closed match assignment

Discovery never assigns a match. The exact-ID curator publishes only after all existing checks pass:

1. API channel ID equals the configured source channel.
2. Source is authorized for the target competition.
3. Title matches the broadcaster and competition format.
4. Both names resolve to distinct tournament teams.
5. The fixture is finished and the upload is after kickoff.
6. Date, round, and leg hints agree when present.
7. Exactly one fixture remains.
8. The video is embeddable and not already stored.

The World Cup matcher no longer uses “latest fixture” as a tie-breaker for repeated pairings. Zero or multiple candidates produce no write and are retried; they are never guessed.

## Runtime delivery and failure behavior

The committed TypeScript maps remain canonical. `build-highlight-state.ts` creates one compact JSON snapshot per tournament. The browser validates tournament ID, schema, video IDs, version, and staleness before applying an append-only overlay.

If the Worker or snapshot is unavailable, the app keeps its last valid runtime snapshot for five minutes and always retains bundled highlights. A runtime response can add and deduplicate videos but cannot delete or replace bundled cuts.

D1 candidate states are `pending`, `queued`, `dispatched`, `retry`, and `accepted`. Queue delivery and GitHub dispatch are at-least-once. A lost success callback is safe: a rerun detects the already-persisted YouTube ID and acknowledges it as accepted. Stale callbacks are constrained by the candidate content version.

## Quota budget

The normal Worker fast path uses zero YouTube Data API units: WebSub and public Atom feeds are unauthenticated feed traffic.

The bounded hourly playlist recovery costs 25 `playlistItems.list` pages per run, or 600 units per day. Metadata is fetched only for title-screened candidates; targeted fast-path runs fetch one video's metadata. Even allowing substantial metadata and operational headroom, this is far below the prior every-five-minute design and the default 10,000-unit daily quota.

An optional Worker API-key fallback is separately metered in D1 with an 8,000-unit hard ceiling and degradation thresholds at 7,000 and 7,500. Production does not require that key because the Atom feed is the minute-level recovery path.

## Verification

Automated coverage includes:

- repeated World Cup pairings refuse ambiguous assignment;
- exact-ID mode avoids any playlist scan;
- source and competition title isolation;
- WebSub verification, renewal, deduplication, and queueing;
- one-minute feed recovery without quota calls;
- hard quota accounting for the optional API fallback;
- retry, callback, and lost-callback idempotency;
- runtime schema, append-only overlay, ETag, CORS, and stale-state behavior;
- workflow guards proving broad scans run only hourly.

Production rollout additionally verifies all four subscriptions, D1 migrations, Queue delivery, exact workflow dispatch, the runtime endpoint, and an open-browser update. Correctness remains higher priority than latency: an ambiguous video stays unpublished until it can be identified uniquely.
