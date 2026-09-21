# UEFA Nations League 2026/27 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the complete UEFA Nations League 2026/27 as the seasonally prioritized competition, with all 54 countries, spoiler-safe League A–D tables, championship and promotion/relegation stages, reliable ESPN updates, and low-quota FOX Soccer highlight ingestion.

**Architecture:** Extend the common `Tournament` model with optional group sections, qualification rules, independent knockout tracks, and pending-draw metadata, leaving existing tournaments unchanged. Generate Nations League data from ESPN's ID-based feeds behind an independent UEFA schedule manifest and strict all-or-nothing validators. Reuse the existing Cloudflare/WebSub/GitHub pipeline with a dedicated FOX Soccer source, opening-matchday quarantine, schedule-aware recovery, and per-source quota caps.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node/tsx smoke tests, GitHub Actions, Cloudflare Workers/Queues/D1, ESPN public soccer feeds, YouTube WebSub/Atom/Data API.

**Scope guard:** International friendlies remain excluded. The shared national-team registry is the only foundation added for that future work; no friendly fixture, navigation entry, updater, or highlight rule is part of this plan.

---

## File map

New focused units:

- `src/data/national-teams.ts` — canonical national-team IDs, names, flags, and ESPN IDs.
- `src/data/national-teams.smoke.ts` — registry identity and asset checks.
- `src/data/qualification.ts` — spoiler-safe position outcomes and cross-group ranking.
- `src/data/qualification.smoke.ts` — League A–D outcome coverage.
- `src/data/nations/unl-2026-official.ts` — checked-in UEFA fixture manifest and competition constants.
- `src/data/nations/unl-2026.ts` — generated season data.
- `src/data/nations/unl-2026-videos.ts` — curator-owned highlight map.
- `scripts/espn-nations-lib.ts` — pure ESPN parsing/building and source-audit logic.
- `scripts/espn-nations.smoke.ts` — recorded-feed ingest and rejection cases.
- `scripts/espn-nations.ts` — fetch/generate CLI.
- `scripts/curate-nations-videos.ts` — FOX Soccer candidate validation and persistence.
- `scripts/curate-nations-videos.smoke.ts` — historical titles, near misses, quarantine, and timing tests.
- `src/components/KnockoutTracks.tsx` — championship/play-off selector and pending-stage rendering.
- `src/components/knockout-tracks.smoke.tsx` — track isolation and pending-copy checks.

Existing units to extend:

- `src/data/types.ts` — optional group-section, standings, qualification, and knockout-track types.
- `src/data/standings.ts` — full UEFA tiebreak chain and recursive head-to-head partitioning.
- `src/data/standings.smoke.ts` — exact UEFA ranking examples.
- `src/data/validate.ts` / `src/data/validate-cli.ts` — Nations League structural and official-manifest checks.
- `src/data/index.ts` — register Nations League and expose clock-driven picker/default helpers.
- `src/App.tsx` — consume dynamic picker order/default and render knockout tracks.
- `src/navigation.ts` / `src/navigation.smoke.ts` — group context and competition priority helpers.
- `src/components/GroupStage.tsx` — League A–D tabs and qualification bands.
- `src/components/PreviewCard.tsx` — `League A · A1` context.
- `src/components/Bracket.tsx` — export the existing connected bracket for the championship track.
- `src/App.css` — nested tabs, outcome bands, track selector, tie grid, and responsive pending cards.
- `scripts/build-hot-state.ts` / `scripts/build-highlight-state.ts` — generate `unl-2026` runtime files.
- `cloudflare-scheduler/index.mjs` / tests — serve the season and schedule match-aware result work.
- `cloudflare-scheduler/highlights.mjs` / tests — FOX Soccer discovery, bounded recovery, and quota accounting.
- `.github/workflows/update-results.yml` — atomic Nations League ingest/update step.
- `.github/workflows/curate-highlight.yml` — targeted `foxsoccer` dispatch.
- `package.json` and `README.md` — add smoke tests and operating commands.

## Task 1: Extend the common tournament shape without changing existing output

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/tournament-shape.smoke.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing schema smoke test**

Create a minimal Nations League-shaped tournament and assert that optional
sections and tracks coexist with the unchanged World Cup shape:

```ts
import { wc2026 } from './wc2026'
import type { Tournament } from './types'

const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(`FAIL: ${message}`)
}

const shaped: Tournament = {
  id: 'shape', name: 'Shape', year: 2026, advancingRanks: [],
  teams: {}, groups: [], groupMatches: [], knockoutRounds: [],
  groupSections: [{ id: 'A', label: 'League A', groupIds: ['A1'] }],
  qualificationSections: [{
    sectionId: 'A',
    rules: [{ groupRank: 1, outcome: { kind: 'qualify', label: 'Quarter-finals' } }],
  }],
  knockoutTracks: [{
    id: 'championship', label: 'Championship', roundIds: ['qf', 'sf', 'third-place', 'final'],
    pendingStages: [{
      id: 'qf-draw', label: 'Quarter-finals', window: '25–30 Mar 2027',
      pools: [{ label: 'Group winners' }, { label: 'Group runners-up' }],
    }],
  }],
}

assert(shaped.groupSections?.[0].groupIds[0] === 'A1', 'group sections are typed')
assert(shaped.knockoutTracks?.[0].pendingStages?.[0].pools.length === 2, 'pending stages are typed')
assert(wc2026.groupSections === undefined, 'existing tournaments need no new fields')
console.log('TOURNAMENT SHAPE TESTS PASS')
```

- [ ] **Step 2: Register and run the smoke test to verify it fails**

Add `tsx src/data/tournament-shape.smoke.ts` to `test:logic` immediately after
the standings test.

