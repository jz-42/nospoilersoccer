# Tournament Archive Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the day rail available after a tournament while switching archived tournaments to a Knockouts landing view and a Day tab that opens the final matchday.

**Architecture:** Add pure, visitor-local tournament-phase helpers in a focused navigation module. `App` will use them for initial view, tab labeling, and tournament switches; `Rail` will use the same date rule for its initial/return anchor so archived tournaments never add an empty current-day card.

**Tech Stack:** React 19, TypeScript 6, Vite, `tsx` smoke tests

---

### Task 1: Pure tournament navigation rules

**Files:**
- Create: `src/navigation.ts`
- Create: `src/navigation.smoke.ts`

- [ ] **Step 1: Write the failing navigation-rule test**

Create `src/navigation.smoke.ts` with assertions that a scored final remains current on its visitor-local final date, archives the following day, produces the correct view and label, anchors archived day navigation to the last matchday, handles 2022 as archived, and respects a timezone where the final is on July 20.

```ts
import { wc2022 } from './data/wc2022'
import { wc2026 } from './data/wc2026'
import {
  dayRailInitialDate,
  dayTabLabel,
  defaultTournamentView,
  isTournamentArchived,
} from './navigation'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const finalDayInLosAngeles = new Date('2026-07-20T06:59:00Z')
assert(!isTournamentArchived(wc2026, finalDayInLosAngeles, 'America/Los_Angeles'), 'final local day remains current after its score arrives')
assert(defaultTournamentView(wc2026, finalDayInLosAngeles, 'America/Los_Angeles') === 'day', 'final local day defaults to Today')
assert(dayTabLabel(wc2026, finalDayInLosAngeles, 'America/Los_Angeles') === 'Today', 'final local day keeps Today label')

const archiveDayInLosAngeles = new Date('2026-07-20T07:01:00Z')
assert(isTournamentArchived(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles'), 'day after final enters archive')
assert(defaultTournamentView(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles') === 'bracket', 'archive defaults to Knockouts')
assert(dayTabLabel(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles') === 'Day', 'archive relabels Today to Day')
assert(dayRailInitialDate(wc2026, archiveDayInLosAngeles, 'America/Los_Angeles') === '2026-07-19', 'archive day rail opens final local matchday')

assert(defaultTournamentView(wc2022, archiveDayInLosAngeles, 'America/Los_Angeles') === 'bracket', 'historical tournament defaults to Knockouts')

const finalDayInTokyo = new Date('2026-07-20T12:00:00Z')
assert(!isTournamentArchived(wc2026, finalDayInTokyo, 'Asia/Tokyo'), 'Tokyo remains current on its July 20 final matchday')
assert(dayRailInitialDate(wc2026, new Date('2026-07-20T15:01:00Z'), 'Asia/Tokyo') === '2026-07-20', 'Tokyo archive opens its local final matchday')

console.log('navigation smoke tests passed')
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx tsx --tsconfig tsconfig.app.json src/navigation.smoke.ts`

Expected: FAIL because `./navigation` does not exist.

- [ ] **Step 3: Implement the minimal pure navigation helpers**

Create `src/navigation.ts`:

```ts
import type { Tournament } from './data/types'
import { matchLocalDate } from './components/schedule'
import { localDateKey } from './time/local'

export type View = 'day' | 'groups' | 'bracket'

function tournamentMatches(t: Tournament) {
  return [
    ...t.groupMatches,
    ...t.knockoutRounds.flatMap((round) => round.matches),
  ]
}

export function tournamentMatchDates(t: Tournament, timeZone?: string): string[] {
  return [...new Set(tournamentMatches(t).map((match) => matchLocalDate(match, timeZone)))].sort()
}

export function isTournamentArchived(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): boolean {
  const dates = tournamentMatchDates(t, timeZone)
  const finalDate = dates.at(-1)
  return finalDate !== undefined && localDateKey(now, timeZone) > finalDate
}

export function defaultTournamentView(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): View {
  return isTournamentArchived(t, now, timeZone) ? 'bracket' : 'day'
}

export function dayTabLabel(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): 'Today' | 'Day' {
  return isTournamentArchived(t, now, timeZone) ? 'Day' : 'Today'
}

export function dayRailInitialDate(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): string {
  if (!isTournamentArchived(t, now, timeZone)) return localDateKey(now, timeZone)
  return tournamentMatchDates(t, timeZone).at(-1) ?? localDateKey(now, timeZone)
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx tsx --tsconfig tsconfig.app.json src/navigation.smoke.ts`

