import { renderToStaticMarkup } from 'react-dom/server'
import { unl2026 } from '../data/nations/unl-2026'
import type { KnockoutMatch, Tie, Tournament } from '../data/types'
import type { Progress } from '../state/progress'
import { KnockoutTracks, PendingStageCard } from './KnockoutTracks'
import { roundsForTrack } from './knockout-tracks-helpers'
import { nationsBracketView } from './nations-bracket-view'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

assert(
  roundsForTrack(unl2026, 'championship').every((round) => ['qf', 'sf', 'third-place', 'final'].includes(round.id)),
  'championship rounds are isolated',
)
assert(
  roundsForTrack(unl2026, 'promotion').every((round) => ['ab-playoff', 'bc-playoff'].includes(round.id)),
  'promotion/relegation rounds are isolated',
)

const pending = unl2026.knockoutTracks![0].pendingStages![0]
const pendingHtml = renderToStaticMarkup(<PendingStageCard stage={pending} />)
assert(pendingHtml.includes('Draw pending'), 'pending stages state that the draw is pending')
assert(pendingHtml.includes('25–30 Mar 2027'), 'pending stages show their match window')
assert(pendingHtml.includes('League A group winners'), 'pending stages show qualification pools')
assert(!pendingHtml.includes(' vs '), 'pending stages invent no pairing')

const noop = () => {}
const progress: Progress = {
  marks: {}, revealed: new Set(), pins: new Set(), pinOrder: [], allPinOrder: [], favorites: [],
  favAuto: true, spotlight: false, setMark: noop, unmark: noop, reveal: noop,
  togglePin: noop, setPinOrder: noop, reorderAllPins: noop, removePins: noop,
  forTournament: () => progress, toggleFavorite: noop, setFavorites: noop,
  setFavAuto: noop, setSpotlight: noop, catchUp: noop, reset: noop,
}
const shell = renderToStaticMarkup(<KnockoutTracks t={unl2026} progress={progress} onOpen={noop} />)
assert(shell.includes('>Championship</button>'), 'championship track tab renders')
assert(shell.includes('>Promotion / relegation</button>'), 'promotion/relegation track tab renders')
assert(shell.includes('Quarter-finals'), 'the selected championship renders its pending stages')
assert(!shell.includes('League A/B play-offs'), 'the unselected track stays isolated')
assert(shell.includes('nations-pending-bracket'), 'the championship shows its bracket before the draw')
assert((shell.match(/data-empty-slot=/g) ?? []).length === 12, 'the empty bracket has eight leg and four later-stage placeholders')
assert(!shell.includes('pending-stage-grid'), 'the championship bracket replaces disconnected pending-stage cards')
assert((shell.match(/<button/g) ?? []).length === 2, 'empty bracket positions are not interactive match buttons')

const emptyView = nationsBracketView(unl2026)
assert(emptyView.quarterFinals.length === 4 && emptyView.quarterFinals.every((tie) => tie === null), 'the undrawn championship has four empty QF tie positions')
assert(emptyView.semiFinals.length === 2 && emptyView.semiFinals.every((match) => match === null), 'the undrawn championship has two empty semi-final positions')
assert(emptyView.final === null && emptyView.thirdPlace === null && !emptyView.pathsKnown, 'the undrawn final and third-place positions are empty and paths remain unassigned')

