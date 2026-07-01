# GitHub Action Behavior

## Scope

This document defines the behavior contract for the scheduled GitHub Action
that updates tournament data.

It applies to results, live-status updates, odds, highlight curation, and any
future updater step that modifies `src/data/wc2026.ts` or related generated
data files.

## Polling Cadence

- The updater polls on an approximately 5-minute cadence during each active
  workflow run.
- Live match status is therefore near-live, not real-time.
- Visible delay may include source-feed lag, the next poll boundary, and normal
  site deployment or cache propagation.

## Source-of-Truth Rules

- Match status must be source-driven, not inferred from kickoff time.
- `Live` means the upstream feed explicitly says the match is in progress.
- `Delayed` means the upstream feed explicitly says the match is delayed,
  suspended, postponed, or otherwise not actively being played after it was
  expected to start.
- If the feed does not clearly indicate an in-progress or delay state, the
  updater must not guess.

## Spoiler Rules

- Status updates must never reveal the score.
- Before a user reveals a result, the UI may show only spoiler-safe state such
  as `Live` or `Delayed`.
- While a match is `Live` or `Delayed`, that status should override the normal
  unrevealed badge treatment for that surface.
- Existing reveal-result rules remain unchanged.

## UI Contract For Live Status

- `Live` renders as a title-case label with a blinking green dot directly
  beside the text.
- `Delayed` renders as a title-case label with a non-green caution indicator
  directly beside the text.
- The live-status badge appears on match thumbnails and in the match modal.
- No score is shown anywhere until the match is over and the user reveals the
  result.

## Failure Isolation

Updater steps must be isolated from one another.

- A failure in live-status updating must not block or corrupt results, odds,
  highlights, or entertainment updates.
- A failure in any other updater step must not block or corrupt live-status
  updates.

Live-status updates must also be isolated per match.

- If one match's status fetch, parse, or mapping fails, that match must be left
  unchanged.
- The updater must continue processing the remaining matches.
- One bad match must not prevent status updates for other matches in the same
  cycle.

## Commit And Rollback Rules

- The updater may commit live-status changes only after the status pass
  completes cleanly and validation succeeds.
- If the entire live-status pass fails validation or encounters a step-level
  failure, the workflow must discard all live-status changes from that pass.
- A failed live-status pass must not commit partial status data.
- Per-match failures are not themselves grounds to discard successful,
  validated changes for other matches in that same pass, as long as the failed
  matches were left unchanged.

## Logging Rules

- Logs and audits for live-status updates must be spoiler-free.
- Error entries may include stable match ids, dates, and machine-readable error
  codes.
- Error entries must not include scores, scorelines, goal events, winners, or
  any other result-bearing details.

Recommended error classes:

- `live_status_fetch_failed`
- `live_status_parse_failed`
- `live_status_unmapped_state`
- `live_status_validation_failed`

## Data-Model Guidance

- Live-status data should be stored separately from user progress state.
- Existing progress states such as watched, locked, `FT`, and kickoff-time
  presentation remain intact.
- The live-status overlay should augment existing unrevealed status rendering,
  not replace the app's progress model.
