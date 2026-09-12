/**
 * Smoke tests for the club results ingest — ESPN parsing and tie derivation.
 *
 *   npx tsx scripts/espn-club.smoke.ts
 *
 * Fixtures are trimmed copies of real ESPN payloads, so the shapes here are the
 * ones the feed actually sends: `competition.leg` as `{ value }`, the shootout
 * arriving as extra 120' goal entries, and `competition.series` carrying the
 * aggregate under ESPN's own numeric team ids.
 */
import {
  CLUB_COMPETITIONS,
  assignMatchdays,
  assignTieIds,
  buildSeason,
  buildTie,
  pairKey,
  parseClubEvent,
  roundIdForEvent,
  serializeSeason,
} from './espn-club'
import * as espnClub from './espn-club'
import type { ClubEspnEvent, ClubEvent, EspnCalendarEntry } from './espn-club'
import type { TeamId, Tournament } from '../src/data/types'
import { eng1_2026 } from '../src/data/club/eng1-2026'
import { ucl_2026 } from '../src/data/club/ucl-2026'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const ucl = CLUB_COMPETITIONS.ucl

assert(
  'validateIngestSnapshot' in espnClub,
  'the ingest exposes a completeness gate before generated data can be written',
)

// ESPN numeric ids for the clubs used below, from src/data/club/clubs.ts.
const ESPN = {
  arsenal: '359',
  psv: '148',
  realMadrid: '86',
  manCity: '382',
  napoli: '114',
} as const

interface CompetitorInput {
  espnId: string
  name: string
  homeAway: 'home' | 'away'
  score: string
  shootoutScore?: number
}

function event(opts: {
  id: string
  date: string
  completed: boolean
  detail?: string
  competitors: [CompetitorInput, CompetitorInput]
  goals?: { espnId: string; name: string; clock: string; player: string }[]
  leg?: number
  series?: ClubEspnEvent['competitions'][number]['series']
}): ClubEspnEvent {
  const competition: ClubEspnEvent['competitions'][number] = {
    competitors: opts.competitors.map((c) => ({
      homeAway: c.homeAway,
      score: c.score,
      ...(c.shootoutScore === undefined ? {} : { shootoutScore: c.shootoutScore }),
      team: { id: c.espnId, displayName: c.name },
    })),
    status: {
      type: { completed: opts.completed, detail: opts.detail ?? (opts.completed ? 'FT' : 'Scheduled') },
    },
    details: (opts.goals ?? []).map((g) => ({
      scoringPlay: true,
      clock: { displayValue: g.clock },
      team: { id: g.espnId },
      athletesInvolved: [{ displayName: g.player }],
      type: { text: 'Goal' },
    })),
  } as ClubEspnEvent['competitions'][number]
  if (opts.leg !== undefined) competition.leg = { value: opts.leg }
  if (opts.series) competition.series = opts.series
  return { id: opts.id, date: opts.date, competitions: [competition] } as ClubEspnEvent
}

// ---- parsing ---------------------------------------------------------------

const leaguePhase = parseClubEvent(
  event({
    id: '700001',
    date: '2026-09-16T19:00Z',
    completed: true,
    competitors: [
      { espnId: ESPN.arsenal, name: 'Arsenal', homeAway: 'home', score: '2' },
      { espnId: ESPN.napoli, name: 'Napoli', homeAway: 'away', score: '1' },
    ],
    goals: [
      { espnId: ESPN.arsenal, name: 'Arsenal', clock: "12'", player: 'Bukayo Saka' },
      { espnId: ESPN.napoli, name: 'Napoli', clock: "58'", player: 'Scott McTominay' },
      { espnId: ESPN.arsenal, name: 'Arsenal', clock: "77'", player: 'Kai Havertz' },
    ],
  }),
)
assert(leaguePhase.status === 'ok', 'a league-phase event parses')
if (leaguePhase.status !== 'ok') throw new Error('unreachable')
assert(leaguePhase.event.homeTeam === 'arsenal', 'clubs resolve from ESPN numeric ids, not display names')
assert(leaguePhase.event.awayTeam === 'napoli', 'away club resolves from its ESPN id')
assert(
  leaguePhase.event.score?.home === 2 && leaguePhase.event.score.away === 1,
  'the score comes through parseEvent() unchanged',
)
assert(leaguePhase.event.goals?.length === 3, 'goals come through parseEvent() unchanged')
assert(leaguePhase.event.date === '2026-09-16', 'the fixture date is the UTC date of kickoff')
assert(leaguePhase.event.leg === undefined, 'a league-phase event carries no leg')