Run: `npx tsx src/data/tournament-shape.smoke.ts`  
Expected: TypeScript errors for unknown `groupSections`, `qualificationSections`, and `knockoutTracks`.

- [ ] **Step 3: Add the exact optional types**

Add these types and fields:

```ts
export type StandingOutcomeKind = 'qualify' | 'promote' | 'playoff' | 'stay' | 'relegate'

export interface StandingOutcome {
  kind: StandingOutcomeKind
  label: string
}

export interface GroupSection {
  id: string
  label: string
  groupIds: GroupId[]
}

export interface QualificationRule {
  groupRank: number
  outcome: StandingOutcome
  crossGroup?: {
    top: number
    topOutcome: StandingOutcome
    bottomOutcome: StandingOutcome
  }
}

export interface QualificationSection {
  sectionId: string
  rules: QualificationRule[]
}

export interface PendingStage {
  id: string
  label: string
  window: string
  pools: { label: string }[]
}

export interface KnockoutTrack {
  id: string
  label: string
  roundIds: string[]
  pendingStages?: PendingStage[]
}
```

Extend `Group` with `label?: string`, `sectionId?: string`,
`disciplinary?: Partial<Record<TeamId, number>>`, and
`officialOrder?: TeamId[]`. Extend `Team` with `accessRank?: number`. Extend
`Tournament` with optional arrays for the three structures above.

- [ ] **Step 4: Run schema and regression tests**

Run: `npx tsx src/data/tournament-shape.smoke.ts && npm run validate:data && npx tsc -b`  
Expected: schema test passes; all existing datasets remain valid.

- [ ] **Step 5: Commit**

```bash
git add src/data/types.ts src/data/tournament-shape.smoke.ts package.json
git commit -m "Extend tournament schema for Nations League stages"
```

## Task 2: Implement UEFA's spoiler-safe standings chain

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/standings.ts`
- Modify: `src/data/standings.smoke.ts`

- [ ] **Step 1: Add failing UEFA tiebreak tests**

Extend the fixture factory so `StandingRow` must distinguish away goals and
away wins. Add a three-way points tie where the first mini-table pass separates
one team and the remaining two require head-to-head reapplication. Add tests
for this exact configured chain:

```ts
const uefa: Tiebreak[] = [
  'head-to-head', 'goal-difference', 'goals-for', 'away-goals',
  'wins', 'away-wins', 'disciplinary', 'access-list',
]

assert(order(uefaRecursiveTournament()) === 'a,c,b,d', 'UEFA recursively reapplies head-to-head')
assert(order(awayGoalsTournament()) === 'away,home', 'away goals settle an otherwise level pair')
assert(order(awayWinsTournament()) === 'traveller,host', 'away wins follow total wins')
assert(order(disciplineTournament()) === 'clean,booked', 'lower disciplinary score ranks first')
assert(order(accessListTournament()) === 'seeded,unseeded', 'access list is the final fallback')
```

Also assert that passing an `include` predicate excludes disciplinary and
official-order inputs until every match in that group is included.

- [ ] **Step 2: Run the standings test to verify it fails**

Run: `npx tsx src/data/standings.smoke.ts`  
Expected: type errors for the new tiebreak names and failed ordering assertions.

- [ ] **Step 3: Extend rows and tiebreak names**

Add `awayGoals` and `awayWins` to `StandingRow`. Extend `Tiebreak` with
`away-goals`, `away-wins`, `disciplinary`, and `access-list`. During match
accumulation, update the away row:

```ts
away.awayGoals += m.score.away
if (m.score.away > m.score.home) away.awayWins++
```

- [ ] **Step 4: Replace one-pass head-to-head sorting with partitioned recursion**

Implement `rankLevelBlock()` so each criterion partitions equal teams, and a
head-to-head partition that leaves multiple teams tied calls the head-to-head
criteria again for that smaller partition before continuing to overall stats.
Use these exact data sources for the final criteria:

```ts
const discipline = groupDef.disciplinary?.[row.team]
const accessRank = t.teams[row.team].accessRank
const officialIndex = groupDef.officialOrder?.indexOf(row.team) ?? -1
```

Official order may break a tie only when every scored match in the group is
included. Otherwise return `0` and preserve stable input order, preventing a
hidden result from changing a partial table.

- [ ] **Step 5: Run focused and full logic tests**

Run: `npx tsx src/data/standings.smoke.ts && npm run test:logic`  
Expected: all UEFA examples and existing FIFA/La Liga examples pass.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/standings.ts src/data/standings.smoke.ts
git commit -m "Implement UEFA Nations League tiebreakers"
```

## Task 3: Add canonical national-team identity and missing flag assets

**Files:**
- Create: `src/data/national-teams.ts`
- Create: `src/data/national-teams.smoke.ts`
- Modify: `src/data/wc2026.ts`
- Modify: `src/data/wc2022.ts`
- Create: `scripts/fetch-national-flags.ts`
- Create: `src/assets/flags/*.svg` for missing UEFA associations
- Modify: `package.json`

- [ ] **Step 1: Write the failing registry test**

Test uniqueness, World Cup object identity, all 54 Nations League IDs, and flag
asset coverage:

