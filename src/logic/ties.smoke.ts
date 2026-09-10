/**
 * Two-legged ties: the leg gate and tie-fed knockout slots.
 *
 * The product rule under test is that leg 2 stays sealed until leg 1 is marked,
 * and that a tie only advances a team once *both* legs are marked — a tie is
 * settled by the pair, never by either leg alone.
 */
import type { Tournament } from '../data/types'
import { twoLeggedFixture } from './ties-fixture'
import { tieWinner } from '../data/types'
import { validateTournament } from '../data/validate'
import {
  knockoutReady,
  legUnlocked,
  resolveSlot,
  slotLabel,
  slotUnlocked,
  tieRevealed,
  withUnmarked,
  type Marks,
} from './spoilers'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}


/** A miniature two-legged competition: one league table, one tie, one final. */
const t = twoLeggedFixture()

const tie = t.ties![0]
const leg1 = t.knockoutRounds[0].matches[0]
const leg2 = t.knockoutRounds[0].matches[1]
const final = t.knockoutRounds[1].matches[0]
const allGroups: Marks = Object.fromEntries(t.groupMatches.map((m) => [m.id, 'watched' as const]))

// --- the leg gate ----------------------------------------------------------

assert(legUnlocked(t, leg1, {}) === true, 'leg 1 is never gated')
assert(legUnlocked(t, leg2, allGroups) === false, 'leg 2 is sealed while leg 1 is unmarked')
assert(
  knockoutReady(t, leg2, allGroups) === false,
  'leg 2 cannot be marked while leg 1 is unmarked, even with the table complete',
)
assert(
  knockoutReady(t, leg1, allGroups) === true,
  'leg 1 is markable as soon as its own slots resolve',
)

const afterLeg1: Marks = { ...allGroups, 'sf-1-l1': 'watched' }
assert(legUnlocked(t, leg2, afterLeg1) === true, 'marking leg 1 unseals leg 2')
assert(knockoutReady(t, leg2, afterLeg1) === true, 'leg 2 becomes markable once leg 1 is marked')

assert(
  knockoutReady(t, leg2, allGroups, new Set(['sf-1-l2'])) === false,
  'force-revealing leg 2 reveals the matchup but still cannot unseal the result',
)

// --- the tie advances, not the leg -----------------------------------------

assert(tieRevealed(tie, afterLeg1) === false, 'one leg marked is not a revealed tie')
assert(
  slotUnlocked(t, final.home, afterLeg1) === false,
  'the final stays locked while only leg 1 is marked',
)
assert(
  resolveSlot(t, final, 'home', afterLeg1) === null,
  'who advanced is hidden until both legs are marked',
)

const bothLegs: Marks = { ...afterLeg1, 'sf-1-l2': 'watched' }
assert(tieRevealed(tie, bothLegs) === true, 'both legs marked reveals the tie')
assert(slotUnlocked(t, final.home, bothLegs) === true, 'the final unlocks once the tie is complete')
assert(resolveSlot(t, final, 'home', bothLegs) === 'a', 'the tie winner fills the slot below it')

// --- undoing leg 1 re-seals leg 2 ------------------------------------------

const undone = withUnmarked(t, bothLegs, 'sf-1-l1')
assert(undone['sf-1-l2'] === undefined, 'unmarking leg 1 also unmarks leg 2')
assert(undone['f'] === undefined, 'unmarking leg 1 cascades past the tie to the final')

// --- winner derivation ------------------------------------------------------

assert(tieWinner(tie) === 'a', 'a stored tie winner is used as-is')
assert(
  tieWinner({ id: 'x', legs: ['1', '2'], homeTeam: 'a', awayTeam: 'b', aggregate: { home: 1, away: 4 } }) === 'b',
  'an unstored winner is derived from the aggregate',
)
assert(
  tieWinner({ id: 'x', legs: ['1', '2'], homeTeam: 'a', awayTeam: 'b', aggregate: { home: 2, away: 2 } }) === null,
  'a level aggregate with no shootout is undecided',
)
assert(
  tieWinner({
    id: 'x', legs: ['1', '2'], homeTeam: 'a', awayTeam: 'b',
    aggregate: { home: 2, away: 2 }, penalties: { home: 4, away: 3 },
  }) === 'a',
  'a level aggregate is settled by the leg-2 shootout',
)

// --- labels count ties, not legs -------------------------------------------

assert(
  slotLabel(t, final.home) === 'Winner of SF',
  `a tie-fed slot is labelled by its round, got "${slotLabel(t, final.home)}"`,
)

console.log('ALL TIE TESTS PASS')

// --- the validator ---------------------------------------------------------
// The tie rules above are only worth having if a bad ingest trips them, and no
// shipped dataset has ties yet — so the fixture doubles as the validator's
// test. Each case mutates one field of an otherwise-valid tie.

const clean = validateTournament(t)
assert(clean.length === 0, `the fixture validates clean, got: ${clean.join('; ')}`)

const broken = (mutate: (x: Tournament) => void, label: string, expect: RegExp) => {
  const copy = structuredClone(t)
  mutate(copy)
  const errors = validateTournament(copy)
  assert(
    errors.some((e) => expect.test(e)),
    `${label} — got: ${errors.join('; ') || '(none)'}`,
  )
}

broken((x) => { x.ties![0].aggregate = { home: 9, away: 0 } }, 'a wrong aggregate is caught', /aggregate .* does not match its legs/)
broken((x) => { x.ties![0].winner = 'b' }, 'a winner contradicting the scores is caught', /disagrees with its scores/)
broken((x) => { x.ties![0].winner = 'd' }, 'a winner who never played is caught', /did not play in the tie/)
broken((x) => { x.knockoutRounds[0].matches[1].tie = { id: 'sf-1', leg: 1 } }, 'a mislabelled leg number is caught', /is leg 2 of sf-1 but says 1/)
broken((x) => { delete x.knockoutRounds[0].matches[1].tie }, 'a leg that does not name its tie is caught', /does not say so/)
broken((x) => { x.ties![0].legs[1] = 'nope' }, 'a tie pointing at a missing match is caught', /references unknown match nope/)
broken((x) => { x.knockoutRounds[0].matches[1].date = '2026-09-20' }, 'legs played out of order are caught', /leg 2 .* is before leg 1/)
broken((x) => { x.knockoutRounds[0].matches[1].homeTeam = 'c'; x.knockoutRounds[0].matches[1].awayTeam = 'd' }, 'a second leg between different teams is caught', /is not leg 2's/)
broken((x) => { x.knockoutRounds[0].matches[1].score = { home: 2, away: 1 } }, 'a level aggregate with no shootout is caught', /finished level on aggregate .* with no shootout/)
broken((x) => { x.ties![0].penalties = { home: 4, away: 3 } }, 'a shootout after a decided aggregate is caught', /shootout but was not level on aggregate/)

// A drawn first leg is the most ordinary result in the competition, so the
// single-leg "must produce a winner" rule must not fire on it.
const drawnLeg1 = structuredClone(t)
drawnLeg1.knockoutRounds[0].matches[0].score = { home: 1, away: 1 }
drawnLeg1.knockoutRounds[0].matches[1].score = { home: 1, away: 2 }
drawnLeg1.ties![0].aggregate = { home: 3, away: 2 }
assert(
  validateTournament(drawnLeg1).length === 0,
  `a drawn first leg is not flagged as a level knockout, got: ${validateTournament(drawnLeg1).join('; ')}`,
)

console.log('ALL TIE VALIDATION TESTS PASS')
