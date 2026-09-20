# Cloudflare Scheduler

## Purpose

Cloudflare is the scheduler. GitHub Actions remains the executor.

Cloudflare also serves the runtime hot-state and highlight-state feeds, and
provides the WebSub/Atom fast highlight-ingestion path.

The Worker wakes up every minute. It checks quota-free public channel feeds,
renews WebSub subscriptions, retries durable candidates, and triggers
`.github/workflows/update-results.yml` on `main` whenever no previous run is
still active.

This exists because GitHub `schedule` is not reliable enough to provide continuous coverage during the live tournament. The GitHub workflow itself decides whether anything changed and commits only validated updates.

## Files

- Worker source: `cloudflare-scheduler/index.mjs`
- Highlight ingestion: `cloudflare-scheduler/highlights.mjs`
- Worker tests: `cloudflare-scheduler/index.test.mjs` and `cloudflare-scheduler/highlights.test.mjs`

## Match windows

The Worker still parses and reports conservative match windows for diagnostics:

- Group matches with `kickoff`: `kickoff + 90 minutes` through `kickoff + 8 hours`
- Knockout matches with `kickoff`: `kickoff + 90 minutes` through `kickoff + 12 hours`
- Knockout matches with only `date`: `date 00:00 UTC` through `date + 36 hours`

These windows no longer gate dispatch. They remain useful for checking whether the scheduler is running during expected result/highlight periods.

Windows are parsed from `wc2026.ts` only. Club competitions run roughly year-round
rather than in one burst, and dispatch is not window-gated, so they need no
window source.

## Schedule source

The Worker fetches and parses:

- `https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/src/data/wc2026.ts`

Expected parsed match count follows whatever is currently on `main`. For the full 2026 World Cup schedule, `104` is expected.

## Cloudflare configuration

Create a dedicated Worker, not a Pages build/deploy integration.

The reproducible deployment config is:

- `cloudflare-scheduler/wrangler.toml`

Deploy from the Worker directory:

```bash
cd cloudflare-scheduler
npm exec --yes wrangler -- deploy
```

If Wrangler says you are not authenticated, run:

```bash
npm exec --yes wrangler -- login
```

Then rerun the deploy command.

Required secret:

- `GITHUB_TOKEN`
- `HIGHLIGHT_CALLBACK_SECRET` (use the same random value as the GitHub Actions secret)

Optional secret:

- `SCHEDULER_TEST_SECRET`

Optional plain variables:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_WORKFLOW`
- `GITHUB_REF`
- `SCHEDULE_URL`
- `HOT_STATE_BASE_URL`
- `HIGHLIGHT_STATE_BASE_URL`
- `WEBSUB_CALLBACK_URL`

Recommended values if unset:

- `GITHUB_OWNER=jz-42`
- `GITHUB_REPO=nospoilersoccer`
- `GITHUB_WORKFLOW=update-results.yml`
- `GITHUB_REF=main`
- `WEBSUB_CALLBACK_URL=https://nospoilersoccer-scheduler.jerryzhan42.workers.dev/websub/youtube`

Cron Trigger:

- `* * * * *`

Required resources:

- D1 database bound as `HIGHLIGHT_DB`
- Queue producer/consumer bound as `HIGHLIGHT_QUEUE`
- dead-letter queue `nospoilersoccer-highlight-dead`

Apply `cloudflare-scheduler/migrations/0001_highlights.sql` before deployment.
The normal minute-level path does not require a Worker `YOUTUBE_API_KEY`;
leaving it unset avoids duplicating the hourly authenticated CI recovery.

## Highlight quota bounds

The fast path checks five public Atom feeds every minute and receives WebSub
notifications for the same five channels. Both paths use zero YouTube Data API
units. ESPN Deportes is the fifth source and is limited to its newest 100
uploads during a deep scan; its strict prefilter forwards only La Liga summary
titles and rejects known single-play goal/card/save titles.

When `YOUTUBE_API_KEY` is configured, a complete hourly deep sweep costs at
most 27 playlist requests, or 648 units across 24 hours. The updater's
five-minute ESPN Deportes recovery uses only the newest page, adding at most
288 playlist units per day plus the second page of each hourly deep scan.
Candidate metadata checks add a small bounded amount. Every Worker Data API
call reserves quota in D1 first, and the Worker hard-stops authenticated
recovery at 8,000 units per Pacific quota day; Atom/WebSub discovery remains
active at that cap. GitHub's independently bounded recovery stays below 936
playlist units/day (648 hourly deep + at most 288 five-minute fallback), before
the small number of metadata checks for titles that pass deterministic screens.