```ts
import { existsSync } from 'node:fs'
import { nationalTeams, nationsLeagueTeamIds } from './national-teams'
import { wc2026 } from './wc2026'

const values = Object.values(nationalTeams)
if (new Set(values.map((team) => team.id)).size !== values.length) throw new Error('duplicate national id')
if (new Set(values.flatMap((team) => team.espnId ? [team.espnId] : [])).size !== values.filter((team) => team.espnId).length) {
  throw new Error('duplicate national ESPN id')
}
if (nationsLeagueTeamIds.length !== 54) throw new Error('Nations League must have 54 teams')
for (const id of nationsLeagueTeamIds) {
  if (!existsSync(new URL(`../assets/flags/${id}.svg`, import.meta.url))) throw new Error(`missing flag ${id}`)
}
for (const id of Object.keys(wc2026.teams)) {
  if (wc2026.teams[id] !== nationalTeams[id]) throw new Error(`World Cup does not reuse ${id}`)
}
console.log('NATIONAL TEAM REGISTRY TESTS PASS')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/data/national-teams.smoke.ts`  
Expected: module-not-found failure.

- [ ] **Step 3: Create the registry and move existing World Cup records**

Move the existing national `Team` objects byte-for-byte into
`nationalTeams`, keyed by their current IDs. Add the 35 UEFA associations not
already present, using ESPN's current IDs and abbreviations. Export this exact
Nations League order by group:

```ts
export const nationsLeagueTeamIds = [
  'FRA','ITA','BEL','TUR','GER','NED','SRB','GRE',
  'ESP','CRO','ENG','CZE','POR','DEN','NOR','WAL',
  'SCO','SUI','SVN','MKD','HUN','UKR','GEO','NIR',
  'ISR','AUT','IRL','KOS','POL','BIH','ROU','SWE',
  'ALB','FIN','BLR','SMR','MNE','ARM','CYP','LVA',
  'KAZ','SVK','FRO','MDA','ISL','BUL','EST','LUX',
  'GIB','MLT','AND','LTU','AZE','LIE',
] as const
```

Use ESPN IDs captured from the 2026 standings feed. `pickNationalTeams(ids)`
must throw on an unknown ID instead of omitting it.

- [ ] **Step 4: Refactor World Cup datasets to select registry objects**

Replace inline maps with:

```ts
const teams = pickNationalTeams([
  // preserve the existing dataset's ID order exactly
])
```

Do not rename a current World Cup ID. This is what preserves favourites without
a progress-state migration.

- [ ] **Step 5: Add deterministic flag fetching**

Create a script with an explicit ESPN-code-to-ISO-two-letter map and download
only missing MIT-licensed `flag-icons` 4x3 SVGs. The write path must be
`src/assets/flags/${teamId}.svg`; reject non-SVG responses and do not overwrite
existing files without `--force`.

Run: `npx tsx scripts/fetch-national-flags.ts`  
Expected: 35 new SVGs and `all 54 Nations League flags present`.

- [ ] **Step 6: Run identity, data, and visual-asset checks**

Run: `npx tsx src/data/national-teams.smoke.ts && npm run validate:data && npm run test:logic && npx tsc -b`  
Expected: all pass; existing World Cup favourites use the same IDs and objects.

- [ ] **Step 7: Commit**

```bash
git add src/data/national-teams.ts src/data/national-teams.smoke.ts src/data/wc2026.ts src/data/wc2022.ts scripts/fetch-national-flags.ts src/assets/flags package.json
git commit -m "Share national team identities across tournaments"
```

## Task 4: Encode qualification outcomes without leaking hidden groups

