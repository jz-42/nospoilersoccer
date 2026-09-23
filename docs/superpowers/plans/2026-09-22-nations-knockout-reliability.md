# Nations League Knockout Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents.

**Goal:** Discover knockout draws without a pre-existing fixture window, retain published knockout scores across bad ESPN snapshots, and render the championship as a connected World Cup-style bracket.

**Architecture:** A small Nations ingest gate combines the existing schedule window with a bounded pending-stage discovery opportunity. The ESPN builder compares complete new rounds with previous rounds before publication. The shared bracket layout resolves feeder references to either a single match or a two-leg tie.

**Tech Stack:** GitHub Actions, Node/TSX, TypeScript, React server-rendered smoke tests.

---

### Task 1: Discover draws off-window

**Files:** Create `scripts/nations-ingest-gate.ts`; modify `.github/workflows/update-results.yml`, `scripts/update-workflow.smoke.ts`, `package.json` only if needed to include a new smoke test.

- [ ] **Write a failing gate regression test.** Create `scripts/nations-ingest-gate.smoke.ts` with a test of `shouldRunNationsIngest({ insideWindow: false, pendingStageCount: 1, cycle: 1, now: new Date('2026-11-20T06:10:00Z') }) === true`. Assert false at 07:10, false in cycle 2, false with zero pending stages, and true for an active fixture window in any cycle. These cases prove a draw can be discovered when no knockout fixture is published.

```ts
import { strict as assert } from 'node:assert'
import { shouldRunNationsIngest } from './nations-ingest-gate'

const base = { insideWindow: false, pendingStageCount: 1, cycle: 1, now: new Date('2026-11-20T06:10:00Z') }
assert.equal(shouldRunNationsIngest(base), true)
assert.equal(shouldRunNationsIngest({ ...base, now: new Date('2026-11-20T07:10:00Z') }), false)
assert.equal(shouldRunNationsIngest({ ...base, cycle: 2 }), false)
assert.equal(shouldRunNationsIngest({ ...base, pendingStageCount: 0 }), false)
assert.equal(shouldRunNationsIngest({ ...base, insideWindow: true, cycle: 2 }), true)
```
- [ ] **Run red.** `npx tsx scripts/nations-ingest-gate.smoke.ts` must fail because `shouldRunNationsIngest` does not yet exist.
- [ ] **Implement the gate.** Export a pure `shouldRunNationsIngest` from `scripts/nations-ingest-gate.ts`: return true immediately for `insideWindow`; otherwise require `pendingStageCount > 0`, `cycle === 1`, and `now.getUTCHours() % 6 === 0`. In its CLI entrypoint, read the checked-in `unl-2026.ts`, call the existing `parseMatchKickoffs`/`buildWindowReport`, import `unl2026` to count `knockoutTracks[].pendingStages`, and exit 0 when due or 1 when not due. Reject invalid cycle arguments with a thrown error. No YouTube call belongs in this script.

```ts
export function shouldRunNationsIngest(input: {
  insideWindow: boolean
  pendingStageCount: number
  cycle: number
  now: Date
}): boolean {
  return input.insideWindow || (
    input.pendingStageCount > 0 && input.cycle === 1 && input.now.getUTCHours() % 6 === 0
  )
}
// CLI: const source = readFileSync(new URL('../src/data/nations/unl-2026.ts', import.meta.url), 'utf8')
// CLI: const insideWindow = buildWindowReport(parseMatchKickoffs(source, 'unl-2026'), now).insideWindow
// CLI: const pendingStageCount = unl2026.knockoutTracks?.reduce((n, track) => n + (track.pendingStages?.length ?? 0), 0) ?? 0
// CLI: process.exit(shouldRunNationsIngest({ insideWindow, pendingStageCount, cycle, now }) ? 0 : 1)
```
- [ ] **Wire and test the workflow.** Replace the inline Node window gate at `.github/workflows/update-results.yml:266-275` with `npx tsx scripts/nations-ingest-gate.ts "$cycle"`. Update `scripts/update-workflow.smoke.ts` to assert this gate precedes `nations_step`, while preserving its backup/validation assertion. Add the new smoke to `test:nations` in `package.json`. Run `npx tsx scripts/nations-ingest-gate.smoke.ts`, `npx tsx scripts/update-workflow.smoke.ts`, and `npm run test:nations`; confirm each passes. Commit this task.

### Task 2: Reject vanished knockout scores

**Files:** Modify `scripts/espn-nations-lib.ts`, `scripts/espn-nations.smoke.ts`.

- [ ] **Write a failing regression test.** In `scripts/espn-nations.smoke.ts`, make a complete QF draw in which the first leg has a completed score, then build again from the same eight fixtures with that event's `completed` flag false and the scored tournament as `previous`. Assert the audit contains `lost finished score`, and the returned QF round and ties retain the prior scored state. Also assert that a complete new snapshot with the same scored match does not raise this error.

