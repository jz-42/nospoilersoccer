/**
 * Smoke tests for the club highlight curator's accept/reject gate.
 *
 *   npx tsx scripts/curate-club-videos.smoke.ts
 *
 * The gate is the only thing standing between a broadcaster's upload and a
 * user's match card, and there is no AI review behind it, so every branch is
 * pinned here — especially the ones that must fail closed. The titles are real
 * uploads from the three sources.
 */
import { CLUB_COMPETITIONS } from './espn-club'
import {
  CLUB_VIDEO_SOURCES,
  acceptCandidate,
  clubNameFromTail,
  screenTitle,
  serializeVideoMap,
  sourcesForCompetition,
  uploadsPlaylistOf,
} from './curate-club-videos'
import type { CandidateInput } from './curate-club-videos'
import type { HighlightVideo, Tournament } from '../src/data/types'
import { clubs } from '../src/data/club/clubs'
import { withClubVideos } from '../src/data/club/with-videos'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const ucl = CLUB_COMPETITIONS.ucl
const golazo = CLUB_VIDEO_SOURCES.golazo
const nbc = CLUB_VIDEO_SOURCES.nbc
const espnfc = CLUB_VIDEO_SOURCES.espnfc
const teamIds = ['arsenal', 'psv', 'napoli', 'inter', 'real-madrid', 'manchester-city'] as const

const tournament: Tournament = {
  id: 'ucl-2026',
  name: 'Champions League',
  year: 2026,
  advancingRanks: [1, 2],
  tableLabel: 'League phase',
  teams: Object.fromEntries(teamIds.map((id) => [id, clubs[id]] as const)),
  groups: [{ id: 'league', teams: [...teamIds] }],
  groupMatches: [
    {
      id: 'ucl-arsenal-napoli',
      group: 'league',
      matchday: 1,
      date: '2026-09-16',
      kickoff: '2026-09-16T19:00Z',
      home: 'arsenal',
      away: 'napoli',
      score: { home: 2, away: 1 },
    },
    {
      id: 'ucl-inter-napoli',
      group: 'league',
      matchday: 2,
      date: '2026-10-01',
      kickoff: '2026-10-01T19:00Z',
      home: 'inter',
      away: 'napoli',
      score: { home: 1, away: 1 },
    },
    {
      id: 'ucl-psv-arsenal',
      group: 'league',
      matchday: 3,
      date: '2026-10-22',
      kickoff: '2026-10-22T19:00Z',
      home: 'psv',
      away: 'arsenal',
      // Unplayed on purpose.
    },
  ],
  knockoutRounds: [
    {
      id: 'r16',
      name: 'Round of 16',
      matches: [
        {
          id: 'ucl-r16-1-l1',
          tie: { id: 'ucl-r16-1', leg: 1 },
          date: '2027-03-10',
          kickoff: '2027-03-10T20:00Z',
          home: { type: 'group-rank', group: 'league', rank: 1 },
          away: { type: 'group-rank', group: 'league', rank: 2 },
          homeTeam: 'real-madrid',
          awayTeam: 'manchester-city',
          score: { home: 2, away: 0 },
        },
        {
          id: 'ucl-r16-1-l2',
          tie: { id: 'ucl-r16-1', leg: 2 },
          date: '2027-03-17',
          kickoff: '2027-03-17T20:00Z',
          home: { type: 'group-rank', group: 'league', rank: 2 },
          away: { type: 'group-rank', group: 'league', rank: 1 },
          homeTeam: 'manchester-city',
          awayTeam: 'real-madrid',
          score: { home: 1, away: 1 },
        },
      ],
    },
  ],
  ties: [
    {
      id: 'ucl-r16-1',
      legs: ['ucl-r16-1-l1', 'ucl-r16-1-l2'],
      homeTeam: 'real-madrid',
      awayTeam: 'manchester-city',
      aggregate: { home: 3, away: 1 },
      winner: 'real-madrid',
    },
  ],
}