## GitHub token permissions

Use a fine-grained PAT scoped only to `jz-42/nospoilersoccer`.

Required permissions:

- `Actions: Read and write`
- `Metadata: Read-only`

The Worker does two GitHub API calls:

1. `GET /repos/{owner}/{repo}/actions/workflows/update-results.yml/runs?per_page=20`
2. `POST /repos/{owner}/{repo}/actions/workflows/update-results.yml/dispatches`

Dispatch payload:

```json
{ "ref": "main" }
```

If `/admin/test-dispatch` reports:

```json
{
  "action": "error",
  "github": {
    "status": 401
  }
}
```

then the `GITHUB_TOKEN` secret stored in Cloudflare is invalid, revoked, or was pasted incorrectly. Replace the Worker secret and rerun `/admin/test-dispatch`.

## Runtime behavior

The Worker logs one structured JSON object per scheduled execution:

- `now`
- `insideWindow`
- `activeWindowCount`
- `activeRunCount`
- `action`
- `github` on error only

Possible `action` values:

- `skip_active_run`
- `dispatch`
- `error`

## HTTP endpoints

Root diagnostic endpoint:

- `GET /`

This does not dispatch. It only reports:

- current time
- whether the Worker is inside a polling window
- number of active windows
- active window details
- parsed match count

Hot-state endpoint:

- `GET /api/hot-state/{seasonId}`

This proxies the generated `public/api/hot-state/{seasonId}.json` snapshot from
`main`, adds permissive CORS headers, and short-cache headers so the Render
site can poll it directly without waiting for a full redeploy.

`seasonId` is an allowlist, not a passthrough, so the Worker cannot be pointed
at arbitrary `raw.githubusercontent.com` paths:

- `wc2026` — World Cup
- `eng1-2026` — Premier League
- `esp1-2026` — La Liga
- `ucl-2026` — Champions League

An unknown season is a `404` with `error: unknown_season` (carrying CORS headers,
so a browser sees the real status rather than a CORS failure) rather than a `502`.

`wc2026` keeps honouring the single-season `HOT_STATE_URL` override, so its
resolved source path — and therefore the `sourcePath` echoed in the payload —
is unchanged from what the live site polls today. Club seasons always resolve
against `HOT_STATE_BASE_URL`.

Highlight-state endpoint:

- `GET /api/highlights/{seasonId}`

This serves generated validated highlight snapshots with a stable ETag and a
15-second edge cache. Browser conditional requests are supported through CORS.

Highlight ingestion endpoints:

- `GET|POST /websub/youtube` — Google subscription verification and Atom notifications
- `POST /admin/highlight-result` — authenticated GitHub workflow result callback

Admin test endpoint:

- `GET /admin/test-dispatch?secret=...`

This runs the scheduler logic immediately and can dispatch if:

- the secret matches `SCHEDULER_TEST_SECRET`
- the current time is inside a polling window
- no GitHub workflow run is already active

Rotate or delete `SCHEDULER_TEST_SECRET` after testing if it was ever set to an example value.

## Local verification

Run the focused Worker tests:

```bash
node --test cloudflare-scheduler/index.test.mjs cloudflare-scheduler/highlights.test.mjs
```

The parser should find `72` actual matches in the current `wc2026.ts`.

## Deployment note

After a successful deploy, open:

- `https://nospoilersoccer-scheduler.jerryzhan42.workers.dev/`

Expected diagnostic signals:

- `ok: true`
- `insideWindow` reports whether the current time is inside a configured match polling window
- `parsedMatchCount: 104` while `main` contains the full 2026 World Cup schedule
- `hotStateSeasons` lists the four seasons the hot-state endpoint will serve

## Run budget

`update-results.yml` has `timeout-minutes: 58`. The loop inside it is budgeted to
`LOOP_BUDGET_SECONDS=3000` (50 minutes) and paces itself to a true 5-minute
period by sleeping only the *remainder* of each cycle, then refuses to start a
cycle that the slowest cycle so far says would not finish in time.

This matters because the loop previously tested its deadline *before* sleeping,
so it could start one more cycle at `deadline + 300s` and overrun the job
timeout — which is what cancelled run `34300459923` at 58m04s. With four
competitions per cycle instead of one, that would have become the normal outcome.

Finishing early costs no coverage: Cloudflare dispatches the next run within
5 minutes of this one completing.
