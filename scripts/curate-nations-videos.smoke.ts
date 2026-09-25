import type { Tournament } from '../src/data/types'
import { nationalTeams } from '../src/data/national-teams'
import {
  acceptNationsCandidate,
  FOX_SOCCER_CHANNEL_ID,
  NATIONS_HIGHLIGHT_TRUST,
  parseNationsHighlightTitle,
  recordNationsCandidateResult,
  serializeNationsVideos,
} from './curate-nations-videos'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const tournament: Tournament = {
  id: 'unl-2026',
  name: 'UEFA Nations League 2026/27',
  year: 2026,
  advancingRanks: [1, 2],
  teams: Object.fromEntries(['ENG', 'FIN', 'ITA', 'FRA', 'GER', 'ESP'].map((id) => [id, nationalTeams[id]])),
  groups: [{ id: 'A1', teams: ['ENG', 'FIN', 'ITA', 'FRA', 'GER', 'ESP'] }],
  groupMatches: [
    { id: 'unl-eng-fin', group: 'A1', matchday: 1, date: '2026-09-24', kickoff: '2026-09-24T18:45Z', home: 'ENG', away: 'FIN', score: { home: 2, away: 0 } },
    { id: 'unl-ita-fra', group: 'A1', matchday: 1, date: '2026-09-25', kickoff: '2026-09-25T18:45Z', home: 'ITA', away: 'FRA', score: { home: 1, away: 1 } },
    { id: 'unl-ita-ger', group: 'A1', matchday: 2, date: '2026-10-01', kickoff: '2026-10-01T18:45Z', home: 'ITA', away: 'GER', score: { home: 2, away: 1 } },
    { id: 'unl-esp-ger', group: 'A1', matchday: 2, date: '2026-10-02', kickoff: '2026-10-02T18:45Z', home: 'ESP', away: 'GER' },
  ],
  knockoutRounds: [],
}

for (const [title, expected] of [
  ['England vs. Finland Highlights | UEFA Nations League', ['ENG', 'FIN']],
  ['Italy vs. France UEFA Nations League Highlights | FOX Soccer', ['ITA', 'FRA']],
  ['Italy vs. Germany UEFA Nations League Highlights | FOX Soccer', ['ITA', 'GER']],
] as const) {
  const parsed = parseNationsHighlightTitle(title)
  assert(parsed?.home === expected[0] && parsed.away === expected[1], `accept title: ${title}`)
}
for (const title of [
  'France scores late winner vs Italy | FOX Soccer',
  'England vs Spain Preview | UEFA Nations League',
  'Best goals from Nations League Matchday 1',
]) {
  assert(parseNationsHighlightTitle(title) === null, `reject title: ${title}`)
}

const base = {
  id: 'video000001',
  title: 'England vs. Finland Highlights | UEFA Nations League',
  channelId: FOX_SOCCER_CHANNEL_ID,
  publishedAt: '2026-09-24T22:00Z',
  durationSeconds: 480,
  embeddable: 'yes' as const,
  isShort: false,
  tournament,
  existing: {},
}
assert(NATIONS_HIGHLIGHT_TRUST === 'trusted', 'FOX Soccer publishes valid Nations League cuts without manual quarantine')
assert(acceptNationsCandidate({ ...base, trustMode: 'quarantine' }).status === 'quarantined', 'quarantine mode holds a valid cut when configured')
const trusted = acceptNationsCandidate({ ...base, trustMode: 'trusted' })
assert(trusted.status === 'accepted' && trusted.matchId === 'unl-eng-fin', 'trusted mode accepts the unique completed fixture')
assert(acceptNationsCandidate({ ...base, trustMode: 'trusted', channelId: 'UCwrong' }).status === 'rejected', 'wrong channel is rejected')
assert(acceptNationsCandidate({ ...base, trustMode: 'trusted', channelId: 'UCwNqHDsnBCKT-olwJwIFyfg', title: 'England vs Finland Highlights ⚽ UEFA Nations League' }).status === 'accepted', 'exact FOX Sports channel publishes a Nations League cut')
assert(acceptNationsCandidate({ ...base, trustMode: 'trusted', publishedAt: '2026-09-24T17:00Z' }).status === 'retry', 'publication before kickoff is held')
assert(acceptNationsCandidate({ ...base, trustMode: 'trusted', title: 'England vs. Germany Highlights | UEFA Nations League' }).status === 'rejected', 'unmatched teams are rejected')
assert(acceptNationsCandidate({ ...base, trustMode: 'trusted', isShort: true }).status === 'rejected', 'Shorts are rejected')
assert(acceptNationsCandidate({ ...base, trustMode: 'trusted', embeddable: 'no' }).status === 'rejected', 'non-embeddable videos are rejected')
assert(acceptNationsCandidate({ ...base, trustMode: 'trusted', publishedAt: '2026-09-29T22:00Z' }).status === 'rejected', 'publication after the configured horizon is rejected')

const first = trusted.status === 'accepted' ? { [trusted.matchId]: [trusted.video] } : {}
const source = serializeNationsVideos(first)
assert((source.match(/video000001/g) ?? []).length === 1, 'trusted persistence serializes a cut exactly once')
assert(serializeNationsVideos(first) === source, 'video serialization is idempotent')
assert(serializeNationsVideos({}) === serializeNationsVideos({}), 'quarantine can leave the videos module unchanged')

const scanMap = {}
let acceptedAny = false
for (const result of [trusted, { status: 'rejected', reason: 'later unrelated video' } as const]) {
  acceptedAny = recordNationsCandidateResult(scanMap, result) || acceptedAny
}
assert(acceptedAny, 'a later rejection does not erase an earlier acceptance')
assert(serializeNationsVideos(scanMap).includes('video000001'), 'multi-video scan serializes the accepted cut')

console.log('NATIONS VIDEO CURATOR TESTS PASS')
