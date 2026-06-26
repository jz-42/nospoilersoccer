# Local Times and Official Schedule Design

## Goal

Make every World Cup match time, displayed date, relative-day label, and day
carousel grouping reflect the visitor's browser timezone while keeping one
static build for all visitors. Complete the 2026 knockout schedule and verify
all 104 kickoff instants against FIFA's official schedule.

## Source of truth

- Store every kickoff as a UTC ISO instant in each match's `kickoff` field.
- Use FIFA's official April 10, 2026 match schedule as the canonical fixture:
  <https://digitalhub.fifa.com/asset/4b5d4417-3343-4732-9cdf-14b6662af407/FWC26-Match-Schedule_English.pdf>
- Record the canonical kickoff instant for all 104 matches in a separate,
  source-attributed schedule fixture used by automated validation.
- Use ESPN's World Cup schedule and public scoreboard API as a secondary
  Pacific-time cross-check, not as the canonical source:
  <https://www.espn.com/soccer/schedule/_/league/fifa.world>
- Add all 32 knockout kickoff instants to `wc2026.ts`.
- Remove the duplicate `m104` entry so the tournament contains exactly 104
  unique matches.

The existing `date` field remains schedule metadata and a fallback for legacy
data without a kickoff. It does not control visitor-facing grouping or dates
when a kickoff is present.

## Local date and time behavior

Create focused date/time helpers that accept a kickoff instant and optionally
an explicit timezone and current instant for deterministic tests.

For a match with a kickoff:

- Derive its local calendar key (`YYYY-MM-DD`) from the kickoff in the
  visitor's timezone.
- Derive all displayed dates and weekdays from that local calendar date.
- Format kickoff times in the visitor's timezone.
- Preserve the current visual format by appending a short timezone label.
  Prefer recognized abbreviations such as `PT`, `ET`, `CEST`, `JST`, or
  `AEST`. Fall back to compact offsets such as `UTC+3`, with only the offset
  suffix rendered slightly smaller to reduce visual weight.
- Derive `Yesterday`, `Today`, and `Tomorrow` by comparing local calendar keys,
  not UTC dates or stored schedule dates.

The browser's current timezone is used in production. Explicit IANA timezones
are accepted only as helper inputs for tests and diagnostics.

## UI integration

### Today carousel

Build rail entries with a derived local date key. Sort entries first by local
date and then by kickoff instant. The carousel includes all derived match dates
plus the visitor's current local date, preserving the rest-day anchor.

The selected day, `Today` jump button, relative labels, fresh-result indicator,
empty-day text, and cards shown for a day all use the same local date key.

Extract the pure entry/date calculations from `Rail.tsx`. This both makes the
timezone behavior testable and removes the current effect-based state reset
that triggers the `Rail.tsx` hooks lint error. Tournament changes will reset
selection through component identity or state initialization without a
synchronous state update inside an effect.

### Group stage

Group match sections by the local date derived from kickoff. Display that local
date in each section and order matches by kickoff instant. A match near midnight
UTC may therefore appear under a different date for visitors in Los Angeles,
New York, and Amsterdam.

### Knockout bracket

Display each knockout card's date from its local kickoff date and its time from
the same instant. Existing bracket layout and spoiler behavior remain
unchanged.

### Match cards and modal

Upcoming cards, group tiles, knockout cards, and the match modal use the shared
local kickoff formatter. Remove hard-coded Pacific conversion and labels.
Modal dates are derived from kickoff when available.

## Validation

Extend data validation with two distinct checks:

1. Internal integrity:
   - valid parseable UTC kickoff strings;
   - unique match IDs;
   - exactly 104 matches for the 2026 tournament;
   - every 2026 match has a kickoff.
2. Official schedule comparison:
   - every expected match exists once;
   - every stored kickoff exactly equals the corresponding official FIFA UTC
     instant;
   - no extra or missing schedule entries exist.

The old validator rule that attempts to find one timezone in which every
stored `date` agrees with every kickoff will be removed. A multi-region
tournament and visitor-local UI do not have one meaningful display timezone.

## Automated tests

Add deterministic tests covering:

- One UTC instant formatting as `12:00 PM PT` in Los Angeles, `3:00 PM ET` in
  New York, and `9:00 PM` with Amsterdam's generic timezone label.
- Local calendar-key changes across timezone boundaries.
- `Yesterday`, `Today`, and `Tomorrow` around local midnight using a fixed
  current instant.
- Today-carousel grouping and sorting in Los Angeles, New York, and Amsterdam.
- Group-stage and knockout date derivation through the shared helpers.
- All 104 stored kickoffs matching the official FIFA schedule fixture.
- All 32 knockout matches having kickoff instants.
- Duplicate match IDs, missing kickoffs, and schedule drift producing useful
  validator failures.

Tests will avoid changing the Mac clock. Node's `TZ` environment variable or
explicit helper timezone parameters provide repeatable timezone simulation.

## Verification and manual testing

Run the repository's data validation, logic tests, TypeScript build, ESLint,
and production build after implementation.

For local visual checks, use browser timezone emulation rather than changing
macOS time. Verify the same local build in at least:

- `America/Los_Angeles`
- `America/New_York`
- `Europe/Amsterdam`

Check the Today carousel, group-stage date headings, knockout card dates and
times, and match modal in each timezone. Also emulate a current time near local
midnight to verify relative-day labels.

## Non-goals

- No server-side timezone detection.
- No user timezone preference or timezone picker.
- No venue-local date/time display.
- No broad redesign of schedule cards, group cards, or the bracket.