Expected: `navigation smoke tests passed`.

- [ ] **Step 5: Commit the pure rules**

```bash
git add src/navigation.ts src/navigation.smoke.ts
git commit -m "Add tournament archive navigation rules"
```

### Task 2: Wire archive rules into App and Rail

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Rail.tsx`
- Modify: `src/navigation.smoke.ts`
- Modify: `package.json`

- [ ] **Step 1: Extend the smoke test with UI wiring contracts**

Append source assertions to `src/navigation.smoke.ts`:

```ts
import fs from 'node:fs'

const appSource = fs.readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const railSource = fs.readFileSync(new URL('./components/Rail.tsx', import.meta.url), 'utf8')

assert(appSource.includes("useState<View>(() => defaultTournamentView(baseTournament))"), 'App initializes from tournament phase')
assert(appSource.includes('setTab(defaultTournamentView(tournaments[id]))'), 'tournament switching resets to its phase default')
assert(appSource.includes('{dayTabLabel(t)}'), 'App renders the phase-aware day label')
assert(railSource.includes('const anchorDate = dayRailInitialDate(t, now)'), 'Rail uses the phase-aware anchor date')
assert(railSource.includes("isTournamentArchived(t, now) ? 'Final day' : 'Today'"), 'Rail uses an archive-safe return label')
```

Add `tsx --tsconfig tsconfig.app.json src/navigation.smoke.ts` to `test:components` in `package.json`.

- [ ] **Step 2: Run the test and verify the wiring assertions fail**

Run: `npx tsx --tsconfig tsconfig.app.json src/navigation.smoke.ts`

Expected: FAIL at `App initializes from tournament phase`.

- [ ] **Step 3: Update App navigation**

In `src/App.tsx`, remove the `isLive` import and local `Tab` type, import `View`, `dayTabLabel`, and `defaultTournamentView`, initialize the tab from `baseTournament`, always render the day button, render its phase-aware label, and reset the tab in `selectTournament`:

```ts
import { dayTabLabel, defaultTournamentView, type View } from './navigation'

const [tab, setTab] = useState<View>(() => defaultTournamentView(baseTournament))
const view = tab

const selectTournament = (id: string) => {
  setTournamentId(id)
  setTab(defaultTournamentView(tournaments[id]))
  setModal(null)
  // existing persistence remains unchanged
}
```

The first navigation button is unconditional and its body is `{dayTabLabel(t)}`.

- [ ] **Step 4: Update the Rail anchor**

In `src/components/Rail.tsx`, import `dayRailInitialDate` and `isTournamentArchived`. Replace the always-inserted `today` anchor with `anchorDate`, rename `todayIndex` to `anchorIndex`, and use it for initial scrolling and the return button. The return button says `Final day` in archive mode and `Today` otherwise.

```ts
const today = localDateKey(now)
const anchorDate = dayRailInitialDate(t, now)
const dates = [...new Set([...entries.map((entry) => entry.date), anchorDate])].sort()
const anchorIndex = dates.indexOf(anchorDate)
const [active, setActive] = useState(anchorIndex)
```

Keep relative date labels and empty-day copy based on the actual `today` value.

- [ ] **Step 5: Run focused tests and type checking**

Run: `npx tsx --tsconfig tsconfig.app.json src/navigation.smoke.ts && npx tsc -b`

Expected: `navigation smoke tests passed` and exit code 0.

- [ ] **Step 6: Commit the UI integration**

```bash
git add src/App.tsx src/components/Rail.tsx src/navigation.smoke.ts package.json
git commit -m "Archive completed tournament navigation"
```

### Task 3: Full verification

**Files:**
- Modify only if verification exposes a scoped defect.

- [ ] **Step 1: Run formatting and static checks**

Run: `git diff --check origin/main...HEAD && npm run lint`

Expected: both commands exit 0.

- [ ] **Step 2: Run the complete project check**

Run: `npm run check`

Expected: all data, logic, component, analytics, and TypeScript checks pass.

- [ ] **Step 3: Build the production bundle**

Run: `npm run build`

Expected: Vite produces `dist/` successfully.