**Files:**
- Create: `src/data/qualification.ts`
- Create: `src/data/qualification.smoke.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing League A–D outcome tests**

Build a four-group section fixture and assert:

```ts
assert(outcome(t, 'A1', 1, allRevealed)?.label === 'Quarter-finals', 'A winner reaches QF')
assert(outcome(t, 'A1', 3, allRevealed)?.label === 'Stay in League A', 'top A third stays')
assert(outcome(t, 'A4', 3, allRevealed)?.label === 'A/B play-off', 'bottom A third enters play-off')
assert(outcome(t, 'A1', 4, allRevealed)?.label === 'A/B play-off', 'top A fourth enters play-off')
assert(outcome(t, 'A4', 4, allRevealed)?.label === 'Relegated to League B', 'bottom A fourth drops')
assert(outcome(t, 'B1', 1, allRevealed)?.label === 'Promoted to League A', 'B winner promotes')
assert(outcome(t, 'C1', 2, allRevealed)?.label === 'B/C play-off', 'C runner-up enters play-off')
assert(outcome(t, 'D1', 3, allRevealed)?.label === 'Promoted to League C', 'every D team promotes')
assert(outcome(t, 'A1', 3, onlyA1Revealed) === null, 'cross-group outcome waits for all four groups')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx src/data/qualification.smoke.ts`  
Expected: module-not-found failure.

- [ ] **Step 3: Implement section lookup and same-rank comparison**

Export:

```ts
export function groupSection(t: Tournament, groupId: GroupId): GroupSection | null
export function positionOutcome(
  t: Tournament,
  groupId: GroupId,
  rank: number,
  include?: (matchId: string) => boolean,
): StandingOutcome | null
```

For a cross-group rule, require every match in every group of that section to
be included and scored. Rank the rows at `groupRank - 1` by points, goal
difference, goals, away goals, wins, away wins, discipline, and access rank.
Return `null` until the required revealed canon is complete.

- [ ] **Step 4: Run qualification and full logic tests**

Run: `npx tsx src/data/qualification.smoke.ts && npm run test:logic`  
Expected: every direct and cross-group path passes with no existing regression.

- [ ] **Step 5: Commit**

```bash
git add src/data/qualification.ts src/data/qualification.smoke.ts package.json
git commit -m "Model Nations League qualification outcomes"
```

## Task 5: Build the audited 2026/27 league-phase dataset

**Files:**
- Create: `src/data/nations/unl-2026-official.ts`
- Create: `src/data/nations/unl-2026.ts`
- Create: `src/data/nations/unl-2026-videos.ts`
- Create: `scripts/espn-nations-lib.ts`
- Create: `scripts/espn-nations.smoke.ts`
- Create: `scripts/espn-nations.ts`
- Modify: `src/data/validate.ts`
- Modify: `src/data/validate-cli.ts`
- Modify: `package.json`

- [ ] **Step 1: Capture small recorded ESPN fixtures and write failing parser tests**

The recorded inputs must contain one standings group, one scheduled event, one
completed event, a duplicate, and an unknown team. Test the pure builder:

```ts
const built = buildNationsSeason({ standings, events, previous: undefined, official })
assert(built.audit.errors.length === 0, 'valid recorded feed builds')
assert(built.tournament.groups[0].id === 'A1', 'Group A1 maps exactly')
assert(built.tournament.groupMatches[0].id === 'unl-401861047', 'ESPN event ID is stable')
assert(built.tournament.groupMatches[0].kickoff === '2026-09-24T16:00Z', 'kickoff is UTC')
assert(buildWithUnknownTeam().audit.errors.some((x) => x.includes('unknown team')), 'unknown team blocks output')
assert(buildWithDuplicate().audit.errors.some((x) => x.includes('duplicate event')), 'duplicates block output')
assert(buildWithTruncatedGroup().audit.errors.some((x) => x.includes('fixture count')), 'truncation blocks output')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/espn-nations.smoke.ts`  
Expected: module-not-found failure.

- [ ] **Step 3: Implement ID-based parsing and stable generation**

Fetch:

```text
https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard?dates=2026&limit=1000
https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.nations/scoreboard?dates=2027&limit=1000
https://site.api.espn.com/apis/v2/sports/soccer/uefa.nations/standings
```

Map group names with `/^Group ([A-D][1-4])$/`, map teams only by ESPN ID from
`nationalTeams`, and classify league-phase events from 24 September through 17
November 2026. Classify later events by ESPN's round/calendar label into League
A quarter-finals, A/B play-offs, B/C play-offs, semi-finals, third place, and
final. Reuse `parseEvent()` for status, score, shootout, and goals. Preserve a
previous match's accepted videos by keeping them in the sibling videos module,
not the generated season file.

Materialize a drawn stage only as a complete unit: eight legs for each of the
quarter-final, A/B, and B/C stages; two matches for the semi-finals; and one
match each for third place and final. Until every fixture expected for a stage
is present, keep its `PendingStage` and retain the last complete checked-in
version. Pair two-legged events by ESPN series metadata plus the unordered
participant pair, and preserve prior internal tie IDs by `roundId:pairKey`.

- [ ] **Step 4: Create the independent official manifest**

Encode all 156 UEFA-published fixtures as:

```ts
export interface OfficialUnlFixture {
  espnEventId: string
  group: string
  home: TeamId
  away: TeamId
  kickoff: string
  matchday: number
}

