import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { tournaments } from '../data'
import type { Progress } from '../state/progress'
import { Bracket } from './Bracket'
import { MatchTile } from './MatchTile'
import { PreviewCard } from './PreviewCard'
import type { GroupMatch } from '../data/types'
import { groupMatchesByLocalDate, matchLocalDate } from './schedule'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const lateMatch: GroupMatch = {
  id: 'late',
  group: 'A',
  matchday: 1,
  date: '2026-06-20',
  kickoff: '2026-06-21T00:30Z',
  home: 'AAA',
  away: 'BBB',
}
const earlyMatch: GroupMatch = {
  ...lateMatch,
  id: 'early',
  kickoff: '2026-06-20T19:00Z',
}

assert(
  matchLocalDate(lateMatch, 'America/Los_Angeles') === '2026-06-20',
  'late UTC match stays on June 20 in Los Angeles',
)
assert(
  matchLocalDate(lateMatch, 'Europe/Amsterdam') === '2026-06-21',
  'late UTC match moves to June 21 in Amsterdam',
)

const newYork = groupMatchesByLocalDate([lateMatch, earlyMatch], 'America/New_York')
assert(newYork.length === 1, 'New York groups both examples on one local day')
assert(newYork[0].matches[0].id === 'early', 'matches sort by kickoff within a local day')

const amsterdam = groupMatchesByLocalDate([lateMatch, earlyMatch], 'Europe/Amsterdam')
assert(amsterdam.length === 2, 'Amsterdam splits examples across local days')
assert(amsterdam[1].matches[0].id === 'late', 'local day groups sort chronologically')

const noop = () => {}
const emptyProgress: Progress = {
  marks: {},
  revealed: new Set(),
  pins: new Set(),
  favorites: [],
  favAuto: true,
  setMark: noop,
  unmark: noop,
  reveal: noop,
  togglePin: noop,
  toggleFavorite: noop,
  moveFavorite: noop,
  setFavAuto: noop,
  catchUp: noop,
  reset: noop,
}

const wc2026 = tournaments.wc2026
const liveGroupSource = wc2026.groupMatches.find((match): match is GroupMatch => Boolean(match.kickoff))
if (!liveGroupSource?.kickoff) throw new Error('Fixture error: expected a group match with kickoff data')
const liveGroup: GroupMatch = {
  ...liveGroupSource,
  score: undefined,
  goals: undefined,
  videos: undefined,
  liveStatus: { kind: 'live' },
}

const tileMarkup = renderToStaticMarkup(
  createElement(MatchTile, {
    t: wc2026,
    m: liveGroup,
    progress: emptyProgress,
    onOpen: noop,
  }),
)
assert(tileMarkup.includes('Live'), 'live match tile shows Live badge')
assert(tileMarkup.includes('live-status-dot'), 'live match tile renders status dot')
assert(!tileMarkup.includes('FT'), 'live match tile suppresses FT badge')

const previewMarkup = renderToStaticMarkup(
  createElement(PreviewCard, {
    t: wc2026,
    entry: { target: { kind: 'group', match: liveGroup }, date: liveGroup.date },
    progress: emptyProgress,
    onOpen: noop,
  }),
)
assert(previewMarkup.includes('Live'), 'live preview card shows Live badge')
assert(!previewMarkup.includes('Highlights ready'), 'live preview card does not reuse watch copy')

const liveBracketTournament = structuredClone(wc2026)
const liveBracketMatch = liveBracketTournament.knockoutRounds
  .flatMap((round) => round.matches)
  .find((match) => match.homeTeam && match.awayTeam)
if (!liveBracketMatch) throw new Error('Fixture error: expected a knockout match with resolved teams')
liveBracketMatch.score = undefined
liveBracketMatch.goals = undefined
liveBracketMatch.videos = undefined
liveBracketMatch.liveStatus = { kind: 'live' }
const bracketMarkup = renderToStaticMarkup(
  createElement(Bracket, {
    t: liveBracketTournament,
    progress: emptyProgress,
    onOpen: noop,
  }),
)
assert(bracketMarkup.includes('Live'), 'live bracket card shows Live badge')

console.log('ALL LOCAL GROUPING TESTS PASS')
