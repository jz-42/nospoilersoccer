# Runtime Hot State Design

**Goal:** Deliver live match state and finished results to the static site without waiting for a Render redeploy, while preserving the existing spoiler rules and per-match updater isolation.

## Architecture

The existing GitHub Action remains the single producer of canonical tournament updates. After each successful cycle, it generates a small JSON snapshot containing only hot match fields and commits that alongside the existing repo updates.

The existing Cloudflare Worker serves that JSON snapshot from `main` via a stable API endpoint with short caching and CORS enabled. The app fetches that endpoint on load and periodically during active sessions, then overlays the hot fields onto the bundled static tournament data in memory.

## Hot Data Scope

The runtime overlay should include only fields that change frequently enough to justify bypassing Render:

- `liveStatus`
- `score`
- `goals`
- `penalties`
- `afterExtraTime`
- `homeTeam`
- `awayTeam`

Everything else remains static:

- schedule structure
- kickoff times
- bracket slot refs
- teams metadata
- videos
- entertainment summaries
- odds

## Spoiler Rules

Spoiler behavior does not change. The browser may hold full match results in memory, but the UI must continue to reveal them only when the current progress rules allow it. This is the same trust boundary the app already uses for statically bundled results.

## Reliability Rules

- If one match is malformed while building the hot snapshot, that should fail closed for the snapshot build rather than emitting partial invalid JSON.
- If the Worker cannot fetch the hot snapshot, the app must fall back to the bundled static tournament data.
- If the browser cannot fetch hot data, the site must still render and behave normally.
- Render redeploys may still fail for code changes, but they must no longer block live badges or fresh results.

## Data Contract

The Worker endpoint returns:

- `tournamentId`
- `generatedAt`
- `sourcePath`
- `matches`, keyed by match id

Each match entry contains the hot fields only, using `null` where the runtime overlay must clear stale bundled values such as an old `liveStatus`.

## Rollout Strategy

Implement the full hot overlay path for `wc2026` only. Keep `wc2022` static. After rollout, the deployed app shell continues to come from Render, but active tournament state comes from the Cloudflare endpoint.