export const UNL_2026_OFFICIAL_FIXTURES: readonly OfficialUnlFixture[] = officialFixtures
```

Define `officialFixtures` immediately above as 156 literal objects, populated
by reconciling ESPN event IDs with UEFA's official
league-phase fixture list. Check the published local kickoff against the UTC
instant and record any accepted UEFA schedule correction in a comment beside
that row. The exported module must throw during generation if IDs, pairs, or
kickoffs are duplicated.

- [ ] **Step 5: Add strict Nations League validation**

For `t.id === 'unl-2026'`, require 54 teams, 14 exact groups, 156 group
fixtures, 12 fixtures per A–C group, six per D group, and one home plus one away
meeting for every pair. Compare every generated fixture with the official
manifest by event ID, group, teams, kickoff, and matchday. Validate all
`groupSections`, qualification rules, track round IDs, pending stage IDs, and
official-order permutations.

- [ ] **Step 6: Generate and validate the live dataset**

Run: `npx tsx scripts/espn-nations.ts`  
Expected summary: `54 teams, 14 groups, 156 fixtures, 0 source disagreements`.

Run: `npx tsx scripts/espn-nations.smoke.ts && npm run validate:data && npx tsc -b`  
Expected: all pass and `validate-cli` prints a consistent `unl-2026` row.

- [ ] **Step 7: Commit**

```bash
git add src/data/nations scripts/espn-nations-lib.ts scripts/espn-nations.smoke.ts scripts/espn-nations.ts src/data/validate.ts src/data/validate-cli.ts package.json
git commit -m "Generate audited Nations League fixtures"
```

## Task 6: Register Nations League and implement date-driven priority

**Files:**
- Modify: `src/data/index.ts`
- Modify: `src/App.tsx`
- Modify: `src/navigation.ts`
- Modify: `src/navigation.smoke.ts`

- [ ] **Step 1: Add failing boundary and saved-selection tests**

Add pure helper expectations:

```ts
assert(defaultSeasonIdAt(new Date('2026-09-24T12:00:00-07:00')) === 'unl-2026', 'UNL opens first window')
assert(defaultSeasonIdAt(new Date('2026-10-07T00:01:00-07:00')) === 'ucl-2026', 'UCL returns after first window')
assert(defaultSeasonIdAt(new Date('2026-11-12T00:01:00-08:00')) === 'unl-2026', 'UNL opens second window')
assert(defaultSeasonIdAt(new Date('2026-11-18T00:01:00-08:00')) === 'ucl-2026', 'UCL returns after second window')
assert(pickerCompetitionsAt(new Date('2026-09-25T12:00:00Z'))[0].id === 'unl', 'UNL ranks first in window')
assert(resolveInitialSeason('ucl-2026', activeWindow) === 'ucl-2026', 'valid saved selection wins')
```

- [ ] **Step 2: Run navigation tests to verify they fail**

Run: `npx tsx --tsconfig tsconfig.app.json src/navigation.smoke.ts`  
Expected: missing-helper failures.

- [ ] **Step 3: Register the eager Nations League season**

Import `unl_2026` and its videos, merge videos with `withVideos`, and add:

```ts
{
  id: 'unl', name: 'UEFA Nations League', shortName: 'Nations League',
  seasons: [{ id: 'unl-2026', label: '26/27', year: 2026, tournament: unl2026 }],
}
```

Export `pickerCompetitionsAt(now)` rather than a static picker array. Export
`defaultSeasonIdAt(now)` and `resolveInitialSeason(saved, now)` with saved value
precedence. Keep `defaultSeasonId = defaultSeasonIdAt()` only for compatibility
with callers that do not inject a clock.

- [ ] **Step 4: Consume one captured clock in App**

At App initialization, capture `const now = new Date()` once, use
`resolveInitialSeason(localStorage.getItem(TOURNAMENT_KEY), now)`, and pass
`pickerCompetitionsAt(now)` to the picker. Do not write the dynamic default to
localStorage until the visitor explicitly selects a competition.

- [ ] **Step 5: Run focused and full tests**

Run: `npx tsx --tsconfig tsconfig.app.json src/navigation.smoke.ts && npm run test:logic && npx tsc -b`  
Expected: every boundary and saved-selection test passes.

- [ ] **Step 6: Commit**

```bash
git add src/data/index.ts src/App.tsx src/navigation.ts src/navigation.smoke.ts
git commit -m "Prioritize Nations League during active windows"
```

## Task 7: Add League A–D group tabs and spoiler-safe outcome bands

**Files:**
- Modify: `src/components/GroupStage.tsx`
- Create: `src/components/group-stage.smoke.tsx`
- Modify: `src/App.css`
- Modify: `package.json`

- [ ] **Step 1: Add failing render tests**

Render the generated tournament with empty progress and assert four tab labels,
only A1–A4 visible initially, no final outcome bands before results are
revealed, and correct B/D groups after selecting helpers:

```ts
assert(sectionGroups(unl_2026, 'A').map((g) => g.id).join() === 'A1,A2,A3,A4', 'League A groups')
assert(sectionGroups(unl_2026, 'D').map((g) => g.id).join() === 'D1,D2', 'League D groups')
assert(groupDisplayName(unl_2026.groups[0]) === 'Group A1', 'explicit group label')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --tsconfig tsconfig.app.json src/components/group-stage.smoke.tsx`  
Expected: missing-helper failures.

- [ ] **Step 3: Implement section helpers and local tab state**

Export `sectionGroups(t, sectionId)` and `groupDisplayName(group)`. In
`GroupStage`, use the first section as initial state, render an accessible
`role="tablist"`, and pass only selected groups to the existing grid. A
tournament without `groupSections` follows its current path byte-for-byte.

- [ ] **Step 4: Replace the global advancing-rank band for configured sections**

For each visible row call `positionOutcome(t, group.id, i + 1, revealed)`. Map
outcomes to existing visual tones:

```ts
const outcomeTone = {
  qualify: 'qualify', promote: 'qualify', playoff: 'playoff',
  stay: null, relegate: 'drop',
} as const
```

Build a deduplicated legend from outcomes that are currently safe to show.
Keep the World Cup's existing `advances` behaviour unchanged.

- [ ] **Step 5: Add responsive nested-tab styling**

Add `.group-sections`, `.group-section-tab`, active/focus states, and a mobile
horizontal overflow rule. Use the existing glass/segmented-control tokens; do
not introduce a fifth page-level navigation row.

- [ ] **Step 6: Run component and regression tests**

Run: `npx tsx --tsconfig tsconfig.app.json src/components/group-stage.smoke.tsx && npm run test:components && npm run test:logic && npx tsc -b`  
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/GroupStage.tsx src/components/group-stage.smoke.tsx src/App.css package.json
git commit -m "Add Nations League group navigation"
```

## Task 8: Label every Nations League match in Today

**Files:**
- Modify: `src/navigation.ts`
- Modify: `src/components/PreviewCard.tsx`
- Modify: `src/components/format.smoke.ts`
- Modify: `src/App.css`

- [ ] **Step 1: Add failing context-label tests**

```ts
assert(groupContextLabel(unl_2026, 'A1') === 'League A · A1', 'UNL label includes league and group')
assert(groupContextLabel(wc2026, 'F') === 'Group F', 'World Cup label is unchanged')
assert(groupContextLabel(eng1_2026, 'league') === null, 'single-table competition has no repeated chip')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --tsconfig tsconfig.app.json src/components/format.smoke.ts`  
Expected: `groupContextLabel` is missing.

- [ ] **Step 3: Implement and consume the helper**

Look up the group and section. Return `${section.label} · ${group.id}` for a
sectioned tournament, `Group ${group.id}` for a multi-group tournament, and
`null` for a single table. Replace `PreviewCard`'s inline group context logic.

- [ ] **Step 4: Verify dense-day layout**

Run the dev server and inspect 24–29 September at desktop width and 390px. The
tag must remain one line, must not obscure live/FT badges, and all ten-match
days must retain the existing grid layout.

- [ ] **Step 5: Run tests and commit**

Run: `npm run test:components && npx tsc -b`  
Expected: all pass.

```bash
git add src/navigation.ts src/components/PreviewCard.tsx src/components/format.smoke.ts src/App.css
git commit -m "Label Nations League matches by league"
```

## Task 9: Render championship and promotion/relegation tracks