const base: Omit<CandidateInput, 'title' | 'id'> = {
  config: ucl,
  source: golazo,
  tournament,
  channelId: golazo.channelId,
  publishedAt: '2026-09-16T23:30:00Z',
  embeddable: 'yes',
  existing: {},
}
const gate = (title: string, over: Partial<CandidateInput> = {}) =>
  acceptCandidate({ ...base, id: 'vid00000001', title, ...over })

const LEAGUE_TITLE = 'Arsenal vs. Napoli: Extended Highlights | UCL on CBS Sports'

// ---- the happy path --------------------------------------------------------

const accepted = gate(LEAGUE_TITLE)
assert(accepted.status === 'accept', 'a clean Golazo cut for a finished fixture is accepted')
assert(
  accepted.status === 'accept' && accepted.matchId === 'ucl-arsenal-napoli',
  'it lands on the fixture its title names',
)
assert(
  accepted.status === 'accept' && accepted.video.kind === 'normal',
  "club cuts are always kind 'normal' — no extended/quick split",
)
assert(
  accepted.status === 'accept' && accepted.video.durationSeconds === undefined,
  'NO DURATION: a club cut must never carry durationSeconds, or a runtime badge reappears',
)
assert(
  accepted.status === 'accept' && !('source' in accepted.video && accepted.video.source === 'fox'),
  'club cuts are YouTube',
)

// ---- 1. channel ------------------------------------------------------------

assert(
  gate(LEAGUE_TITLE, { channelId: 'UCwNqHDsnBCKT-olwJwIFyfg' }).status === 'skip',
  'a lookalike upload from another channel is rejected',
)
assert(gate(LEAGUE_TITLE, { channelId: null }).status === 'skip', 'an unreadable channel is rejected')

// ---- 2. title pattern ------------------------------------------------------

const nonHighlights = [
  'Mbappé Makes Micah’s Dream Come True 😂 | UCL Today BEST BITS',
  'Thierry Henry REACTS To Arsenal Reaching The Champions League Final 🤩 | UCL Today',
  'Who will reach the Champions League Final? | PSG vs Bayern & Arsenal vs Atletico preview | UCL Today',
  'Arsenal v PSG UCL Final Preview w/ Thierry Henry & UCL Today Crew! 👀',
]
for (const title of nonHighlights) {
  assert(gate(title).status === 'ignore', `not a highlight upload, dropped before any fetch: ${title.slice(0, 40)}…`)
}
assert(
  screenTitle(ucl, golazo, nonHighlights[0]).status === 'ignore',
  'screenTitle decides that from the title alone, so talk shows cost no network calls',
)
assert(
  gate('Arsenal vs. Napoli: Extended Highlights 2-1 | UCL on CBS Sports').status === 'skip',
  'a title carrying a scoreline is refused outright',
)

// ---- 3. clubs resolve, and to this competition -----------------------------

assert(
  gate('Arsenal vs. Some New Club: Extended Highlights | UCL on CBS Sports').status === 'skip',
  'an unrecognised club name is never guessed at',
)
assert(
  gate('Barcelona vs. Borussia Dortmund: Extended Highlights | UCL Round Of 16 Leg 1 | CBS Sports Golazo')
    .status === 'ignore',
  "registered clubs that aren't in this season's field are not our video",
)
// Two Champions League clubs meeting in Serie A: the pair resolves, so only the
// competition tag stops a domestic cut landing on a European fixture.
assert(
  gate('Inter vs. Napoli: Extended Highlights | Serie A | CBS Sports Golazo').status === 'ignore',
  'a Serie A cut between two UCL clubs is not mistaken for a UCL cut',
)
assert(
  gate('Inter vs. Napoli: Extended Highlights | Coppa Italia | CBS Sports Golazo').status === 'ignore',
  'nor is a domestic cup cut between the same two clubs',
)
assert(
  screenTitle(CLUB_COMPETITIONS.eng1, golazo, LEAGUE_TITLE).status === 'ignore',
  'a UCL cut is not offered to the Premier League',
)

// ---- 4. exactly one finished fixture still missing a cut -------------------

