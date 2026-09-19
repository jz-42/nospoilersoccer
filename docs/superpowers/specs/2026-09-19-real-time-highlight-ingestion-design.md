# Real-Time Highlight Ingestion Design

**Goal:** Make an eligible broadcaster highlight appear on the correct match with the least practical delay, without exhausting YouTube quota and without ever guessing when match assignment is ambiguous.

## Success criteria

- At least 95% of eligible highlights become visible on the production site within two minutes of becoming publicly available on an approved broadcaster channel.
- A missed or delayed notification is recovered automatically by polling.
- A video is never attached automatically unless exactly one finished fixture satisfies every matching rule.
- The curator stays within a self-imposed 8,000-unit daily YouTube Data API budget, leaving at least 2,000 units of the default 10,000-unit allocation unused.
- An already-open browser receives newly curated highlights without a Render deployment or page reload.
- Failures are observable: notification expiry, quota pressure, stale polling, rejected ambiguity, and publication failures produce distinct diagnostics.

## Scope

The system covers the four currently trusted YouTube channels:

- FOX Sports for World Cup highlights
- CBS Sports Golazo for Champions League highlights
- NBC Sports for Premier League highlights
- ESPN FC for La Liga highlights

The design changes highlight discovery, validation, publication, and runtime delivery. Score/result polling remains independent and continues on its existing cadence.

Adding new competitions or rights holders is outside this change except where the architecture must remain extensible to them.

## Architecture

The highlight pipeline has four independent layers.

Cloudflare provides the fast runtime path:

- **D1** stores subscriptions, channel cursors, candidate versions and verdicts, quota counters, and accepted runtime highlights.
- **Cloudflare Queues** buffers candidate processing and retries independently of webhook response time.
- The existing Worker exposes WebSub, polling, diagnostics, and runtime-highlight endpoints.
- The existing pure matching rules are extracted from the Node scripts into environment-neutral modules used by both the Worker and CI. Filesystem serialization remains in Node-only adapters.
- CI generates a compact curation catalog for each tournament containing fixtures, resolved participants, completion state, configured sources, and existing video IDs. The Worker refreshes these catalogs from the same short-cached source as hot state and records the catalog version used for every verdict.

The Worker is therefore able to make the same decision as CI without parsing TypeScript source or waiting for a Render build. CI remains the durable repository writer and independently revalidates every accepted decision before committing it.

### 1. Event-driven discovery

The Cloudflare Worker exposes a YouTube WebSub callback endpoint and subscribes to each approved channel feed. It handles subscription verification and receives upload, title-change, and description-change notifications.

Each notification is normalized into a durable candidate containing:

- YouTube video ID
- YouTube channel ID
- title from the notification
- notification timestamp
- event type or content version

Receiving the same event more than once is harmless. The video ID plus content version is the idempotency key.

The webhook writes the candidate to D1 and enqueues its ID before returning success. Queue consumers obtain authoritative metadata, load the latest curation catalog, execute the shared matcher, and persist the verdict. If a catalog still says the fixture is unfinished, the candidate stays retryable; it is reconsidered after the next results/catalog update.

Subscriptions must be renewed before their leases expire. Renewal status and the last notification time per channel are exposed in diagnostics. A failed renewal is an alert, not a silent degradation.

### 2. Polling recovery

Notifications are the fast path, not the sole path.

- Every minute, fetch only the newest 50 uploads from each of the four channels.
- Every hour, perform the existing bounded historical scans: FOX 100, Golazo 150, NBC 600, and ESPN FC 400 uploads.
- Track the last processed video ID and the last-seen title/version persistently so unchanged uploads do not trigger metadata calls or matching work again.
- A title change makes the candidate eligible for reprocessing.

The shallow poll catches missed notifications within one minute. The hourly scan repairs cursor mistakes, prolonged outages, and historical gaps.

Match schedules may increase urgency, but they do not disable either recovery layer. Broadcasters can publish or retitle videos outside predicted post-match windows.

### 3. Fail-closed curation

Webhook and polling candidates enter the same pure validation path. Discovery source must not change the matching decision.

A candidate is published only when all of these checks pass:

1. The API-reported channel ID equals the configured source channel.
2. The source is authorized for the target competition.
3. The title matches that source's full-match-highlight format.
4. The title identifies the competition or an allowed competition-specific round.
5. Both team names resolve to distinct teams in that tournament.
6. The fixture is marked finished by the results pipeline.
7. The video publication time is after kickoff.
8. Date, round, and leg hints agree with the fixture whenever present.
9. Exactly one fixture remains after filtering.
10. The video is embeddable and the match has no existing equivalent cut.

Anything unknown or ambiguous is quarantined rather than guessed. Quarantined candidates retain their reason and are retried when any relevant input changes: video title/version, match result, fixture participants, or curator rules.

The existing club matcher already follows this policy for reverse fixtures and two-leg ties. The World Cup matcher must be tightened: when the same teams have more than one eligible played fixture, it must return `ambiguous` unless explicit date/round evidence identifies one. It must no longer select the latest fixture merely because its kickoff is later.

Accepted writes are append-only and idempotent by YouTube video ID and match ID.

### 4. Runtime delivery

Highlights move into a runtime highlight-state payload rather than relying only on the compiled application bundle.

The canonical committed TypeScript video maps remain the durable repository record, but accepted decisions are first written transactionally to D1 and exposed as a validated runtime snapshot through Cloudflare. The snapshot contains only the minimal fields needed by the existing player:

