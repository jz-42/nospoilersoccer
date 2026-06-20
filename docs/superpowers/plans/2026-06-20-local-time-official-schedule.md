# Local Times and Official Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every match in the visitor's local date and timezone, complete the 2026 knockout kickoffs, and automatically prove all 104 stored kickoffs match FIFA's official schedule.

**Architecture:** UTC kickoff strings remain the only instant used by the UI. A pure formatting module derives local calendar keys, labels, dates, and timezone-bearing times; components consume those helpers instead of `match.date`. A separate FIFA schedule fixture lets validation detect missing matches, duplicates, missing kickoffs, or timestamp drift.

**Tech Stack:** TypeScript 6, React 19, `Intl.DateTimeFormat`, `tsx` assertion tests, ESLint, Vite

---

## File map

- Create `src/time/local.ts`: pure local date/time and relative-day helpers.
- Create `src/time/local.smoke.ts`: deterministic timezone tests.
- Create `src/data/wc2026-official-schedule.ts`: source-attributed FIFA kickoff fixture for all 104 matches.
- Create `src/data/schedule.smoke.ts`: official schedule and validator regression tests.
- Create `src/components/schedule.ts`: pure match-to-local-day grouping shared by Rail and GroupStage.
- Create `src/components/schedule.smoke.ts`: timezone grouping and ordering tests.
- Modify `src/components/format.ts`: route date/time display through the local helpers.
- Modify `src/components/Rail.tsx`: group by local day and remove the state-setting effect.
- Modify `src/components/GroupStage.tsx`: group and label matches by local day.
- Modify `src/components/Bracket.tsx`: derive knockout date and time from kickoff.
- Modify `src/components/PreviewCard.tsx`: display local dates and timezone-bearing kickoff times.
- Modify `src/components/MatchTile.tsx`: display timezone-bearing local kickoff times.
- Modify `src/components/MatchModal.tsx`: display local kickoff date and time.
- Modify `src/data/wc2026.ts`: add 32 knockout UTC kickoffs and remove duplicate `m104`.
- Modify `src/data/validate.ts`: validate UTC strings and compare 2026 against FIFA.
- Modify `src/data/types.ts`: clarify that `date` is schedule metadata/fallback.
- Modify `package.json`: add the new smoke tests to `test:logic`.
- Modify `README.md`: document timezone testing without changing the Mac clock.

### Task 1: Pure local date/time behavior

**Files:**
- Create: `src/time/local.ts`
- Create: `src/time/local.smoke.ts`
- Modify: `src/components/format.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing formatter tests**

Test one instant in `America/Los_Angeles`, `America/New_York`, and
`Europe/Amsterdam`; test a UTC instant that falls on different local calendar
days; and test yesterday/today/tomorrow around local midnight.

```ts
assert(formatKickoffLocal('2026-06-20T19:00Z', 'America/Los_Angeles') === '12:00 PM PT')
assert(formatKickoffLocal('2026-06-20T19:00Z', 'America/New_York') === '3:00 PM ET')
assert(formatKickoffLocal('2026-06-20T19:00Z', 'Europe/Amsterdam') === '9:00 PM GMT+2')
assert(localDateKey('2026-06-21T00:30Z', 'America/Los_Angeles') === '2026-06-20')
assert(localDateKey('2026-06-21T00:30Z', 'Europe/Amsterdam') === '2026-06-21')
assert(relativeDayLabel('2026-06-21', new Date('2026-06-21T06:30Z'), 'America/Los_Angeles') === 'Tomorrow')
```

- [ ] **Step 2: Run the test and verify the missing module/functions fail**

Run: `npx tsx src/time/local.smoke.ts`

Expected: non-zero exit because `src/time/local.ts` does not exist.

- [ ] **Step 3: Implement the local helpers**

Implement:

```ts
export function localDateKey(instant: string | Date, timeZone?: string): string
export function addLocalDays(dateKey: string, days: number): string
export function relativeDayLabel(
  dateKey: string,
  now?: Date,
  timeZone?: string,
): 'Yesterday' | 'Today' | 'Tomorrow' | null
export function formatKickoffLocal(iso?: string, timeZone?: string): string | null
export function formatLocalDate(
  instant: string,
  options: Intl.DateTimeFormatOptions,
  timeZone?: string,
): string
```

Use `Intl.DateTimeFormat(...).formatToParts()` to build `YYYY-MM-DD`. Use
`timeZoneName: 'shortGeneric'` for North American `PT`/`ET`, but use
`timeZoneName: 'shortOffset'` when the generic name contains `Time`, producing
the concise Amsterdam form `GMT+2`.

- [ ] **Step 4: Route `format.ts` through the new helpers**

Replace `formatKickoffPT` with `formatKickoff`, make `formatKickoffShort` an
alias returning the same timezone-bearing output, and add kickoff-based date,
weekday, and long-date formatters. Keep date-key fallback formatters for legacy
matches without `kickoff`.

- [ ] **Step 5: Run tests**

Run: `npx tsx src/time/local.smoke.ts`

Expected: all timezone and relative-day assertions pass.

- [ ] **Step 6: Commit**

```bash
git add package.json src/time/local.ts src/time/local.smoke.ts src/components/format.ts
git commit -m "feat: add browser-local match time helpers"
```

### Task 2: Local grouping shared by Today and Group Stage

**Files:**
- Create: `src/components/schedule.ts`
- Create: `src/components/schedule.smoke.ts`
- Modify: `src/components/Rail.tsx`
- Modify: `src/components/GroupStage.tsx`

- [ ] **Step 1: Write failing grouping tests**

Create small matches around midnight UTC and assert that Los Angeles groups
them on June 20 while Amsterdam groups them on June 21. Assert chronological
ordering within each local day.

```ts
assert(matchLocalDate(lateMatch, 'America/Los_Angeles') === '2026-06-20')
assert(matchLocalDate(lateMatch, 'Europe/Amsterdam') === '2026-06-21')
assert(groupMatchesByLocalDate(matches, 'America/New_York')[0].matches[0].id === 'early')
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx tsx src/components/schedule.smoke.ts`

Expected: non-zero exit because the grouping module does not exist.

- [ ] **Step 3: Implement pure grouping**

Implement:

```ts
export function matchLocalDate(
  match: Pick<GroupMatch | KnockoutMatch, 'date' | 'kickoff'>,
  timeZone?: string,
): string