assert(
  gate('PSV vs. Arsenal: Extended Highlights | UCL on CBS Sports').status === 'skip',
  'a fixture that has not been played yet is held, not filled',
)
assert(
  gate(LEAGUE_TITLE, { existing: { 'ucl-arsenal-napoli': [{ youtubeId: 'already00001', kind: 'normal' }] } })
    .status === 'skip',
  'append-only: a match that already has a cut is never given a second one',
)
const withInlineVideo: Tournament = {
  ...tournament,
  groupMatches: tournament.groupMatches.map((m) =>
    m.id === 'ucl-arsenal-napoli' ? { ...m, videos: [{ youtubeId: 'inline000001', kind: 'normal' }] } : m,
  ),
}
assert(
  gate(LEAGUE_TITLE, { tournament: withInlineVideo }).status === 'skip',
  'a cut already inline on the fixture also counts as taken',
)
assert(
  gate('Real Madrid vs. Manchester City: Extended Highlights | UCL Round of 16 | CBS Sports Golazo', {
    publishedAt: '2027-03-18T00:00:00Z',
  }).status === 'skip',
  "a two-legged tie whose title doesn't say which leg is refused — leg 2 on leg 1's card is a spoiler",
)
const legOne = gate(
  'Real Madrid vs. Manchester City: Extended Highlights | UCL Round of 16 Leg 1 | CBS Sports Golazo',
  { publishedAt: '2027-03-10T23:30:00Z' },
)
assert(
  legOne.status === 'accept' && legOne.matchId === 'ucl-r16-1-l1',
  'a titled leg goes to that leg and no other',
)
const legTwo = gate(
  'Manchester City vs. Real Madrid: Extended Highlights | UCL Round of 16 Leg 2 | CBS Sports Golazo',
  { publishedAt: '2027-03-17T23:30:00Z' },
)
assert(
  legTwo.status === 'accept' && legTwo.matchId === 'ucl-r16-1-l2',
  'leg 2 goes to leg 2 even though the clubs are listed the other way round',
)
// "Round of 16" with no UCL tag is a weak signal — trusted only for that round.
const weakTag = gate(
  'Real Madrid vs. Manchester City: Extended Highlights | Round of 16 Leg 1 | CBS Sports Golazo',
  { publishedAt: '2027-03-10T23:30:00Z' },
)
assert(
  weakTag.status === 'accept' && weakTag.matchId === 'ucl-r16-1-l1',
  'a round label with no competition name is trusted for exactly that round',
)
assert(
  gate('Arsenal vs. Napoli: Extended Highlights | Round of 16 Leg 1 | CBS Sports Golazo').status === 'ignore',
  'and not for a league-phase fixture between the same two clubs',
)

// ---- 5. published after kickoff -------------------------------------------

assert(
  gate(LEAGUE_TITLE, { publishedAt: '2026-09-16T12:00:00Z' }).status === 'skip',
  'a video published before kickoff cannot be that match',
)
assert(gate(LEAGUE_TITLE, { publishedAt: null }).status === 'skip', 'no publish date, no decision')
assert(gate(LEAGUE_TITLE, { publishedAt: 'not a date' }).status === 'skip', 'an unreadable publish date is refused')

// ---- 6. embeddable ---------------------------------------------------------

assert(gate(LEAGUE_TITLE, { embeddable: 'no' }).status === 'skip', 'a non-embeddable video is rejected')
assert(
  gate(LEAGUE_TITLE, { embeddable: 'unknown' }).status === 'skip',
  'an embeddability check that did not complete fails closed, and comes back next cycle',
)

// ---- the source table ------------------------------------------------------

assert(
  sourcesForCompetition('ucl').length === 1 && sourcesForCompetition('ucl')[0].id === 'golazo',
  'the Champions League is sourced from CBS Sports Golazo',
)
assert(
  sourcesForCompetition('eng1')[0].id === 'nbc' && sourcesForCompetition('esp1')[0].id === 'espnfc',
  'the Premier League comes from NBC and La Liga from ESPN FC',
)
for (const id of ['ucl', 'eng1', 'esp1']) {
  assert(sourcesForCompetition(id).length > 0, `${id} has a highlight source at all`)
}
assert(
  uploadsPlaylistOf(nbc) === 'UUqZQlzSHbVJrwrn5XvzrzcA',
  "a source's uploads playlist is its channel id with UC→UU",
)
assert(
  new Set(Object.values(CLUB_VIDEO_SOURCES).map((x) => x.channelId)).size ===
    Object.values(CLUB_VIDEO_SOURCES).length,
  'no two sources share a channel id, so the channel gate stays unambiguous',
)

