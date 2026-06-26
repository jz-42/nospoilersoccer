# Cloudflare Scheduler

## Purpose

Cloudflare is the scheduler. GitHub Actions remains the executor.

The Worker wakes up every 5 minutes, checks whether the current time falls inside any oversized World Cup match polling window, and only then decides whether to trigger `.github/workflows/update-results.yml` on `main`.

This exists because GitHub `schedule` is not reliable enough to provide continuous coverage during match windows.

## Files

- Worker source: [cloudflare-scheduler/index.mjs](/Users/JerryZhan/conductor/workspaces/nospoilersoccer/havana/cloudflare-scheduler/index.mjs)
- Worker tests: [cloudflare-scheduler/index.test.mjs](/Users/JerryZhan/conductor/workspaces/nospoilersoccer/havana/cloudflare-scheduler/index.test.mjs)

## Match windows

- Group stage:
  - start at `kickoff + 90 minutes`
  - end at `kickoff + 8 hours`
- Knockout:
  - start at `kickoff + 90 minutes`
  - end at `kickoff + 12 hours`

These windows are intentionally conservative so the scheduler is active well after ordinary match completion and FOX upload time.

## Schedule source

The Worker fetches and parses:

- `https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/src/data/wc2026.ts`

Expected parsed match count follows whatever is currently on `main`. For the full 2026 World Cup schedule, `104` is expected.

## Cloudflare configuration

Create a dedicated Worker, not a Pages build/deploy integration.

The reproducible deployment config is:

- [cloudflare-scheduler/wrangler.toml](/Users/JerryZhan/conductor/workspaces/nospoilersoccer/havana/cloudflare-scheduler/wrangler.toml)

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

Optional secret:

- `SCHEDULER_TEST_SECRET`

Optional plain variables:

- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_WORKFLOW`
- `GITHUB_REF`
- `SCHEDULE_URL`

Recommended values if unset:

- `GITHUB_OWNER=jz-42`
- `GITHUB_REPO=nospoilersoccer`
- `GITHUB_WORKFLOW=update-results.yml`
- `GITHUB_REF=main`

Cron Trigger:

- `*/5 * * * *`

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

- `skip_outside_window`
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
node --test cloudflare-scheduler/index.test.mjs
```

The parser should find `72` actual matches in the current `wc2026.ts`.

## Deployment note

After a successful deploy, open:

- `https://nospoilersoccer-scheduler.jerryzhan42.workers.dev/`

Expected diagnostic signals:

- `ok: true`
- `insideWindow: true` during a configured match polling window
- `parsedMatchCount: 104` while `main` contains the full 2026 World Cup schedule