const unknownClub = parseClubEvent(
  event({
    id: '700002',
    date: '2026-09-16T19:00Z',
    completed: true,
    competitors: [
      { espnId: ESPN.arsenal, name: 'Arsenal', homeAway: 'home', score: '1' },
      { espnId: '999999', name: 'Some New Club', homeAway: 'away', score: '0' },
    ],
  }),
)
assert(unknownClub.status === 'unknown-club', 'an unregistered ESPN club id is reported, never guessed at')
assert(
  unknownClub.status === 'unknown-club' && unknownClub.espnIds.some((s) => s.includes('999999')),
  'the unknown club report names the ESPN id to add',
)

// A shootout: leg 2 finishes 0-2 (aggregate level at 2-2) and the kicks arrive
// as extra 120' entries, which parseEvent() must not count as goals.
const shootout = parseClubEvent(
  event({
    id: '700004',
    date: '2027-03-17T20:00Z',
    completed: true,
    detail: 'FT (Pens)',
    leg: 2,
    competitors: [
      { espnId: ESPN.psv, name: 'PSV Eindhoven', homeAway: 'home', score: '0', shootoutScore: 4 },
      { espnId: ESPN.arsenal, name: 'Arsenal', homeAway: 'away', score: '2', shootoutScore: 5 },
    ],
    goals: [
      { espnId: ESPN.arsenal, name: 'Arsenal', clock: "33'", player: 'Bukayo Saka' },
      { espnId: ESPN.arsenal, name: 'Arsenal', clock: "71'", player: 'Kai Havertz' },
      { espnId: ESPN.psv, name: 'PSV Eindhoven', clock: "120'", player: 'Penalty Taker' },
    ],
    series: {
      title: 'Round of 16',
      completed: true,
      totalCompetitions: 2,
      competitors: [
        { id: ESPN.arsenal, winner: true, aggregateScore: 2 },
        { id: ESPN.psv, aggregateScore: 2 },
      ],
    },
  }),
)
assert(shootout.status === 'ok', 'a shootout leg parses')
if (shootout.status !== 'ok') throw new Error('unreachable')
assert(
  shootout.event.score?.home === 0 && shootout.event.score.away === 2,
  'the 90/120-minute score excludes the shootout kicks',
)
assert(
  shootout.event.penalties?.home === 4 && shootout.event.penalties.away === 5,
  'the shootout is read from shootoutScore',
)
assert(shootout.event.leg === 2, 'competition.leg.value becomes the leg number')
assert(shootout.event.series?.completed === true, 'series completion comes through')
assert(
  shootout.event.series?.aggregate?.arsenal === 2 && shootout.event.series?.aggregate?.psv === 2,
  'the aggregate is re-keyed from ESPN ids to our club ids',
)
assert(shootout.event.series?.winner === 'arsenal', 'the series winner is re-keyed too')

// ---- round bucketing -------------------------------------------------------

const calendar: EspnCalendarEntry[] = [
  { label: 'League Phase', startDate: '2026-09-01T00:00Z', endDate: '2027-01-31T00:00Z' },
  { label: 'Rd of 16', startDate: '2027-03-01T00:00Z', endDate: '2027-03-20T00:00Z' },
  { label: 'Final', startDate: '2027-05-25T00:00Z', endDate: '2027-06-02T00:00Z' },
]
const leagueEvent = leaguePhase.event
assert(
  roundIdForEvent(ucl, leagueEvent, calendar).status === 'league',
  'a September fixture buckets into the league phase',
)
const r16 = roundIdForEvent(ucl, shootout.event, calendar)
assert(r16.status === 'knockout' && r16.roundId === 'r16', 'a March fixture buckets into the round of 16')

