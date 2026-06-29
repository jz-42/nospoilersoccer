/**
 * Integrity check for the FIFA Annexe C best-third allocation table
 * (src/data/wc2026-third-place.ts). Run via `npm run test:logic`.
 *
 * The table is auto-generated from FIFA's regulations PDF; these assertions make
 * sure it stays internally consistent and consistent with the wc2026 bracket's
 * own candidate-group lists, so a bad regeneration can never ship silently.
 */
import { wc2026 } from './wc2026'
import { WC2026_BEST_THIRD_ALLOCATION as TABLE } from './wc2026-third-place'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`ok - ${msg}`)
}

// Build winnerGroup -> allowed third-place groups from the bracket itself.
const candidates: Record<string, Set<string>> = {}
for (const round of wc2026.knockoutRounds) {
  for (const m of round.matches) {
    for (const side of ['home', 'away'] as const) {
      const slot = side === 'home' ? m.home : m.away
      if (slot.type !== 'best-third') continue
      const other = side === 'home' ? m.away : m.home
      if (other.type === 'group-rank') candidates[other.group] = new Set(slot.groups)
    }
  }
}
const winners = Object.keys(candidates).sort()
assert(winners.length === 8, 'bracket has 8 group winners that face a best-third team')

const combos = Object.keys(TABLE)
assert(combos.length === 495, 'table has all 495 combinations (12 choose 8)')

const seen = new Set<string>()
let bijectionOk = true
let candidateOk = true
let columnsOk = true
let keyOk = true
for (const [combo, row] of Object.entries(TABLE)) {
  if (seen.has(combo)) keyOk = false
  seen.add(combo)
  // Key is 8 distinct group letters, sorted.
  const letters = combo.split('')
  if (letters.length !== 8 || new Set(letters).size !== 8) keyOk = false
  if ([...letters].sort().join('') !== combo) keyOk = false

  // Row covers exactly the 8 winner columns.
  if (Object.keys(row).sort().join('') !== winners.join('')) columnsOk = false

  // Each advancing group is used exactly once (a bijection onto the combo set).
  const assigned = Object.values(row)
  if (new Set(assigned).size !== 8 || [...assigned].sort().join('') !== combo) bijectionOk = false

  // Every assignment respects the slot's candidate-group list.
  for (const [winner, third] of Object.entries(row)) {
    if (!candidates[winner]?.has(third)) candidateOk = false
  }
}
assert(keyOk, 'every combination key is 8 distinct, sorted group letters')
assert(columnsOk, 'every row maps exactly the 8 group winners')
assert(bijectionOk, 'every row assigns each advancing third to exactly one slot')
assert(candidateOk, 'every assignment is within the bracket’s candidate-group lists')

// Spot-check the actual 2026 outcome (Annexe C row 67).
const row2026 = TABLE['BDEFIJKL']
assert(!!row2026, '2026 combination BDEFIJKL is present')
assert(
  row2026.E === 'D' && row2026.B === 'J' && row2026.D === 'B' && row2026.A === 'E',
  '2026 row matches the official pairings (1E–3D, 1B–3J, 1D–3B, 1A–3E)',
)

console.log('ALL PASS')
