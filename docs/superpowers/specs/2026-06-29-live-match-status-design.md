# Live Match Status Design

## Scope

Add source-driven live match state to the updater and UI without weakening the
app's spoiler rules.

This design covers:

- source-driven `Live`
- source-driven `Delayed`
- spoiler-safe UI treatment
- GitHub Action isolation and failure behavior

This design does not change the app's existing progress model or reveal flow.

## Behavior

The app already has user-progress states such as watched, locked, unrevealed
finished (`FT`), and upcoming kickoff time. Those states remain the same.

Live match state is a separate overlay derived from the upstream sports feed:

- show `Live` only when the source explicitly marks the event in progress
- show `Delayed` only when the source explicitly marks the event delayed or
  otherwise paused after expected start
- do not infer live state from elapsed time since kickoff
- do not show any score before the user reveals the result after the match is
  over

If the source feed is unclear for a match, the updater should leave that match's
live-status data unchanged rather than guessing.

## UI Intent

`Live` and `Delayed` are status badges, not score surrogates.

The intended rendering is:

- `Live` in title case with a blinking green dot directly beside the text
- `Delayed` in title case with a caution-colored indicator directly beside the
  text
- badge shown on match thumbnails and in the match modal
- existing `FT` or kickoff badges suppressed while a live-status badge is
  active for an unrevealed match
- no score shown anywhere until reveal

The green dot does not conflict with the current spoiler-safe design language
because the text label carries the meaning and the dot is a compact state cue,
not a result cue.

## Updater Contract

The updater should follow the same polling cadence as the current workflow:
approximately every 5 minutes during an active run.

Live-status accuracy is therefore best-effort and source-driven:

- better than time heuristics
- not guaranteed beyond the upstream feed
- bounded by feed lag plus polling cadence

## Isolation Rules

Isolation is required in two dimensions.

Step isolation:

- the live-status step must be independent from results, odds, video curation,
  and entertainment curation
- failure in the live-status step must not block those other steps
- failure in another step must not block live-status updates

Per-match isolation:

- each match status update is handled independently
- if one match fails fetch, parse, or mapping, leave that match unchanged
- continue processing other matches in the same cycle
- one match failure must not invalidate other successfully processed matches

## Validation And Logging

Validation should run before commit as it does for other generated data.

Behavioral rules:

- if the full live-status pass fails validation, discard all live-status edits
  from that pass
- if only one match fails during processing, log a spoiler-free error for that
  match and continue
- if the source feed is unclear for a specific match, leave that match
  unchanged rather than guessing
- logs may include match id, date, and error code only
- logs must not include scores or any result-bearing details

## Durable Reference

The durable repo-level behavior contract lives in
`docs/github-action-behavior.md`.