// The single-leg final carries neither leg nor series, so only the calendar can
// place it — which is why the calendar is the primary signal.
const finalEvent: ClubEvent = { ...leagueEvent, espnEventId: '700009', kickoff: '2027-05-29T19:00Z' }
const finalRound = roundIdForEvent(ucl, finalEvent, calendar)
assert(
  finalRound.status === 'knockout' && finalRound.roundId === 'final',
  'the single-leg final is placed by the calendar alone',
)
assert(
  roundIdForEvent(ucl, { ...leagueEvent, kickoff: '2027-02-14T19:00Z' }, calendar).status === 'unknown',
  'an event matching no label is reported unknown rather than guessed into a round',
)
assert(
  roundIdForEvent(CLUB_COMPETITIONS.eng1, leagueEvent, []).status === 'league',
  'a competition with no knockout rounds is always league phase',
)

// ---- matchdays -------------------------------------------------------------

const matchdays = assignMatchdays([
  { id: 'a', kickoff: '2026-08-15T14:00Z', home: 'arsenal', away: 'chelsea' },
  { id: 'b', kickoff: '2026-08-15T16:30Z', home: 'liverpool', away: 'everton' },
  { id: 'c', kickoff: '2026-08-22T14:00Z', home: 'chelsea', away: 'liverpool' },
  // Arsenal's matchday-2 game was postponed, so they arrive here with a game in
  // hand: this is Liverpool's third fixture but only Arsenal's second.
  { id: 'd', kickoff: '2026-08-29T14:00Z', home: 'liverpool', away: 'arsenal' },
])
assert(matchdays.get('a') === 1 && matchdays.get('b') === 1, 'the opening weekend is matchday 1')
assert(matchdays.get('c') === 2, "each club's second fixture is matchday 2")
assert(matchdays.get('d') === 3, 'a fixture takes the later of the two clubs\' counts, so a game in hand does not pull it back')

// ---- tie derivation --------------------------------------------------------

const leg1: ClubEvent = {
  espnEventId: '700003',
  homeTeam: 'arsenal',
  awayTeam: 'psv',
  kickoff: '2027-03-10T20:00Z',
  date: '2027-03-10',
  completed: true,
  afterExtraTime: false,
  score: { home: 2, away: 0 },
  leg: 1,
  series: { title: 'Round of 16', completed: false },
}
const leg2: ClubEvent = shootout.event

const tie = buildTie('ucl-r16-1', [leg2, leg1])
assert(tie !== null, 'a two-leg tie is derived from its two events')
if (!tie) throw new Error('unreachable')
assert(tie.legs[0].id === 'ucl-r16-1-l1' && tie.legs[1].id === 'ucl-r16-1-l2', 'leg ids follow the tie id')
assert(
  tie.legs[0].tie?.leg === 1 && tie.legs[1].tie?.leg === 2,
  'legs are ordered by leg number, not by the order they arrived',
)
assert(tie.tie.homeTeam === 'arsenal', 'the tie is oriented to leg 1: home is leg 1 home')
assert(
  tie.tie.aggregate?.home === 2 && tie.tie.aggregate.away === 2,
  "the aggregate is written in the tie's own orientation",
)
assert(
  tie.tie.penalties?.home === 5 && tie.tie.penalties.away === 4,
  "the shootout is flipped into the tie's orientation (leg 2 reversed the venue)",
)
assert(tie.tie.winner === 'arsenal', 'the winner comes from the series, not from our own arithmetic')
assert(
  tie.legs.every((m) => m.penalties === undefined),
  'no leg carries a shootout — a shootout on a non-level scoreline is neither true nor checkable',
)
assert(tie.legs[1].score?.home === 0 && tie.legs[1].score.away === 2, "each leg keeps its own 90' score")

