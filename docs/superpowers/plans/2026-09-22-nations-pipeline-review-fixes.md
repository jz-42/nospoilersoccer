# Nations League Pipeline Review Fixes Implementation Plan

> **For agentic workers:** Execute inline in this workspace. The user prohibited subagents. Each task uses a failing regression test before implementation.

**Goal:** Correct the three reviewed pipeline defects and keep FOX recovery available throughout a quota day.

**Architecture:** Scope schedule parsing to actual fixture arrays; track accepted curation independently from the final disposition; add a rolling-hour FOX request allowance in the Worker ledger.

**Tech Stack:** Node.js, TypeScript, Cloudflare Worker JavaScript and D1, GitHub Actions.

---

### Task 1: Scope scheduler fixtures

**Files:** `cloudflare-scheduler/index.mjs`, `cloudflare-scheduler/index.test.mjs`

- [x] Add a test that reads `src/data/nations/unl-2026.ts` and expects exactly 156 group fixtures without `unl-2026`.
- [x] Add a synthetic `knockoutRounds[].matches[]` event with an `unl-<numeric ESPN ID>` and assert a knockout window starting at +90 minutes and ending at +12 hours.
- [x] Run `node --test cloudflare-scheduler/index.test.mjs` and observe the fixture-count and phase failures.
- [x] Parse only `groupMatches` and nested knockout `matches` arrays using balanced delimiters, retaining `readObjectAt` for match objects.
- [x] Run the scheduler tests and the Nations suite, then commit.

### Task 2: Preserve accepted broad-scan cuts

**Files:** `scripts/curate-nations-videos.ts`, `scripts/curate-nations-videos.smoke.ts`

- [x] Add a multi-candidate curation test with an accepted first video followed by a rejected video and assert the accepted video is serialized.
- [x] Run `npx tsx scripts/curate-nations-videos.smoke.ts` and observe the missing accepted video.
- [x] Track whether any candidate was accepted independently from the last result; write the map when that flag is true.
- [x] Run the curator tests and Nations suite, then commit.

### Task 3: Pace FOX recovery

**Files:** `cloudflare-scheduler/highlights.mjs`, `cloudflare-scheduler/highlights.test.mjs`, `docs/nations-league-operations.md`

- [x] Add a test simulating repeated recovery every five minutes and asserting at most two FOX playlist requests in any rolling hour, followed by another request when the first expires.
- [x] Run `node --test cloudflare-scheduler/highlights.test.mjs` and observe the pacing failure.
- [x] Count FOX quota events after the rolling-hour cutoff before reserving each playlist request; retain the 48/day and 8,000/day limits.
- [x] Document the pacing and the separate Google Cloud project usage check.
- [x] Run worker, Nations, full check, lint, and build commands; inspect the final diff and commit.