**Files:**
- Modify: `src/components/Bracket.tsx`
- Create: `src/components/KnockoutTracks.tsx`
- Create: `src/components/knockout-tracks.smoke.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `package.json`

- [ ] **Step 1: Write failing track/pending-stage tests**

Test pure filtering and static markup:

```ts
import { renderToStaticMarkup } from 'react-dom/server'
import { PendingStageCard, roundsForTrack } from './KnockoutTracks'

assert(roundsForTrack(unl_2026, 'championship').every((r) => ['qf','sf','third-place','final'].includes(r.id)), 'championship isolation')
assert(roundsForTrack(unl_2026, 'playoffs').every((r) => ['ab-playoff','bc-playoff'].includes(r.id)), 'play-off isolation')
const pendingHtml = renderToStaticMarkup(<PendingStageCard stage={unl_2026.knockoutTracks![0].pendingStages![0]} />)
assert(pendingHtml.includes('Draw pending'), 'honest pending state')
assert(!pendingHtml.includes(' vs '), 'no invented pairing')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx --tsconfig tsconfig.app.json src/components/knockout-tracks.smoke.tsx`  
Expected: module-not-found failure.

- [ ] **Step 3: Make the connected bracket reusable**

Export the existing bracket body as `ConnectedBracket`. It still receives a
`Tournament` with a single connected `knockoutRounds` array, preserving World
Cup and UCL behaviour.

- [ ] **Step 4: Implement the track shell and tie grid**

Export `roundsForTrack` and `PendingStageCard`. `KnockoutTracks` selects the
first configured track, filters rounds by
`roundIds`, and chooses:

- `ConnectedBracket` when the filtered rounds form a championship tree;
- a `TieGrid` grouped by round for independent A/B and B/C ties;
- `PendingStageCard` for each not-yet-drawn stage.

Each pending card renders `label`, `window`, pool labels, and the exact copy
`Draw pending`. It never constructs `KnockoutMatch` objects.

- [ ] **Step 5: Route App through the shell only when configured**

```tsx
{view === 'bracket' && (
  t.knockoutTracks?.length
    ? <KnockoutTracks t={t} progress={progress} onOpen={setModal} />
    : <Bracket t={t} progress={progress} onOpen={setModal} />
)}
```

- [ ] **Step 6: Add desktop/mobile styles and run tests**

Style the track selector like the group-section selector. Use a responsive
two-column tie grid collapsing to one column. Pending cards must fit 320px
without horizontal scrolling.

Run: `npx tsx --tsconfig tsconfig.app.json src/components/knockout-tracks.smoke.tsx && npm run test:components && npx tsc -b`  
Expected: all pass; legacy brackets are unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/Bracket.tsx src/components/KnockoutTracks.tsx src/components/knockout-tracks.smoke.tsx src/App.tsx src/App.css package.json
git commit -m "Render Nations League knockout tracks"
```

## Task 10: Add atomic Nations League result updates and runtime state

**Files:**
- Modify: `scripts/espn-nations-lib.ts`
- Modify: `scripts/espn-nations.ts`
- Modify: `scripts/espn-nations.smoke.ts`
- Modify: `scripts/build-hot-state.ts`
- Modify: `scripts/build-highlight-state.ts`
- Modify: `.github/workflows/update-results.yml`
- Modify: `cloudflare-scheduler/index.mjs`
- Modify: `cloudflare-scheduler/index.test.mjs`
- Modify: `cloudflare-scheduler/wrangler.toml`
- Create: `public/api/hot-state/unl-2026.json`
- Create: `public/api/highlights/unl-2026.json`

- [ ] **Step 1: Add failing preservation and scheduler tests**