const undecided = buildTie('ucl-r16-2', [
  leg1,
  { ...leg2, series: { title: 'Round of 16', completed: false }, penalties: undefined },
])
assert(undecided !== null, 'an undecided tie still derives')
assert(
  undecided?.tie.aggregate === undefined && undecided?.tie.winner === undefined,
  'no aggregate or winner until ESPN marks the series complete — a half-derived result is a spoiler',
)
assert(buildTie('ucl-r16-3', [leg1]) === null, 'a half-arrived tie is not built from one leg')

const partialTieTeams: TeamId[] = ['arsenal', 'napoli', 'psv', 'real-madrid']
const partialTieRanks = () => new Map<TeamId, number>([
  ['arsenal', 1],
  ['napoli', 2],
  ['psv', 9],
  ['real-madrid', 10],
])
const partialTieSeason = buildSeason({
  config: ucl,
  year: 2026,
  events: [leagueEvent, leg1],
  calendar,
  tableTeams: partialTieTeams,
  ranks: partialTieRanks(),
  previousTieIds: new Map(),
}) as ReturnType<typeof buildSeason> & { notices?: string[] }
assert(
  partialTieSeason.audit.length === 0 && partialTieSeason.notices?.length === 1,
  'a newly published first leg is held as a nonfatal notice so other UCL updates can continue',
)

const regressedTieSeason = buildSeason({
  config: ucl,
  year: 2026,
  events: [leagueEvent, leg1],
  calendar,
  tableTeams: partialTieTeams,
  ranks: partialTieRanks(),
  previousTieIds: new Map([[`r16|${pairKey('arsenal', 'psv')}`, 'ucl-r16-1']]),
})
assert(
  regressedTieSeason.audit.some((line) => line.includes('previously complete tie')),
  'a missing leg from a previously complete tie remains a fatal regression',
)

// ---- tie id stability ------------------------------------------------------

const arsPsv = pairKey('arsenal', 'psv')
const rmaMci = pairKey('real-madrid', 'manchester-city')
const firstRun = assignTieIds(
  'ucl',
  'r16',
  [{ key: rmaMci, kickoff: '2027-03-10T20:00Z' }],
  new Map(),
)
assert(firstRun.get(rmaMci) === 'ucl-r16-1', 'the first tie seen takes the first number')

// The Arsenal tie is played earlier but reaches the feed later. Renumbering
// would move the already-published tie and orphan its videos and progress.
const secondRun = assignTieIds(
  'ucl',
  'r16',
  [
    { key: arsPsv, kickoff: '2027-03-09T20:00Z' },
    { key: rmaMci, kickoff: '2027-03-10T20:00Z' },
  ],
  new Map([[`r16|${rmaMci}`, 'ucl-r16-1']]),
)
assert(secondRun.get(rmaMci) === 'ucl-r16-1', 'a tie already published keeps its id')
assert(secondRun.get(arsPsv) === 'ucl-r16-2', 'a newly seen tie takes the lowest free number')

// ---- season assembly -------------------------------------------------------

const teams: TeamId[] = ['arsenal', 'napoli', 'psv', 'real-madrid']
const season = buildSeason({
  config: ucl,
  year: 2026,
  events: [leagueEvent, leg1, leg2],
  calendar,
  tableTeams: teams,
  ranks: new Map<TeamId, number>([
    ['arsenal', 1],
    ['napoli', 2],
    ['psv', 9],
    ['real-madrid', 10],
  ]),
  previousTieIds: new Map(),
})
assert(season.tournament.groups.length === 1, 'the UCL is one league phase, not eight groups')
assert(season.tournament.groupMatches.length === 1, 'league-phase events become group matches')
assert(season.tournament.ties?.length === 1, 'the knockout events derive exactly one tie')
assert(
  season.tournament.knockoutRounds.find((r) => r.id === 'r16')?.matches.length === 2,
  'both legs are kept as separate matches so each lands on its own day',
)
assert(season.audit.length === 0, 'a clean season produces no audit warnings')

