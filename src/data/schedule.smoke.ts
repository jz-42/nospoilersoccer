import type { Tournament } from './types'
import { validateTournament } from './validate'
import { wc2026 } from './wc2026'
import { FIFA_WC2026_KICKOFFS, FIFA_WC2026_SCHEDULE } from './wc2026-official-schedule'
import { formatMatchDate } from '../components/format'
import { formatKickoffLocal } from '../time/local'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

function allMatches(t: Tournament) {
  return [...t.groupMatches, ...t.knockoutRounds.flatMap((round) => round.matches)]
}

function cloneTournament(t: Tournament): Tournament {
  return structuredClone(t)
}

const matches = allMatches(wc2026)
assert(FIFA_WC2026_SCHEDULE.length === 104, 'official FIFA fixture has 104 rows')
assert(Object.keys(FIFA_WC2026_KICKOFFS).length === 104, 'official FIFA fixture has 104 unique IDs')
assert(
  FIFA_WC2026_SCHEDULE.every(({ matchNumber }, index) => matchNumber === index + 1),
  'official FIFA match numbers cover 1 through 104 in order',
)
assert(matches.length === 104, '2026 tournament has exactly 104 matches')
assert(new Set(matches.map((match) => match.id)).size === 104, '2026 match IDs are unique')
assert(
  wc2026.knockoutRounds.flatMap((round) => round.matches).every((match) => match.kickoff),
  'all 32 knockout matches have kickoff instants',
)
assert(validateTournament(wc2026).length === 0, '2026 tournament passes official validation')

const changed = cloneTournament(wc2026)
changed.groupMatches[0].kickoff = '2026-06-11T20:00Z'
assert(
  validateTournament(changed).some((error) => error.includes('official kickoff')),
  'validator rejects kickoff drift',
)

const missing = cloneTournament(wc2026)
delete missing.groupMatches[0].kickoff
assert(
  validateTournament(missing).some((error) => error.includes('missing kickoff')),
  'validator rejects a missing kickoff',
)

const duplicate = cloneTournament(wc2026)
duplicate.groupMatches[1].id = duplicate.groupMatches[0].id
assert(
  validateTournament(duplicate).some((error) => error.includes('duplicate match id')),
  'validator rejects duplicate match IDs',
)

const fractionalEntertainmentRating = cloneTournament(wc2026)
fractionalEntertainmentRating.groupMatches[0].entertainmentSummary = 'A steady watch.'
fractionalEntertainmentRating.groupMatches[0].entertainmentRating = 3.5 as never
assert(
  validateTournament(fractionalEntertainmentRating).some((error) => error.includes('invalid entertainmentRating')),
  'validator rejects fractional entertainment ratings',
)

const knockoutEdge = wc2026.knockoutRounds.flatMap((round) => round.matches).find((match) => match.id === 'm94')
if (!knockoutEdge?.kickoff) throw new Error('Fixture error: expected knockout edge match m94 with kickoff data')
assert(
  formatMatchDate(knockoutEdge.date, knockoutEdge.kickoff, 'America/New_York') === 'Jul 6',
  'July 6 knockout date renders from the kickoff instant in Eastern Time',
)
assert(
  formatKickoffLocal(knockoutEdge.kickoff, 'America/New_York') === '8:00 PM ET',
  'July 6 knockout kickoff renders as 8:00 PM ET',
)

const shiftedKnockoutDate = cloneTournament(wc2026)
const shiftedM94 = shiftedKnockoutDate.knockoutRounds.flatMap((round) => round.matches).find((match) => match.id === 'm94')
if (!shiftedM94) throw new Error('Fixture error: expected mutable knockout edge match m94')
shiftedM94.date = '2026-07-07'
assert(
  validateTournament(shiftedKnockoutDate).some((error) => error.includes('published date')),
  'validator rejects a 2026 published date that disagrees with its Eastern kickoff date',
)

console.log('ALL OFFICIAL SCHEDULE TESTS PASS')