```ts
const scoredQfEvents = qfEvents.map((raw, index) => index === 0 ? {
  ...raw,
  competitions: [{ ...raw.competitions[0], status: { type: { completed: true, detail: 'FT', state: 'post' } } }],
} : raw)
const scoredDraw = buildNationsSeason({ standings: fullStandings, events: [...fullGroupEvents, ...scoredQfEvents], official: fullOfficial })
const lostScore = buildNationsSeason({
  standings: fullStandings, events: [...fullGroupEvents, ...qfEvents], official: fullOfficial,
  previous: scoredDraw.tournament,
})
assert(lostScore.audit.errors.some((message) => message.includes('lost finished score')), 'lost knockout score blocks publication')
assert(lostScore.tournament.knockoutRounds[0].matches[0].score !== undefined, 'previous knockout score is retained')
assert(lostScore.tournament.ties?.length === scoredDraw.tournament.ties?.length, 'previous ties are retained')
```
- [ ] **Run red.** `npx tsx scripts/espn-nations.smoke.ts` must fail because the new complete stage currently replaces the previous scored round.
- [ ] **Implement the stage regression guard.** In `addKnockoutStages`, before accepting `materialized`, compare each previously scored match in `previousRound.matches` by ID with `materialized.round.matches`. If missing or unscored, add an audit error naming stage and match, then reuse the previous round and its ties. Keep the existing incomplete-stage fallback. Do not reject a different *present* score solely because it changed; corrections still pass normal validation.

```ts
const currentById = new Map(materialized?.round.matches.map((match) => [match.id, match]))
const lostScores = previousRound?.matches.filter((match) =>
  match.score && !currentById.get(match.id)?.score,
) ?? []
if (materialized && lostScores.length === 0) {
  tournament.knockoutRounds.push(materialized.round)
  tournament.ties = [...(tournament.ties ?? []), ...materialized.ties]
} else if (previousRound) {
  for (const match of lostScores) errors.push(`${stage} event ${match.id} lost finished score from the previous snapshot`)
  // Keep the existing previous-round-and-ties retention branch.
}
```
- [ ] **Verify and commit.** Run the focused smoke, `npm run validate:data`, and `npm run test:nations`. Confirm green, then commit this task.

### Task 3: Restore the connected championship bracket

**Files:** Modify `src/components/Bracket.tsx`, `src/components/knockout-tracks.smoke.tsx`.

- [ ] **Write a failing rendered regression.** In `knockout-tracks.smoke.tsx`, build a synthetic championship containing four QF ties (two leg matches each), two SF matches whose winner slots reference the tie IDs, a final fed by the SF match IDs, and a third-place match fed by their loser IDs. Render `KnockoutTracks` and assert its HTML contains the connected bracket's side columns and not `bracket-simple`; assert all eight QF leg cards remain present. Keep the existing pending-stage and promotion-track assertions.
- [ ] **Run red.** `npx tsx --tsconfig tsconfig.app.json src/components/knockout-tracks.smoke.tsx` must show the disconnected-column assertion failing.
- [ ] **Resolve tie feeders.** In `buildLayout` in `Bracket.tsx`, when a `match-winner` reference is not a match ID, look up that tie in `t.ties`, resolve its two leg IDs through the round match map, and return both legs in tie order. Keep `match-loser` handling for the separate third-place card as it is. The existing `half()` then gets a QF column before each SF column, matching `roundNames`.

```ts
const byTieId = new Map((t.ties ?? []).map((tie) => [tie.id, tie]))
const feederMatches = (id: string): KnockoutMatch[] => {
  const match = byId.get(id)
  if (match) return [match]
  const tie = byTieId.get(id)
  return tie?.legs.map((legId) => byId.get(legId)).filter((leg): leg is KnockoutMatch => !!leg) ?? []
}
// In feedersOf: out.push(...feederMatches(slot.match))
// For final slots: use feederMatches(slot.match)[0]; final remains fed by one SF match per side.
```
- [ ] **Keep flow spoiler-safe.** For a tie feeding an SF, only set that SF's incoming `flow-in` state after both legs have marks; a single QF leg must not imply an advancing team. Add a focused rendered assertion with only one leg marked, then with both marked. Do not expose scores or winners from unmarked legs.

```ts
const feederDecided = (match: KnockoutMatch) => {
  if (!match.tie) return progress.marks[match.id] !== undefined
  const tie = t.ties?.find((candidate) => candidate.id === match.tie?.id)
  return !!tie && tie.legs.every((legId) => progress.marks[legId] !== undefined)
}
// In Column.inFlow: return (feeders.get(m.id) ?? []).some(feederDecided)
```
- [ ] **Verify and commit.** Run the focused component smoke, `npm run test:components`, and `npm run test:nations`. Confirm connected layout and no regression, then commit this task.

### Task 4: Final verification and operations note

**Files:** Modify `docs/nations-league-operations.md`.

- [ ] **Update the runbook.** Describe the six-hour UTC-hour discovery opportunity while pending stages exist, the unchanged five-minute result-window ingest, and the knockout-score last-known-good rejection. State explicitly that draw discovery uses ESPN calls, not YouTube quota.
- [ ] **Run release checks.** Run `npm run test:nations`, `npm run check`, `npm run lint`, `npm run build`, `git diff --check origin/main...HEAD`, and `git status --short`. Record any pre-existing warnings separately from failures.
- [ ] **Review and commit.** Inspect `git diff` for the four task areas, commit the runbook and plan tracking, and leave the Conductor branch and worktree intact. Do not push, deploy, merge, or change FOX trust mode without a separate request.