// ---- NBC Sports / Premier League -------------------------------------------

const pl: Tournament = {
  id: 'eng1-2026',
  name: 'Premier League',
  year: 2026,
  advancingRanks: [],
  tableLabel: 'Table',
  teams: Object.fromEntries(
    (['everton', 'manchester-united', 'arsenal', 'chelsea'] as const).map((id) => [id, clubs[id]]),
  ),
  groups: [{ id: 'league', teams: ['everton', 'manchester-united', 'arsenal', 'chelsea'] }],
  groupMatches: [
    {
      id: 'eng1-everton-manutd',
      group: 'league',
      matchday: 3,
      date: '2026-09-06',
      kickoff: '2026-09-06T13:00Z',
      home: 'everton',
      away: 'manchester-united',
      score: { home: 2, away: 2 },
    },
    {
      // The reverse fixture, also played and also without a cut: the pair alone
      // cannot choose between the two, so only the date in the title can.
      id: 'eng1-manutd-everton',
      group: 'league',
      matchday: 22,
      date: '2027-01-16',
      kickoff: '2027-01-16T15:00Z',
      home: 'manchester-united',
      away: 'everton',
      score: { home: 1, away: 0 },
    },
  ],
  knockoutRounds: [],
}

const nbcBase: Omit<CandidateInput, 'title' | 'id'> = {
  config: CLUB_COMPETITIONS.eng1,
  source: nbc,
  tournament: pl,
  channelId: nbc.channelId,
  publishedAt: '2026-09-06T20:00:00Z',
  embeddable: 'yes',
  existing: {},
}
const nbcGate = (title: string, over: Partial<CandidateInput> = {}) =>
  acceptCandidate({ ...nbcBase, id: 'nbcvid00001', title, ...over })

const NBC_TITLE =
  'Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | 9/6/2026 | NBC Sports'

const nbcAccepted = nbcGate(NBC_TITLE)
assert(nbcAccepted.status === 'accept', "NBC's Premier League template is accepted")
assert(
  nbcAccepted.status === 'accept' && nbcAccepted.matchId === 'eng1-everton-manutd',
  'and the date in the title picks the right half of the home-and-away pair',
)
assert(
  nbcAccepted.status === 'accept' && nbcAccepted.video.durationSeconds === undefined,
  'NO DURATION, on this source either',
)
const reverse = nbcGate(
  'Manchester United v. Everton | PREMIER LEAGUE HIGHLIGHTS | 1/16/2027 | NBC Sports',
  { publishedAt: '2027-01-16T20:00:00Z' },
)
assert(
  reverse.status === 'accept' && reverse.matchId === 'eng1-manutd-everton',
  'the return fixture goes to the return fixture, months later',
)
assert(
  nbcGate('Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | NBC Sports', {
    publishedAt: '2027-02-01T20:00:00Z',
  }).status === 'skip',
  'an undated title, once both halves of the pair have been played, is refused rather than guessed',
)
assert(
  nbcGate('Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | NBC Sports', {
    publishedAt: '2027-02-01T20:00:00Z',
    existing: {
      'eng1-everton-manutd': [{ youtubeId: 'alreadyhave1', kind: 'normal' }],
    },
  }).status === 'skip',
  'an existing cut cannot make an otherwise ambiguous undated re-upload look like the return fixture',
)
assert(
  nbcGate('Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | 4/4/2027 | NBC Sports', {
    publishedAt: '2027-04-04T20:00:00Z',
  }).status === 'ignore',
  'a date matching no fixture between them is not quietly ignored into the nearest one',
)
for (const title of [
  'Chiefs v. Bills | NFL HIGHLIGHTS | 9/6/2026 | NBC Sports',
  'Gotham FC v. Portland Thorns | NWSL HIGHLIGHTS | 9/6/2026 | NBC Sports',
  'Arsenal v. Chelsea | FA CUP HIGHLIGHTS | 9/6/2026 | NBC Sports',
  'Premier League Weekend Roundup | NBC Sports',
]) {
  assert(
    nbcGate(title).status === 'ignore',
    `NBC's other sports never reach the Premier League: ${title.slice(0, 34)}…`,
  )
}
assert(
  nbcGate(NBC_TITLE, { channelId: golazo.channelId }).status === 'skip',
  'an NBC-shaped title from another channel is rejected',
)
assert(
  screenTitle(CLUB_COMPETITIONS.esp1, nbc, NBC_TITLE).status === 'ignore',
  'NBC is not trusted for La Liga at all — the source table is a gate',
)

