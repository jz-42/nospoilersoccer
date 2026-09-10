/**
 * Smoke tests for the club highlight curator's accept/reject gate.
 *
 *   npx tsx scripts/curate-club-videos.smoke.ts
 *
 * The gate is the only thing standing between a CBS Sports Golazo upload and a
 * user's match card, and there is no AI review behind it, so every branch is
 * pinned here — especially the ones that must fail closed. The titles are real
 * Golazo uploads.
 */
import { CLUB_COMPETITIONS } from './espn-club'
import { GOLAZO_CHANNEL_ID, acceptCandidate, screenTitle, serializeVideoMap } from './curate-club-videos'
import type { CandidateInput } from './curate-club-videos'
import type { HighlightVideo, Tournament } from '../src/data/types'
import { clubs } from '../src/data/club/clubs'
import { withClubVideos } from '../src/data/club/with-videos'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const ucl = CLUB_COMPETITIONS.ucl
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
  tournament,
  channelId: GOLAZO_CHANNEL_ID,
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
  screenTitle(ucl, nonHighlights[0]).status === 'ignore',
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
  screenTitle(CLUB_COMPETITIONS.eng1, LEAGUE_TITLE).status === 'ignore',
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
