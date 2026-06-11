/**
 * Smoke test for the spoiler engine. Run with `npm run test:logic`
 * (also part of `npm run build`, so a regression fails the deploy).
 */
import { wc2022 } from '../data/wc2022'
import type { Marks } from './spoilers'
import {
  canForceReveal,
  groupComplete,
  isPlayed,
  knockoutReady,
  resolveSlot,
  slotLabel,
  totalMatches,
  withUnmarked,
} from './spoilers'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

const t = wc2022
const m49 = t.knockoutRounds[0].matches[0] // NED vs USA (1A v 2B)
const m58 = t.knockoutRounds[1].matches[1] // winner m49 vs winner m50
const final = t.knockoutRounds[4].matches[0]

const marks: Marks = {}
assert(!groupComplete(t, 'A', marks), 'group A incomplete with no marks')
assert(resolveSlot(t, m49, 'home', marks) === null, 'R16 slot hidden before group done')
assert(slotLabel(t, m49.home) === 'Winner Group A', 'placeholder label for group winner')
assert(slotLabel(t, m58.home) === 'Winner of R16 1', 'placeholder label for match winner')
assert(slotLabel(t, final.home) === 'Winner of SF 1', 'placeholder label for final')

// Mark all of group A (mix of watched and skipped)
for (const m of t.groupMatches.filter((x) => x.group === 'A')) {
  marks[m.id] = m.id === 'A1' ? 'watched' : 'skipped'
}
assert(groupComplete(t, 'A', marks), 'group A complete after 6 marks')
assert(resolveSlot(t, m49, 'home', marks) === 'NED', 'NED revealed as group A winner')
assert(resolveSlot(t, m49, 'away', marks) === null, 'USA still hidden (group B not done)')
assert(!knockoutReady(t, m49, marks), 'm49 not markable until both groups done')

// Complete group B too, then walk the bracket arm
for (const m of t.groupMatches.filter((x) => x.group === 'B')) marks[m.id] = 'skipped'
assert(knockoutReady(t, m49, marks), 'm49 ready after groups A+B')
marks['m49'] = 'watched'
assert(resolveSlot(t, m58, 'home', marks) === 'NED', 'QF home slot reveals after R16 marked')
assert(resolveSlot(t, m58, 'away', marks) === null, 'QF away slot waits for m50')

// Undo cascade: unmark a group B game -> m49 must re-hide, m58 re-locks
for (const m of t.groupMatches.filter((x) => ['C', 'D'].includes(x.group))) {
  marks[m.id] = 'skipped'
}
marks['m50'] = 'watched'
marks['m58'] = 'watched'
const after = withUnmarked(t, marks, 'B1')
assert(after['B1'] === undefined, 'B1 unmarked')
assert(after['m49'] === undefined, 'cascade unmarked m49 (group B incomplete)')
assert(after['m58'] === undefined, 'cascade unmarked m58 (depends on m49)')
assert(after['m50'] === 'watched', 'm50 untouched (groups C+D still complete)')
assert(totalMatches(t) === 64, '64 total matches')

// Jump-ahead: force-revealing a match shows its teams without feeder progress
const fresh: Marks = {}
const revealed = new Set(['m58'])
assert(canForceReveal(m58), 'm58 teams are in the data, so it can be force-revealed')
assert(resolveSlot(t, m58, 'home', fresh, revealed) === 'NED', 'force-reveal shows home team')
assert(resolveSlot(t, m58, 'away', fresh, revealed) === 'ARG', 'force-reveal shows away team')
assert(knockoutReady(t, m58, fresh, revealed), 'force-revealed match is markable')
assert(resolveSlot(t, m49, 'home', fresh, revealed) === null, 'other matches stay hidden')

// Live tournaments: a match without a score can't be marked or force-revealed
const future = { ...m49, score: undefined, penalties: undefined, homeTeam: undefined, awayTeam: undefined }
assert(!isPlayed(future), 'match without score is not played')
assert(!knockoutReady(t, future, fresh, new Set([future.id])), 'unplayed match is never ready')
assert(!canForceReveal(future), 'unplayed match with unknown teams cannot be force-revealed')

console.log('ALL PASS')