Test that regeneration preserves stable event IDs, accepted sibling videos,
finished results on a truncated fetch, and all-or-nothing draw materialization.
In Worker tests assert `unl-2026` is allowed and a Nations kickoff creates a
result window beginning 105 minutes after kickoff and ending eight hours after.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npx tsx scripts/espn-nations.smoke.ts && node --test cloudflare-scheduler/index.test.mjs`  
Expected: preservation/window/allowlist assertions fail.

- [ ] **Step 3: Add update mode and audit output**

`scripts/espn-nations.ts` supports `--dry-run` and default write mode. Before
writing, it loads the current tournament, rejects loss of a finished score or
known fixture, and writes one audit markdown file from `NATIONS_AUDIT_FILE`.
Write via a sibling temporary file followed by rename so interruption cannot
truncate the dataset.

- [ ] **Step 4: Add Nations runtime snapshots**

Import `unl_2026` in both builders and add it to their tournament arrays.
Generate the two checked-in JSON files and validate them with existing parsers.

- [ ] **Step 5: Generalize Worker schedule inputs**

Change schedule fetching from one World Cup source to a list containing the
World Cup and Nations League raw data URLs. Parse all valid `kickoff` fields
with their season ID, deduplicate by `seasonId:matchId`, and include
`unl-2026` in `HOT_STATE_SEASON_IDS`. Keep the active-run lock global so two
competitions cannot dispatch overlapping update jobs.

- [ ] **Step 6: Add a per-cycle atomic workflow step**

Add `NATIONS_BACKUP_ROOT` and a `nations_step` function mirroring `club_step`.
Each five-minute cycle runs result regeneration only when Nations League has a
live or recently finishable fixture. Validate with:

```bash
npm run validate:data
npx tsx scripts/espn-nations.smoke.ts
npx tsc -b
npm run build:hot-state
npm run build:highlight-state
```

On failure restore all `unl-2026*` files. Stage and commit only the Nations
dataset, videos, audit-owned skip data, and its two runtime JSON files.

- [ ] **Step 7: Run scheduler, update, and build tests**

Run: `node --test cloudflare-scheduler/index.test.mjs && npx tsx scripts/update-workflow.smoke.ts && npm run check:update`  
Expected: all pass, including no dispatch overlap and last-known-good retention.

- [ ] **Step 8: Commit**

```bash
git add scripts/espn-nations-lib.ts scripts/espn-nations.ts scripts/espn-nations.smoke.ts scripts/build-hot-state.ts scripts/build-highlight-state.ts .github/workflows/update-results.yml cloudflare-scheduler public/api/hot-state/unl-2026.json public/api/highlights/unl-2026.json
git commit -m "Automate Nations League result updates"
```

## Task 11: Curate FOX Soccer highlights with an opening-day quarantine

**Files:**
- Create: `scripts/curate-nations-videos.ts`
- Create: `scripts/curate-nations-videos.smoke.ts`
- Modify: `src/data/nations/unl-2026-videos.ts`
- Modify: `scripts/curate-skip.json`
- Modify: `package.json`

- [ ] **Step 1: Write failing parser, timing, and quarantine tests**

Use the historical verified examples:

```ts
accept('England vs. Finland Highlights | UEFA Nations League', 'ENG', 'FIN')
accept('Italy vs. France UEFA Nations League Highlights | FOX Soccer', 'ITA', 'FRA')
accept('Italy vs. Germany UEFA Nations League Highlights | FOX Soccer', 'ITA', 'GER')
reject('France scores late winner vs Italy | FOX Soccer')
reject('England vs Spain Preview | UEFA Nations League')
reject('Best goals from Nations League Matchday 1')
```

Also assert wrong channel ID, publication before kickoff, unmatched teams,
Shorts, non-embeddable videos, and publication after the configured horizon
are rejected. Assert `trustMode: 'quarantine'` returns `quarantined` without
writing the videos module, while `trustMode: 'trusted'` writes exactly once.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/curate-nations-videos.smoke.ts`  
Expected: module-not-found failure.

- [ ] **Step 3: Implement conservative source parsing**

Set:

```ts
export const FOX_SOCCER_CHANNEL_ID = 'UCooTLkxcpnTNx6vfOovfBFA'
export const NATIONS_HIGHLIGHT_TRUST: 'quarantine' | 'trusted' = 'quarantine'
```

Accept only titles that contain exactly one resolvable `A vs B` matchup plus
`Highlights` and `UEFA Nations League` or verified FOX Soccer suffix context.
Resolve team aliases through the national registry, then find exactly one
completed fixture with those teams inside the publication horizon. Reuse
`checkEmbeddable`, metadata verification, duration classification, and the
existing AI spoiler gate. Ambiguity returns `quarantined`, never a broader
match.

- [ ] **Step 4: Implement append-only persistence**

Write accepted cuts to `unl-2026-videos.ts`, one provider/kind per match. Never
overwrite a current accepted cut. Store rejected video IDs with a source and
reason. Targeted mode must set `HIGHLIGHT_RESULT_FILE` to `accepted`,
`quarantined`, or `retry` for the Worker callback.

- [ ] **Step 5: Run tests and commit**

Run: `npx tsx scripts/curate-nations-videos.smoke.ts && npx tsx src/data/videos.smoke.ts && npm run validate:data && npx tsc -b`  
Expected: all pass; quarantine produces no published video.

```bash
git add scripts/curate-nations-videos.ts scripts/curate-nations-videos.smoke.ts src/data/nations/unl-2026-videos.ts scripts/curate-skip.json package.json
git commit -m "Curate FOX Soccer Nations League highlights"
```

## Task 12: Add zero-quota discovery and bounded YouTube recovery

**Files:**
- Modify: `cloudflare-scheduler/highlights.mjs`
- Modify: `cloudflare-scheduler/highlights.test.mjs`
- Modify: `.github/workflows/curate-highlight.yml`
- Modify: `.github/workflows/update-results.yml`
- Modify: `docs/cloudflare-scheduler.md`

- [ ] **Step 1: Add failing source, quota, and dispatch tests**

Assert the source has ID `foxsoccer`, exact channel ID, upload playlist ID
`UUooTLkxcpnTNx6vfOovfBFA`, and a two-page maximum. Assert WebSub and Atom
queue matching titles for zero units. Assert playlist recovery is skipped when
no completed Nations fixture lacks a cut, opens only inside a post-match
window, consumes at most two units per run, and stops at a Nations-specific
daily ceiling of 48 units.

- [ ] **Step 2: Run Worker tests to verify they fail**

Run: `node --test cloudflare-scheduler/highlights.test.mjs`  
Expected: `foxsoccer` source and quota-window assertions fail.

- [ ] **Step 3: Add the exact source and title gate**

```js
{
  id: 'foxsoccer',
  label: 'FOX Soccer',
  channelId: 'UCooTLkxcpnTNx6vfOovfBFA',
  playlistId: 'UUooTLkxcpnTNx6vfOovfBFA',
  scanDepth: 100,
}
```

Add a conservative potential-title expression requiring `Highlights` plus
`UEFA Nations League`; final matchup validation remains in the curator.

- [ ] **Step 4: Gate API recovery by missing completed fixtures**

Read `public/api/hot-state/unl-2026.json` and
`public/api/highlights/unl-2026.json`. Open recovery only when a completed
fixture has no accepted video and its kickoff/status lies inside the horizon.
WebSub subscription renewal and Atom feed polling remain always available and
consume no YouTube API units. Record source-level quota events so the 48-unit
ceiling is enforceable independently of the existing 8,000-unit global cap.