export function groupMatchesByLocalDate<T extends GroupMatch | KnockoutMatch>(
  matches: readonly T[],
  timeZone?: string,
): { date: string; matches: T[] }[]
```

Use `kickoff` when present and `date` only as fallback. Sort groups by date key
and matches by kickoff instant.

- [ ] **Step 4: Integrate Today carousel**

Build each `RailEntry.date` with `matchLocalDate`. Use one `now` value per
render to derive today, yesterday, and tomorrow. Remove the `useEffect` that
calls `setActive`; key `DaySwitcher` by tournament ID in `Rail` so a tournament
change remounts it with the correct initial date.

- [ ] **Step 5: Integrate Group Stage**

Replace stored-date grouping with `groupMatchesByLocalDate(matches)`. Pass the
derived local date heading to the existing display formatter.

- [ ] **Step 6: Run tests and lint**

Run:

```bash
npx tsx src/components/schedule.smoke.ts
npm run lint
```

Expected: grouping tests pass and the existing `Rail.tsx` lint error is gone.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule.ts src/components/schedule.smoke.ts src/components/Rail.tsx src/components/GroupStage.tsx
git commit -m "feat: group matches by visitor local date"
```

### Task 3: Localize every remaining schedule surface

**Files:**
- Modify: `src/components/Bracket.tsx`
- Modify: `src/components/PreviewCard.tsx`
- Modify: `src/components/MatchTile.tsx`
- Modify: `src/components/MatchModal.tsx`

- [ ] **Step 1: Add component-facing assertions to the formatter smoke test**

Assert kickoff-based short date, long date, weekday, and timezone-bearing time
for instants whose local date differs by timezone.

- [ ] **Step 2: Run the test and verify the new assertions fail**

Run: `npx tsx src/time/local.smoke.ts`

Expected: failure for the not-yet-integrated kickoff-date formatting API.

- [ ] **Step 3: Update schedule displays**

Use the shared kickoff-based formatters in:

- Group match tiles;
- Today preview cards;
- Knockout cards;
- Match modal.

Do not append a hard-coded `PT`; the formatter already returns `PT`, `ET`, or
an offset label.

- [ ] **Step 4: Run tests and type-check**

Run:

```bash
npx tsx src/time/local.smoke.ts
npx tsc -b
```

Expected: assertions pass and TypeScript exits zero.

- [ ] **Step 5: Commit**

```bash
git add src/components/Bracket.tsx src/components/PreviewCard.tsx src/components/MatchTile.tsx src/components/MatchModal.tsx src/time/local.smoke.ts
git commit -m "feat: show local dates across match views"
```

### Task 4: Complete and independently validate the official schedule

**Files:**
- Create: `src/data/wc2026-official-schedule.ts`
- Create: `src/data/schedule.smoke.ts`
- Modify: `src/data/wc2026.ts`
- Modify: `src/data/validate.ts`
- Modify: `src/data/types.ts`

- [ ] **Step 1: Create the official fixture**

Transcribe all 104 FIFA match numbers and Eastern Time kickoffs from the
April 10, 2026 PDF, convert them to UTC ISO strings, and map group match numbers
to the repository's IDs. Include the FIFA URL and publication date in the file
header. The fixture must be independent of `wc2026.ts`.

