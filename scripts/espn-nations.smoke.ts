import { buildNationsSeason } from './espn-nations-lib'
import type { OfficialUnlFixture } from '../src/data/nations/unl-2026-official'

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

console.log('ESPN NATIONS TESTS PASS')