// ---- ESPN FC / La Liga -----------------------------------------------------

const laliga: Tournament = {
  id: 'esp1-2026',
  name: 'La Liga',
  year: 2026,
  advancingRanks: [],
  tableLabel: 'Table',
  teams: Object.fromEntries(
    (['getafe', 'alaves', 'espanyol', 'barcelona', 'malaga', 'atletico-madrid'] as const).map(
      (id) => [id, clubs[id]],
    ),
  ),
  groups: [
    { id: 'league', teams: ['getafe', 'alaves', 'espanyol', 'barcelona', 'malaga', 'atletico-madrid'] },
  ],
  groupMatches: [
    {
      id: 'esp1-getafe-alaves',
      group: 'league',
      matchday: 1,
      date: '2026-08-15',
      kickoff: '2026-08-15T17:00Z',
      home: 'getafe',
      away: 'alaves',
      score: { home: 0, away: 3 },
    },
    {
      id: 'esp1-espanyol-barcelona',
      group: 'league',
      matchday: 2,
      date: '2026-08-23',
      kickoff: '2026-08-23T19:00Z',
      home: 'espanyol',
      away: 'barcelona',
      score: { home: 1, away: 2 },
    },
    {
      id: 'esp1-atletico-malaga',
      group: 'league',
      matchday: 3,
      date: '2026-08-30',
      kickoff: '2026-08-30T19:00Z',
      home: 'atletico-madrid',
      away: 'malaga',
      score: { home: 2, away: 0 },
    },
  ],
  knockoutRounds: [],
}

const espnBase: Omit<CandidateInput, 'title' | 'id'> = {
  config: CLUB_COMPETITIONS.esp1,
  source: espnfc,
  tournament: laliga,
  channelId: espnfc.channelId,
  publishedAt: '2026-08-24T02:00:00Z',
  embeddable: 'yes',
  existing: {},
}
const espnGate = (title: string, over: Partial<CandidateInput> = {}) =>
  acceptCandidate({ ...espnBase, id: 'espnvid0001', title, ...over })

const plain = espnGate('Espanyol vs. Barcelona | LALIGA Highlights | ESPN FC')
assert(plain.status === 'accept', "ESPN FC's plain La Liga template is accepted")
assert(
  plain.status === 'accept' && plain.matchId === 'esp1-espanyol-barcelona',
  'and lands on the fixture it names',
)