const r16Legs = season.tournament.knockoutRounds.find((r) => r.id === 'r16')!.matches
assert(
  r16Legs.every((m) => m.home.type !== 'match-winner' || m.home.match !== ''),
  'every leg slot ref is resolved before serialization',
)

const source = serializeSeason(season.tournament, ucl, 2026)
assert(source.startsWith('// Generated — do not hand-edit'), 'generated season files carry the do-not-edit header')
assert(source.includes('withClubVideos(base, ucl_2026_videos)'), 'the season folds in the curator-owned videos file')
assert(source.includes("tableLabel: \"League phase\""), 'the UCL table is labelled as a league phase')
assert(
  !serializeSeason(season.tournament, ucl, 2026).includes('durationSeconds'),
  'a generated season never emits a video runtime',
)

const laLiga = CLUB_COMPETITIONS.esp1
assert(
  laLiga.tiebreakers?.[0] === 'head-to-head',
  'La Liga settles level teams head-to-head before goal difference',
)
assert(
  CLUB_COMPETITIONS.eng1.tiebreakers === undefined,
  'the Premier League uses the default chain, so the World Cup default is untouched',
)

// ---- whole-season publish gate --------------------------------------------

if (!('validateIngestSnapshot' in espnClub)) throw new Error('unreachable')
const validateIngestSnapshot = espnClub.validateIngestSnapshot
const completePremierLeague = {
  rawEventCount: 380,
  tableTeamCount: 20,
  tournament: eng1_2026,
  problems: [],
}
assert(
  validateIngestSnapshot(CLUB_COMPETITIONS.eng1, completePremierLeague).length === 0,
  'a complete Premier League snapshot clears the publish gate',
)
assert(
  validateIngestSnapshot(CLUB_COMPETITIONS.eng1, {
    ...completePremierLeague,
    rawEventCount: 0,
  }).some((problem) => problem.includes('no events')),
  'a 200 response with no events cannot replace the season',
)
assert(
  validateIngestSnapshot(CLUB_COMPETITIONS.eng1, {
    ...completePremierLeague,
    tableTeamCount: 0,
  }).some((problem) => problem.includes('standings')),
  'an empty or wrong-season standings response cannot replace the team table',
)
assert(
  validateIngestSnapshot(CLUB_COMPETITIONS.eng1, {
    ...completePremierLeague,
    tournament: { ...eng1_2026, groupMatches: eng1_2026.groupMatches.slice(0, 379) },
  }).some((problem) => problem.includes('380 league matches')),
  'a partial league schedule cannot replace a complete generated season',
)
assert(
  validateIngestSnapshot(CLUB_COMPETITIONS.eng1, {
    ...completePremierLeague,
    problems: ['club 999999 is unknown'],
  }).some((problem) => problem.includes('club 999999 is unknown')),
  'unknown clubs and dropped fixtures make the regeneration fail closed',
)

const previousUcl: Tournament = {
  ...ucl_2026,
  knockoutRounds: [
    ...season.tournament.knockoutRounds,
    {
      id: 'final',
      name: 'Final',
      matches: [
        {
          id: 'ucl-final',
          date: '2027-05-29',
          kickoff: '2027-05-29T19:00Z',
          home: { type: 'match-winner', match: 'ucl-sf-1' },
          away: { type: 'match-winner', match: 'ucl-sf-2' },
        },
      ],
    },
  ],
  ties: season.tournament.ties,
}
const vanishedKnockoutSnapshot = {
  rawEventCount: 144,
  tableTeamCount: 36,
  tournament: ucl_2026,
  previousTournament: previousUcl,
  problems: [],
}
const vanishedProblems = validateIngestSnapshot(CLUB_COMPETITIONS.ucl, vanishedKnockoutSnapshot)
assert(
  vanishedProblems.some((problem) => problem.includes('previously published tie')),
  'omitting both legs of a previously published tie aborts the regeneration',
)
assert(
  vanishedProblems.some((problem) => problem.includes('previously published knockout match')),
  'omitting a previously published single-leg knockout match also aborts the regeneration',
)

console.log('ALL PASS')