const ties: Tie[] = Array.from({ length: 4 }, (_, index) => ({
  id: `qf-tie-${index}`,
  legs: [`qf-${index}-1`, `qf-${index}-2`],
}))
const qfMatches: KnockoutMatch[] = ties.flatMap((tie, index) => ([1, 2] as const).map((leg) => ({
  id: tie.legs[leg - 1],
  tie: { id: tie.id, leg },
  date: leg === 1 ? '2027-03-25' : '2027-03-30',
  kickoff: leg === 1 ? '2027-03-25T18:45Z' : '2027-03-30T18:45Z',
  home: { type: 'group-rank' as const, group: `A${index + 1}`, rank: 1 },
  away: { type: 'group-rank' as const, group: `A${index + 1}`, rank: 2 },
})))
const sfMatches: KnockoutMatch[] = [0, 1].map((index) => ({
  id: `sf-${index}`,
  date: '2027-06-09',
  kickoff: '2027-06-09T18:45Z',
  home: { type: 'match-winner', match: ties[index * 2].id },
  away: { type: 'match-winner', match: ties[index * 2 + 1].id },
}))
const championship: Tournament = {
  ...unl2026,
  ties,
  knockoutRounds: [
    { id: 'qf', name: 'Quarter-finals', matches: qfMatches },
    { id: 'sf', name: 'Semi-finals', matches: sfMatches },
    { id: 'third-place', name: 'Third-place match', matches: [{
      id: 'third-place', date: '2027-06-13', kickoff: '2027-06-13T15:00Z',
      home: { type: 'match-loser', match: sfMatches[0].id },
      away: { type: 'match-loser', match: sfMatches[1].id },
    }] },
    { id: 'final', name: 'Final', matches: [{
      id: 'final', date: '2027-06-13', kickoff: '2027-06-13T19:00Z',
      home: { type: 'match-winner', match: sfMatches[0].id },
      away: { type: 'match-winner', match: sfMatches[1].id },
    }] },
  ],
  knockoutTracks: unl2026.knockoutTracks?.map((track) => ({ ...track, pendingStages: [] })),
}
const qfOnly: Tournament = { ...championship, knockoutRounds: championship.knockoutRounds.slice(0, 1) }
const qfOnlyView = nationsBracketView(qfOnly)
assert(qfOnlyView.quarterFinals.every((tie) => tie?.legs.length === 2), 'a published QF draw fills all four tie positions with both legs')
assert(!qfOnlyView.pathsKnown, 'QF ties alone do not invent semi-final pairings')
const qfOnlyHtml = renderToStaticMarkup(<KnockoutTracks t={qfOnly} progress={progress} onOpen={noop} />)
assert(qfOnlyHtml.includes('nations-pending-bracket') && qfOnlyHtml.includes('Semi-final draw pending'), 'QF-only view keeps unknown paths visibly unassigned')
assert((qfOnlyHtml.match(/class="ko-card /g) ?? []).length === 8, 'QF-only view uses eight real leg cards')
const redrawnSemis: KnockoutMatch[] = [
  { ...sfMatches[0], home: { type: 'match-winner', match: ties[2].id }, away: { type: 'match-winner', match: ties[0].id } },
  { ...sfMatches[1], home: { type: 'match-winner', match: ties[3].id }, away: { type: 'match-winner', match: ties[1].id } },
]
const withSemiDraw: Tournament = {
  ...qfOnly,
  knockoutRounds: [qfOnly.knockoutRounds[0], { id: 'sf', name: 'Semi-finals', matches: redrawnSemis }],
}
const semiDrawView = nationsBracketView(withSemiDraw)
assert(semiDrawView.pathsKnown, 'published semi-final refs resolve the QF paths')
assert(semiDrawView.quarterFinals.map((tie) => tie?.tie.id).join(',') === 'qf-tie-2,qf-tie-0,qf-tie-3,qf-tie-1', 'QF ties follow the actual semi-final draw order')
const semiDrawHtml = renderToStaticMarkup(<KnockoutTracks t={withSemiDraw} progress={progress} onOpen={noop} />)
assert(semiDrawHtml.includes('data-pairings="known"'), 'a published semi-final draw connects the real QF paths')
assert(semiDrawHtml.indexOf('data-tie-id="qf-tie-2"') < semiDrawHtml.indexOf('data-tie-id="qf-tie-0"'), 'published tie positions follow the semi-final draw')
const connected = renderToStaticMarkup(<KnockoutTracks t={championship} progress={progress} onOpen={noop} />)
assert(!connected.includes('nations-pending-bracket'), 'a complete championship keeps the full connected bracket')
assert(!connected.includes('bracket-simple'), 'two-leg quarter-finals render as a connected championship bracket')
assert(connected.includes('b-col side-left') && connected.includes('b-col side-right'), 'the championship has World Cup-style halves')
assert((connected.match(/class="ko-card /g) ?? []).length === 12, 'all eight quarter-final legs and later matches remain visible')
assert((connected.match(/class="b-tie-legs"/g) ?? []).length === 4, 'each quarter-final tie is one bracket node containing both legs')
assert((connected.match(/class="b-pair /g) ?? []).length === 2, 'two quarter-final ties connect to each semi-final')
const withMarks = (marks: Progress['marks']) => renderToStaticMarkup(
  <KnockoutTracks t={championship} progress={{ ...progress, marks }} onOpen={noop} />,
)
const incomingFlows = (html: string) => (html.match(/class="b-slot[^"]* flow-in"/g) ?? []).length
assert(incomingFlows(withMarks({ 'qf-0-1': 'watched' })) === 0, 'one marked leg cannot light the semi-final feeder')
assert(incomingFlows(withMarks({ 'qf-0-1': 'watched', 'qf-0-2': 'watched' })) === 1, 'both marked legs can light the semi-final feeder')

console.log('KNOCKOUT TRACK TESTS PASS')