// Editorial headlines are refused even when the matchup at their tail resolves.
// These two pin that: the club names survive it, and a headline that hints at
// the result does not stop the cut, because no reader of this site ever sees a
// YouTube title.
const prefixed = espnGate(
  'LALIGA SEASON OPENER 🚨 Getafe vs. Alaves | LALIGA Highlights | ESPN FC',
  { publishedAt: '2026-08-16T02:00:00Z' },
)
assert(
  prefixed.status === 'skip',
  'an editorial prefix is rejected because an iframe cover is not an absolute redaction boundary',
)
const spoilerHeadline = espnGate('TITLE CLINCHER 🏆 Espanyol vs. Barcelona | LALIGA Highlights | ESPN FC')
assert(
  spoilerHeadline.status === 'skip',
  'a result-hinting ESPN headline is never linked even though the visible player has a title seal',
)
assert(
  espnGate('Espanyol vs. Barcelona 1-2 | LALIGA Highlights | ESPN FC').status === 'skip',
  'a scoreline in the matchup segment fails the spoiler check',
)
assert(
  espnGate('BARCELONA WIN IT | Espanyol vs. Barcelona | LALIGA Highlights | ESPN FC').status ===
    'ignore',
  'a headline in its own segment does not parse at all',
)
assert(
  espnGate('MATCH OF THE WEEK 🔥 Some New Club vs. Barcelona | LALIGA Highlights | ESPN FC').status ===
    'skip',
  'a prefix whose tail is not a club we know fails closed rather than guessing',
)
assert(
  espnGate('Atletico Madrid vs. Malaga CF | LALIGA Highlights | ESPN FC', {
    publishedAt: '2026-08-31T02:00:00Z',
  }).status === 'accept',
  "ESPN FC's club wordings resolve through the alias table",
)
for (const title of [
  'Real Madrid vs. Arsenal | UCL Highlights | ESPN FC',
  'Why Barcelona are running away with LALIGA | ESPN FC',
  'Espanyol vs. Barcelona | Copa del Rey Highlights | ESPN FC',
]) {
  assert(
    espnGate(title).status === 'ignore',
    `ESPN FC's other uploads never reach La Liga: ${title.slice(0, 34)}…`,
  )
}
assert(
  screenTitle(CLUB_COMPETITIONS.ucl, espnfc, 'Espanyol vs. Barcelona | LALIGA Highlights | ESPN FC')
    .status === 'ignore',
  'ESPN FC is not trusted for the Champions League',
)

// The tail walk is longest-first, so a headline that happens to name another
// club can never win over the club actually in the matchup.
assert(clubNameFromTail('Espanyol') === 'Espanyol', 'a bare club name resolves to itself')
assert(
  clubNameFromTail('REAL MADRID SHOCKER 🚨 Espanyol') === 'Espanyol',
  'and a headline naming a different club in front of it does not steal the match',
)
assert(clubNameFromTail('TOTAL NONSENSE 🚨') === null, 'a tail with no club in it resolves to nothing')

// ---- serialization ---------------------------------------------------------

const written = serializeVideoMap('ucl', 2026, {
  'ucl-arsenal-napoli': [{ youtubeId: 'vid00000001', kind: 'normal' }],
})
assert(written.startsWith('// Generated — do not hand-edit'), 'the videos file carries the do-not-edit header')
assert(written.includes('export const ucl_2026_videos'), 'it exports the name the season file imports')
assert(!written.includes('durationSeconds:'), 'and never writes a runtime, whatever it was handed')
assert(
  !serializeVideoMap('ucl', 2026, {
    'ucl-arsenal-napoli': [{ youtubeId: 'vid00000001', kind: 'normal', durationSeconds: 615 }],
  }).includes('615'),
  'a duration smuggled into the map is dropped rather than written',
)

// ---- the fold into the season ---------------------------------------------

const folded = withClubVideos(tournament, {
  'ucl-arsenal-napoli': [{ youtubeId: 'vid00000001', kind: 'normal' }],
  'ucl-r16-1-l2': [{ youtubeId: 'vid00000002', kind: 'normal' }],
})
assert(
  folded.groupMatches.find((m) => m.id === 'ucl-arsenal-napoli')?.videos?.length === 1,
  'curated cuts reach the league-phase fixtures',
)
assert(
  folded.knockoutRounds[0].matches.find((m) => m.id === 'ucl-r16-1-l2')?.videos?.length === 1,
  'and the knockout legs',
)
const keptInline = withClubVideos(withInlineVideo, {
  'ucl-arsenal-napoli': [{ youtubeId: 'vid00000001', kind: 'normal' }],
})
assert(
  keptInline.groupMatches.find((m) => m.id === 'ucl-arsenal-napoli')?.videos?.[0].youtubeId === 'inline000001',
  'a fixture that already has a video keeps it — the fold is append-only too',
)
const noVideos: Record<string, HighlightVideo[]> = {}
assert(
  withClubVideos(tournament, noVideos).groupMatches.length === tournament.groupMatches.length,
  'an empty video map leaves the season exactly as ingested',
)

console.log('ALL PASS')
