import { buildNationsSeason, stageIdForEvent } from './espn-nations-lib'
import type { OfficialUnlFixture } from '../src/data/nations/unl-2026-official'
import { readFileSync } from 'node:fs'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const standings = {
  children: [{
    name: 'Group A1',
    standings: { entries: ['162', '459', '465', '478'].map((id) => ({ team: { id } })) },
  }],
}

function event(id: string, date: string, homeId: string, awayId: string, completed = false) {
  return {
    id,
    date,
    season: { year: 2026, slug: 'group-stage' },
    competitions: [{
      status: { type: { completed, detail: completed ? 'FT' : 'Scheduled', state: completed ? 'post' : 'pre' } },
      competitors: [
        { homeAway: 'home', score: completed ? '2' : '0', team: { id: homeId, displayName: 'home' } },
        { homeAway: 'away', score: completed ? '1' : '0', team: { id: awayId, displayName: 'away' } },
      ],
    }],
  }
}

const events = [
  event('401861047', '2026-09-24T16:00Z', '162', '459'),
  event('401861048', '2026-09-25T18:45Z', '465', '478', true),
]
const official: OfficialUnlFixture[] = [
  { espnEventId: '401861047', group: 'A1', home: 'ITA', away: 'BEL', kickoff: '2026-09-24T16:00Z', matchday: 1 },
  { espnEventId: '401861048', group: 'A1', home: 'TUR', away: 'FRA', kickoff: '2026-09-25T18:45Z', matchday: 1 },
]

const built = buildNationsSeason({ standings, events, official })
assert(built.audit.errors.length === 0, 'valid recorded feed builds')
assert(built.tournament.groups[0].id === 'A1', 'Group A1 maps exactly')
assert(built.tournament.groupMatches[0].id === 'unl-401861047', 'ESPN event ID is stable')
assert(built.tournament.groupMatches[0].kickoff === '2026-09-24T16:00Z', 'kickoff is UTC')
assert(built.tournament.groupMatches[1].score?.home === 2, 'completed score is parsed')

const unknown = buildNationsSeason({
  standings,
  events: [events[0], event('unknown', '2026-09-25T18:45Z', '999999', '478')],
  official,
})
assert(unknown.audit.errors.some((message) => message.includes('unknown team')), 'unknown team blocks output')

const duplicate = buildNationsSeason({ standings, events: [...events, events[0]], official })
assert(duplicate.audit.errors.some((message) => message.includes('duplicate event')), 'duplicates block output')

const truncated = buildNationsSeason({ standings, events: events.slice(0, 1), official })
assert(truncated.audit.errors.some((message) => message.includes('fixture count')), 'truncation blocks output')

const previous = buildNationsSeason({ standings, events, official }).tournament
previous.groupMatches[0].score = { home: 3, away: 0 }
const regressed = buildNationsSeason({ standings, events, official, previous })
assert(regressed.audit.errors.some((message) => message.includes('lost finished score')), 'a vanished finished score blocks output')
assert(regressed.tournament.groupMatches[0].score?.home === 3, 'last-known finished score is retained in memory')

const truncatedWithPrevious = buildNationsSeason({ standings, events: events.slice(0, 1), official, previous })
assert(truncatedWithPrevious.tournament.groupMatches.length === 2, 'a truncated fetch retains the last-known fixture set')
assert(truncatedWithPrevious.audit.errors.some((message) => message.includes('missing from ESPN')), 'retention remains an explicit failed audit')

const generatedSource = readFileSync(new URL('../src/data/nations/unl-2026.ts', import.meta.url), 'utf8')
assert(generatedSource.includes("import { unl2026Videos }"), 'regeneration keeps highlights in a curator-owned sibling')

const partialDraw = buildNationsSeason({
  standings,
  events: [...events, event('qf-one-leg', '2027-03-25T18:45Z', '162', '459')],
  official,
  previous,
})
assert(partialDraw.tournament.knockoutRounds.length === 0, 'an incomplete later-stage draw is not materialized')
assert(partialDraw.tournament.knockoutTracks?.[0].pendingStages?.some((stage) => stage.id === 'qf'), 'an incomplete draw remains pending')
assert(stageIdForEvent({ season: { slug: 'quarterfinals' }, competitions: [{}] }) === 'qf', 'quarter-finals are classified')
assert(stageIdForEvent({ competitions: [{ altGameNote: 'UEFA Nations League, League A/B Play-offs' }] }) === 'ab-playoff', 'A/B play-offs are classified')
assert(stageIdForEvent({ competitions: [{ series: { title: 'League B/C Play-offs' } }] }) === 'bc-playoff', 'B/C play-offs are classified')
assert(stageIdForEvent({ season: { slug: 'semifinals' }, competitions: [{}] }) === 'sf', 'semi-finals are classified')
assert(stageIdForEvent({ name: 'Third-place match', competitions: [{}] }) === 'third-place', 'third place is classified before the final')
assert(stageIdForEvent({ season: { slug: 'final' }, competitions: [{}] }) === 'final', 'final is classified')

