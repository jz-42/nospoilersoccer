import { isSafeSummary, loadEntertainment, parseVerdict, shouldCurate } from './curate-entertainment'
import { tournaments } from '../src/data'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const existing = loadEntertainment()
assert(existing.D5?.entertainmentRating === 4, 'curator loads existing generated entertainment entries')

assert(
  parseVerdict('{"suitable":true,"rating":4,"summary":"A lively watch.","reason":"usable"}').rating === 4,
  'curator accepts integer entertainment ratings',
)

let rejectedFractionalRating = false
try {
  parseVerdict('{"suitable":true,"rating":3.5,"summary":"A lively watch.","reason":"usable"}')
} catch {
  rejectedFractionalRating = true
}
assert(rejectedFractionalRating, 'curator rejects fractional entertainment ratings')

assert(
  !isSafeSummary('A goalless but tense watch with long spells of pressure.'),
  'curator rejects textual goal-count spoilers',
)

const oldMissingSummary = tournaments.wc2026.groupMatches.find(
  (match) => match.score && !existing[match.id],
)
if (!oldMissingSummary) throw new Error('Fixture error: expected a played match without entertainment data')
assert(
  shouldCurate(oldMissingSummary, existing, {
    aiEnabled: true,
    now: new Date('2026-06-26T23:00:00Z').getTime(),
  }),
  'curator can backfill older played matches without a max-age cutoff',
)

console.log('ALL PASS')