- [ ] **Step 5: Route targeted workflow dispatch**

Add `foxsoccer` to `source_id` choices and dispatch it to:

```bash
npx tsx scripts/curate-nations-videos.ts --video-id "$VIDEO_ID"
```

Stage `src/data/nations/unl-2026-videos.ts` and rebuild highlight state. The normal
update workflow may run one bounded recovery on its first cycle only when the
Worker reports a recovery gap.

- [ ] **Step 6: Document the matchday-1 promotion procedure**

Document the audit checklist and the single reviewed change from
`NATIONS_HIGHLIGHT_TRUST = 'quarantine'` to `'trusted'`. Require a sample across
multiple fixtures, exact channel identity, titles, publication delays,
durations, thumbnails, and successful US embeds. Parser changes and trust
promotion must be separate commits.

- [ ] **Step 7: Run tests and commit**

Run: `node --test cloudflare-scheduler/highlights.test.mjs && npx tsx scripts/curate-nations-videos.smoke.ts && npx tsx scripts/update-workflow.smoke.ts`  
Expected: all pass and the quota ledger never exceeds either cap.

```bash
git add cloudflare-scheduler/highlights.mjs cloudflare-scheduler/highlights.test.mjs .github/workflows/curate-highlight.yml .github/workflows/update-results.yml docs/cloudflare-scheduler.md
git commit -m "Watch FOX Soccer with bounded quota recovery"
```

## Task 13: Add operational documentation and end-to-end data proof

**Files:**
- Modify: `README.md`
- Create: `docs/nations-league-operations.md`
- Modify: `package.json`

- [ ] **Step 1: Add one aggregate proof command**

Add:

```json
"test:nations": "tsx src/data/national-teams.smoke.ts && tsx src/data/tournament-shape.smoke.ts && tsx src/data/standings.smoke.ts && tsx src/data/qualification.smoke.ts && tsx scripts/espn-nations.smoke.ts && tsx scripts/curate-nations-videos.smoke.ts && node --test cloudflare-scheduler/index.test.mjs cloudflare-scheduler/highlights.test.mjs"
```

- [ ] **Step 2: Document normal and failure operations**

Document exact commands for dry-run ingest, audited write, data validation,
runtime-state generation, targeted video curation, quota inspection, WebSub
subscription status, candidate quarantine, rollback behaviour, and matchday-1
trust promotion. Include the official sources from the design and state that
the regulations contain no 2026/27 C/D play-off.

- [ ] **Step 3: Run the aggregate proof twice**

Run: `npm run test:nations && npm run test:nations`  
Expected: both runs pass identically; the second run creates no data diff.

- [ ] **Step 4: Confirm generated files are idempotent**

Run: `npx tsx scripts/espn-nations.ts && npm run build:hot-state && npm run build:highlight-state && git diff --exit-code -- src/data/nations public/api/hot-state/unl-2026.json public/api/highlights/unl-2026.json`  
Expected: exit 0 after the first reviewed generation commit.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/nations-league-operations.md package.json
git commit -m "Document Nations League operations"
```

## Task 14: Full regression, visual QA, and release evidence

**Files:**
- Modify only files required by failures found in this task
- Save screenshots: `.context/unl-picker.png`, `.context/unl-today.png`, `.context/unl-groups-mobile.png`, `.context/unl-knockouts.png`

- [ ] **Step 1: Run the full automated suite**

Run: `npm run test:nations && npm run check && npm run lint && npm run build`  
Expected: every command exits 0; production output includes a Nations League season chunk or eager module and no TypeScript/ESLint warnings.

- [ ] **Step 2: Prove source integrity against live endpoints**

Run the ingest in dry-run mode and record its summary. Confirm 54 teams, 14
groups, 156 fixtures, zero unknown teams, zero duplicate IDs, zero UEFA/ESPN
pairing disagreements, and no destructive change relative to the checked-in
dataset. Fetch the FOX Soccer Atom feed and verify its channel ID without
spending API quota.

- [ ] **Step 3: Verify desktop navigation and saved selection**

At a clock inside the first window, capture the picker with Nations League
first. Seed `nss-tournament=ucl-2026`, reload, and prove UCL remains selected.
At a clock after 6 October, prove UCL is first for a clean profile.

- [ ] **Step 4: Verify dense Today and favourite continuity**

Favourite England in World Cup, switch to Nations League, and confirm England
remains followed. Inspect a ten-match day at desktop and 390px: every match is
present, `League · Group` tags do not collide with status badges, spotlight
dims only non-favourite matches, and scores remain hidden.

- [ ] **Step 5: Verify all group and stage states**

Capture League A and League D tabs, partial revealed standings, fully revealed
qualification bands, championship draw-pending state, and promotion/relegation
draw-pending state. Use fixture data in a local test copy to render one
two-legged tie and confirm aggregate/penalty advancement without changing the
checked-in generated dataset.

- [ ] **Step 6: Verify pipeline failure modes**

Run recorded truncated ESPN, unknown-team, duplicate-event, wrong-channel,
spoiler-title, quota-exhausted, failed-callback, and non-embeddable fixtures.
Confirm each retains last-known-good data, produces an audit reason, and exits
according to its documented retry/quarantine policy.

- [ ] **Step 7: Inspect the final diff and repository state**

Run:

```bash
git diff --check origin/main...
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no generated drift, no secrets or temporary
fixtures, and only scoped Nations League plus pre-existing archive commits.

- [ ] **Step 8: Request code review**

Invoke `superpowers:requesting-code-review`, address verified findings with
focused tests, rerun Step 1, and report the exact commands and outputs. Do not
promote FOX Soccer from quarantine until real opening-matchday evidence exists.