const leagueAGroups = [
  ['162', '459', '465', '478'],
  ['481', '449', '6757', '455'],
  ['164', '477', '448', '450'],
  ['482', '479', '464', '578'],
]
const fullStandings = {
  children: leagueAGroups.map((ids, index) => ({
    name: `Group A${index + 1}`,
    standings: { entries: ids.map((id) => ({ team: { id } })) },
  })),
}
const fullOfficial: OfficialUnlFixture[] = []
const fullGroupEvents: ReturnType<typeof event>[] = []
for (const [groupIndex, ids] of leagueAGroups.entries()) {
  let matchday = 0
  for (const home of ids) for (const away of ids) {
    if (home === away) continue
    const id = `group-${groupIndex}-${home}-${away}`
    const date = `2026-09-${String(24 + Math.floor(matchday / 2)).padStart(2, '0')}T18:45Z`
    fullGroupEvents.push(event(id, date, home, away, true))
    fullOfficial.push({
      espnEventId: id,
      group: `A${groupIndex + 1}`,
      home: nationalId(home),
      away: nationalId(away),
      kickoff: date,
      matchday: Math.floor(matchday / 2) + 1,
    })
    matchday++
  }
}

function nationalId(espnId: string): string {
  const ids: Record<string, string> = {
    '162': 'ITA', '459': 'BEL', '465': 'TUR', '478': 'FRA',
    '481': 'GER', '449': 'NED', '6757': 'SRB', '455': 'GRE',
    '164': 'ESP', '477': 'CRO', '448': 'ENG', '450': 'CZE',
    '482': 'POR', '479': 'DEN', '464': 'NOR', '578': 'WAL',
  }
  return ids[espnId]
}

const qfPairs = [
  ['162', '449'], ['481', '477'], ['164', '479'], ['482', '459'],
]
const qfEvents = qfPairs.flatMap(([first, second], index) => [
  {
    ...event(`qf-${index}-1`, '2027-03-25T18:45Z', first, second),
    name: 'UEFA Nations League Quarter-finals',
    season: { year: 2027, slug: 'quarterfinals' },
    competitions: [{ ...event('x', '2027-03-25T18:45Z', first, second).competitions[0], leg: { value: 1 } }],
  },
  {
    ...event(`qf-${index}-2`, '2027-03-30T18:45Z', second, first),
    name: 'UEFA Nations League Quarter-finals',
    season: { year: 2027, slug: 'quarterfinals' },
    competitions: [{ ...event('x', '2027-03-30T18:45Z', second, first).competitions[0], leg: { value: 2 } }],
  },
])
const completeDraw = buildNationsSeason({
  standings: fullStandings,
  events: [...fullGroupEvents, ...qfEvents],
  official: fullOfficial,
})
assert(completeDraw.tournament.knockoutRounds[0]?.matches.length === 8, 'a complete two-leg stage materializes atomically')
assert(completeDraw.tournament.ties?.length === 4, 'a complete quarter-final draw creates four stable ties')
assert(!completeDraw.tournament.knockoutTracks?.[0].pendingStages?.some((stage) => stage.id === 'qf'), 'a materialized stage is removed from pending')

const scoredQfEvents = qfEvents.map((raw, index) => index === 0 ? {
  ...raw,
  competitions: [{
    ...raw.competitions[0],
    status: { type: { completed: true, detail: 'FT', state: 'post' } },
  }],
} : raw)
const scoredDraw = buildNationsSeason({
  standings: fullStandings,
  events: [...fullGroupEvents, ...scoredQfEvents],
  official: fullOfficial,
})
assert(scoredDraw.audit.errors.length === 0, 'a complete scored quarter-final snapshot builds')
const sameScoredDraw = buildNationsSeason({
  standings: fullStandings,
  events: [...fullGroupEvents, ...scoredQfEvents],
  official: fullOfficial,
  previous: scoredDraw.tournament,
})
assert(sameScoredDraw.audit.errors.length === 0, 'an unchanged knockout score is accepted')
const lostKnockoutScore = buildNationsSeason({
  standings: fullStandings,
  events: [...fullGroupEvents, ...qfEvents],
  official: fullOfficial,
  previous: scoredDraw.tournament,
})
assert(lostKnockoutScore.audit.errors.some((message) => message.includes('lost finished score')), 'a vanished knockout score blocks publication')
assert(lostKnockoutScore.tournament.knockoutRounds[0].matches.some((match) => match.id === 'unl-qf-0-1' && !!match.score), 'the last-known knockout score is retained in memory')
assert(JSON.stringify(lostKnockoutScore.tournament.ties) === JSON.stringify(scoredDraw.tournament.ties), 'the prior quarter-final ties are retained')

const retainedDraw = buildNationsSeason({
  standings: fullStandings,
  events: [...fullGroupEvents, ...qfEvents.slice(0, 1)],
  official: fullOfficial,
  previous: completeDraw.tournament,
})
assert(retainedDraw.audit.errors.some((message) => message.includes('previously published qf')), 'a regressed draw blocks publication')
assert(retainedDraw.tournament.knockoutRounds[0]?.matches.length === 8, 'a regressed draw retains the published stage in memory')

console.log('ESPN NATIONS TESTS PASS')