- [ ] **Step 2: Write failing schedule tests**

Assert:

```ts
assert(Object.keys(FIFA_WC2026_KICKOFFS).length === 104)
assert(allTournamentMatches(wc2026).length === 104)
assert(new Set(allTournamentMatches(wc2026).map((m) => m.id)).size === 104)
assert(wc2026.knockoutRounds.flatMap((r) => r.matches).every((m) => m.kickoff))
assert(validateTournament(wc2026).length === 0)
```

Also clone the tournament with one changed kickoff, one missing kickoff, and
one duplicate ID; assert each produces a specific validation error.

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx tsx src/data/schedule.smoke.ts`

Expected: failures for missing knockout kickoffs and duplicate `m104`.

- [ ] **Step 4: Add the 32 knockout kickoff instants**

Use these FIFA-derived UTC values:

```ts
{
  m73: '2026-06-28T19:00Z', m74: '2026-06-29T20:30Z',
  m75: '2026-06-30T01:00Z', m76: '2026-06-29T17:00Z',
  m77: '2026-06-30T21:00Z', m78: '2026-06-30T17:00Z',
  m79: '2026-07-01T01:00Z', m80: '2026-07-01T16:00Z',
  m81: '2026-07-02T00:00Z', m82: '2026-07-01T20:00Z',
  m83: '2026-07-02T23:00Z', m84: '2026-07-02T19:00Z',
  m85: '2026-07-03T03:00Z', m86: '2026-07-03T22:00Z',
  m87: '2026-07-04T01:30Z', m88: '2026-07-03T18:00Z',
  m89: '2026-07-04T21:00Z', m90: '2026-07-04T17:00Z',
  m91: '2026-07-05T20:00Z', m92: '2026-07-06T00:00Z',
  m93: '2026-07-06T19:00Z', m94: '2026-07-07T00:00Z',
  m95: '2026-07-07T16:00Z', m96: '2026-07-07T20:00Z',
  m97: '2026-07-09T20:00Z', m98: '2026-07-10T19:00Z',
  m99: '2026-07-11T21:00Z', m100: '2026-07-12T01:00Z',
  m101: '2026-07-14T19:00Z', m102: '2026-07-15T19:00Z',
  m103: '2026-07-18T21:00Z', m104: '2026-07-19T19:00Z',
}
```

Remove the second `m104`.

- [ ] **Step 5: Replace the obsolete date validator**

Validate ISO UTC syntax, parseability, 104 unique matches for `wc2026`, complete
kickoffs, and exact equality with `FIFA_WC2026_KICKOFFS`. Remove the heuristic
that searches for one timezone where every stored date agrees.

- [ ] **Step 6: Run schedule tests and data validation**

Run:

```bash
npx tsx src/data/schedule.smoke.ts
npm run validate:data
```

Expected: 104 exact schedule matches and zero validation errors.

- [ ] **Step 7: Commit**

```bash
git add src/data/wc2026-official-schedule.ts src/data/schedule.smoke.ts src/data/wc2026.ts src/data/validate.ts src/data/types.ts
git commit -m "feat: validate all World Cup kickoffs against FIFA"
```

### Task 5: Wire the test suite and document manual timezone testing

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add all smoke tests to `test:logic`**

Run spoiler, local-time, grouping, and official-schedule smoke tests in one
script so `npm run build` exercises all of them.

- [ ] **Step 2: Document local testing**

Document that changing macOS time is unnecessary. Give commands such as:

```bash
TZ=America/Los_Angeles npm run dev
TZ=America/New_York npm run test:logic
TZ=Europe/Amsterdam npm run test:logic
```

Also document browser DevTools timezone override for visual testing because the
browser, not the Vite process, controls production display timezone.

- [ ] **Step 3: Run the complete verification suite**

Run:

```bash
npm run validate:data
npm run test:logic
npm run lint
npm run check
npm run build
```

Expected: every command exits zero.

- [ ] **Step 4: Visually verify three timezones**

Run the local site and use browser timezone emulation for Los Angeles, New York,
and Amsterdam. Check Today/Tomorrow, carousel grouping, group date headings,
knockout dates/times, and modal dates/times.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md
git commit -m "test: cover local schedule behavior"
```

### Task 6: Final review

- [ ] **Step 1: Review the diff against the approved design**

Confirm every displayed date path uses kickoff-derived local time when kickoff
exists and no hard-coded Pacific timezone remains.

- [ ] **Step 2: Re-run fresh verification**

Run:

```bash
npm run lint && npm run build
```

Expected: zero errors and a successful production bundle.

- [ ] **Step 3: Inspect repository state**

Run: `git status --short`

Expected: clean worktree.
