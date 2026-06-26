# Saved Highlights Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Reset progress` clear only spoiler-viewing progress while preserving manual saved matches, favorite teams, and the favorite auto-highlight preference.

**Architecture:** Keep the existing storage model where manual saves (`pins`) and favorite-team auto-highlighting remain separate inputs to one rendered saved state. Add a small pure reset helper in a separate state utility module so reset semantics can be tested without importing React hooks, then update the reset confirmation copy to describe hidden progress while reassuring users that saved items remain.

**Tech Stack:** React 19, TypeScript, localStorage-backed state, `tsx` smoke tests

---

### Task 1: Lock reset semantics with a failing regression test

**Files:**
- Modify: `src/state/progress.ts`
- Create: `src/state/reset.ts`
- Create: `src/state/progress.smoke.ts`

- [ ] **Step 1: Write the failing regression test**

Create `src/state/progress.smoke.ts` with a local `assert()` helper and
assertions for a pure reset helper imported from `src/state/reset.ts`:

```ts
import { resetTournamentProgressForViewing, type TournamentProgress } from './reset'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

const before: TournamentProgress = {
  marks: { 'm-1': 'watched', 'm-2': 'skipped' },
  revealed: ['ko-1'],
  pins: ['m-1', 'm-9'],
  favorites: ['arg', 'jpn'],
  favAuto: false,
}

const after = resetTournamentProgressForViewing(before)

assert(Object.keys(after.marks).length === 0, 'reset clears watched progress')
assert(after.revealed.length === 0, 'reset clears force-revealed slots')
assert(
  after.pins.length === 2 && after.pins[0] === 'm-1' && after.pins[1] === 'm-9',
  'reset preserves manual saved matches',
)
assert(
  after.favorites.length === 2 && after.favorites[0] === 'arg' && after.favorites[1] === 'jpn',
  'reset preserves favorite teams',
)
assert(after.favAuto === false, 'reset preserves the favorite auto-highlight preference')
assert(after !== before, 'reset returns a new object')
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx tsx src/state/progress.smoke.ts
```

Expected: module resolution fails because `src/state/reset.ts` does not exist
yet.

- [ ] **Step 3: Implement the minimal reset helper**

Create `src/state/reset.ts` with the state shape and pure helper:

```ts
export interface TournamentProgress {
  marks: Marks
  revealed: string[]
  pins: string[]
  favorites: TeamId[]
  favAuto: boolean
}

export function emptyTournamentProgress(): TournamentProgress {
  return { marks: {}, revealed: [], pins: [], favorites: [], favAuto: true }
}

export function resetTournamentProgressForViewing(tp: TournamentProgress): TournamentProgress {
  return {
    ...emptyTournamentProgress(),
    pins: tp.pins,
    favorites: tp.favorites,
    favAuto: tp.favAuto,
  }
}
```

Then import `emptyTournamentProgress()` and
`resetTournamentProgressForViewing()` into `src/state/progress.ts` so the hook
and test share one source of truth.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx tsx src/state/progress.smoke.ts
```

Expected: script exits successfully with no assertion failures.

### Task 2: Update reset copy to match the narrower scope

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Adjust the reset confirmation body**

Update the confirmation body so it describes only spoiler progress while
reassuring users that saved state remains, for example:

```tsx
body={`Every revealed score in ${t.name} will be hidden again. Saved matches and favorite teams stay put.`}
```

- [ ] **Step 2: Re-read the surrounding affordance text**

Check the footer button label and nearby UI to confirm nothing else implies the
action clears favorites or saved matches. Keep the button label if it remains
accurate once the dialog body clarifies scope.

### Task 3: Run targeted and full verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Include the new state regression in the logic test script**

Append the new smoke test to `test:logic`:

```json
"test:logic": "tsx src/logic/spoilers.smoke.ts && tsx src/time/local.smoke.ts && tsx src/components/schedule.smoke.ts && tsx src/data/schedule.smoke.ts && tsx src/data/videos.smoke.ts && tsx src/state/progress.smoke.ts && tsx scripts/fox.smoke.ts"
```

- [ ] **Step 2: Run focused verification**

Run:

```bash
npx tsx src/state/progress.smoke.ts
```

Expected: PASS.

- [ ] **Step 3: Run full relevant verification**

Run:

```bash
npm run test:logic
npm run test:components
npm run check
```

Expected: all commands pass with no regression in spoiler logic, disclosure
copy, or type-checking.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --check
git diff -- src/state/progress.ts src/state/progress.smoke.ts src/App.tsx package.json docs/superpowers/specs/2026-06-26-saved-highlights-reset-design.md docs/superpowers/plans/2026-06-26-saved-highlights-reset.md
```

Expected: no whitespace errors; diff shows only the approved reset semantics,
copy clarification, regression coverage, and planning docs.