- tournament ID
- match ID
- video source and ID
- highlight kind
- monotonically increasing version or generation timestamp

The client overlays runtime videos onto its bundled tournament data using the same append-only deduplication rules. It fetches immediately when a tournament opens and every 30 seconds thereafter. HTTP caching and ETags avoid downloading an unchanged payload.

If runtime state is unavailable or invalid, the application keeps using its bundled data. Runtime data can add a validated video but cannot delete or replace a bundled one.

An accepted D1 write creates an outbox record. A dedicated, narrowly scoped persistence workflow consumes that record, reruns the same matcher against the checked-out repository, updates the generated TypeScript video map, validates it, and commits it to `main`. The Worker marks the outbox item complete only after the committed version is observable. Failed persistence retries without withdrawing the already validated runtime entry.

## Quota budget

The budget assumes the currently documented one-unit cost for `playlistItems.list` and `videos.list`.

| Work | Maximum planned daily cost |
| --- | ---: |
| Four one-page channel polls every minute | 5,760 |
| Twenty-four complete recovery scans | 600 |
| New/changed-candidate metadata, batched where possible | 1,000 |
| Reserved operational headroom | 640 |
| **Hard application limit** | **8,000** |

The curator uses a dedicated YouTube API project/key so its accounting is not mixed with unrelated consumers. A durable counter records every quota-bearing request by method and resets at the provider's daily reset boundary.

At budget thresholds:

- At 7,000 units, stop hourly deep scans for the day.
- At 7,500 units, reduce shallow recovery polling to every two minutes.
- At 8,000 units, stop quota-bearing polling while continuing WebSub ingestion, local validation, non-quota embed checks, and queued retries that do not require an API call.
- Resume normal behavior after the daily reset.

Notifications themselves do not consume Data API polling quota. Metadata is fetched only for a new or changed candidate and is requested in batches of up to 50 IDs when multiple candidates are pending.

## Data and processing guarantees

- Candidate receipt is at-least-once; processing is idempotent.
- A durable queue separates webhook response time from curation work.
- Transient network and provider failures retry with exponential backoff and jitter.
- Permanent validation failures retain a reason and do not consume repeated metadata quota.
- Potentially temporary states, such as unfinished fixture, unknown embeddability, or missing result data, remain retryable.
- Snapshot publication is atomic through a D1 transaction: readers see the previous valid version or the complete new version, never a partial write.
- Repository persistence occurs asynchronously through an outbox, but the persistence workflow independently reruns the same versioned decision before writing.
- A catalog-version change requeues unresolved candidates and revalidates runtime-only accepted candidates before repository persistence.

## Observability

The Worker diagnostic surface and CI summaries report:

- WebSub subscription expiry and last successful renewal per channel
- last notification and last successful shallow/deep poll per channel
- daily quota usage by API method and current degradation level
- candidate counts by accepted, ignored, quarantined, and errored status
- time from upstream publication to discovery, acceptance, runtime publication, and client-visible snapshot
- age and version of each tournament's highlight snapshot

Alerts fire for:

- subscription renewal failure
- no successful shallow poll for three minutes
- quota use exceeding the expected trajectory or reaching a degradation threshold
- repeated provider/API errors
- a runtime snapshot older than five minutes while accepted work is pending
- failure to persist an accepted runtime update back to the repository

## Testing

### Matching tests

- Preserve all current broadcaster-title and competition-isolation cases.
- Add World Cup repeated-pair tests proving ambiguous candidates are refused.
- Cover reverse league fixtures, dated and undated titles, two-leg ties, retitles, pre-kickoff uploads, unfinished fixtures, duplicate notifications, and existing cuts.
- Prove that webhook and polled versions of the same candidate produce the same verdict.

### Quota tests

- Calculate one-minute and hourly scan costs from source configuration.
- Prove unchanged uploads do not trigger metadata requests.
- Prove metadata batching uses one request for up to 50 IDs.
- Exercise all three budget degradation thresholds and the daily reset.
- Verify that deep recovery work is sacrificed before the fast path.

### Delivery tests

- Validate and round-trip the runtime highlight-state schema.
- Prove runtime data only appends and deduplicates videos.
- Prove malformed, stale, or wrong-tournament snapshots are ignored.
- Prove an open client sees a newly published highlight on its next poll without a reload.

### Integration tests

- Replay representative WebSub verification and notification payloads.
- Simulate a missed notification and recover it through the shallow poll.
- Simulate a prolonged outage and recover it through the hourly deep scan.
- Send duplicates and out-of-order title updates and verify idempotency.
- Run a production-like soak test with accelerated time and assert that projected daily quota remains below 8,000.

## Rollout

1. Fix and test the World Cup ambiguity rule.
2. Add persistent candidate state, metadata batching, quota accounting, and shallow/deep scan modes while keeping the current publication path.
3. Extract the pure matcher, generate curation catalogs, and prove Worker/CI verdict parity.
4. Add D1-backed runtime highlight state, Worker serving, repository outbox persistence, and client overlay polling.
5. Deploy WebSub receipt, renewal, durable queue processing, and diagnostics.
6. Run WebSub and polling in observation mode, comparing their candidates with the existing curator without publishing from the new path.
7. Enable runtime publication for accepted candidates.
8. Keep the old five-minute curator as a temporary fallback during the observation period, then remove its redundant deep scans after production metrics demonstrate recovery coverage and quota headroom.

The production target is a p95 delay below two minutes from public upload to client-visible highlight. Correctness takes priority over this latency target: an ambiguous candidate remains unpublished until it becomes uniquely identifiable.
