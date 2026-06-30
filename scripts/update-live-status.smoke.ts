import type { MatchLiveStatus, Tournament } from '../src/data/types'
import { parseEvent, type EspnEvent } from './espn'
import { mapLiveStatusEventsForDay, resolveLiveStatusMatchId } from './update-live-status'
import {
  applyParsedStatuses,
  summarizeLiveStatusAudit,
  type ParsedLiveStatusEvent,
} from './update-live-status-lib'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

function makeTournament(): Tournament {
  return {
    id: 'smoke',
    name: 'Smoke Cup',
    year: 2026,
    advancingRanks: [1, 2],
    teams: {
      NED: { id: 'NED', name: 'Netherlands', flag: 'NL' },
      MOR: { id: 'MOR', name: 'Morocco', flag: 'MA' },
      BRA: { id: 'BRA', name: 'Brazil', flag: 'BR' },
      JPN: { id: 'JPN', name: 'Japan', flag: 'JP' },
    },
    groups: [{ id: 'A', teams: ['NED', 'MOR', 'BRA', 'JPN'] }],
    groupMatches: [
      {
        id: 'gm1',
        group: 'A',
        matchday: 1,
        date: '2026-06-30',
        kickoff: '2026-06-30T01:00Z',
        home: 'NED',
        away: 'MOR',
      },
      {
        id: 'gm2',
        group: 'A',
        matchday: 1,
        date: '2026-06-30',
        kickoff: '2026-06-30T17:00Z',
        home: 'BRA',
        away: 'JPN',
      },
    ],
    knockoutRounds: [],
  }
}

const tournament = makeTournament()

const liveEvent = {
  date: '2026-06-30T01:00Z',
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: '1', displayName: 'Netherlands' } },
        { homeAway: 'away', team: { id: '2', displayName: 'Morocco' } },
      ],
      status: { type: { completed: false, detail: "48'", shortDetail: "48'", state: 'in' } },
    },
  ],
} as EspnEvent

const parsedLive = parseEvent(tournament, liveEvent)
assert(
  parsedLive?.liveStatusMode === 'set' && parsedLive.liveStatus?.kind === 'live',
  'ESPN in-progress state maps to live',
)

const delayedEvent = {
  date: '2026-06-30T17:00Z',
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: '3', displayName: 'Brazil' } },
        { homeAway: 'away', team: { id: '4', displayName: 'Japan' } },
      ],
      status: {
        type: { completed: false, detail: 'Delayed', shortDetail: 'Delayed', state: 'pre' },
      },
    },
  ],
} as EspnEvent

const parsedDelayed = parseEvent(tournament, delayedEvent)
assert(
  parsedDelayed?.liveStatusMode === 'set' && parsedDelayed.liveStatus?.kind === 'delayed',
  'delayed feed detail maps to delayed',
)

const scheduledEvent = {
  date: '2026-06-30T17:00Z',
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: '3', displayName: 'Brazil' } },
        { homeAway: 'away', team: { id: '4', displayName: 'Japan' } },
      ],
      status: {
        type: {
          completed: false,
          detail: 'Tue, June 30th at 1:00 PM EDT',
          shortDetail: 'Scheduled',
          state: 'pre',
        },
      },
    },
  ],
} as EspnEvent

const parsedScheduled = parseEvent(tournament, scheduledEvent)
assert(parsedScheduled?.liveStatusMode === 'clear', 'scheduled feed state clears stale live status')

const unknownEvent = {
  date: '2026-06-30T17:00Z',
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: '3', displayName: 'Brazil' } },
        { homeAway: 'away', team: { id: '4', displayName: 'Japan' } },
      ],
      status: {
        type: {
          completed: false,
          detail: 'Awaiting Match Status',
          shortDetail: 'Status',
          state: 'mystery',
        },
      },
    },
  ],
} as EspnEvent

const parsedUnknown = parseEvent(tournament, unknownEvent)
assert(parsedUnknown?.liveStatusMode === 'ignore', 'unknown feed state leaves live status unchanged')

const aliasFailureEvent = {
  date: '2026-06-30T17:00Z',
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: '3', displayName: 'Brasil' } },
        { homeAway: 'away', team: { id: '4', displayName: 'Japan' } },
      ],
      status: {
        type: {
          completed: false,
          detail: 'Delayed',
          shortDetail: 'Delayed',
          state: 'pre',
        },
      },
    },
  ],
} as EspnEvent

const mappedDay = mapLiveStatusEventsForDay(tournament, '20260630', [aliasFailureEvent])
assert(
  mappedDay.audit.some((entry) => entry.code === 'live_status_parse_failed'),
  'parse failures become spoiler-free audit entries',
)
assert(mappedDay.events.length === 0, 'parse failures do not produce mapped live-status updates')

const sourceText = `
export const tournament = {
  groupMatches: [
    { id: 'gm1', group: 'A', matchday: 1, date: '2026-06-30', kickoff: '2026-06-30T01:00Z', home: 'NED', away: 'MOR' },
    { id: 'gm2', group: 'A', matchday: 1, date: '2026-06-30', kickoff: '2026-06-30T17:00Z', home: 'BRA', away: 'JPN' },
  ],
}
`

const applied = applyParsedStatuses({
  sourceText,
  events: [
    { day: '20260630', matchId: 'missing', action: 'set', liveStatus: { kind: 'live' } as MatchLiveStatus },
    { day: '20260630', matchId: 'gm2', action: 'set', liveStatus: { kind: 'delayed' } as MatchLiveStatus },
  ] satisfies ParsedLiveStatusEvent[],
})

assert(applied.updatedIds.includes('gm2'), 'a later clean status still applies after an earlier failure')
assert(
  applied.audit.some((entry) => entry.code === 'live_status_apply_failed' && entry.matchId === 'missing'),
  'per-match live-status apply failure becomes a spoiler-free audit entry',
)
assert(
  applied.sourceText.includes(`liveStatus: { kind: 'delayed' }`),
  'successful live-status writes update source text',
)

const summary = summarizeLiveStatusAudit(applied.audit)
assert(summary.includes('live_status_apply_failed'), 'audit summary includes spoiler-free error codes')

const cleared = applyParsedStatuses({
  sourceText: applied.sourceText,
  events: [{ day: '20260630', matchId: 'gm2', action: 'clear' }],
})
assert(
  !cleared.sourceText.includes(`liveStatus: { kind: 'delayed' }`),
  'clear actions remove stale live status',
)

const shiftedKickoffMatchId = resolveLiveStatusMatchId(tournament, {
  homeTeam: 'BRA',
  awayTeam: 'JPN',
  kickoff: '2026-07-01T02:10Z',
})
assert(
  shiftedKickoffMatchId === 'gm2',
  'shifted kickoff still resolves to the same match when teams uniquely identify it',
)

console.log('ALL LIVE STATUS TESTS PASS')
