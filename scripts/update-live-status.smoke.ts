import { tournaments } from '../src/data'
import { groupStandings } from '../src/data/standings'
import {
  matchLoser,
  matchWinner,
  type KnockoutMatch,
  type MatchLiveStatus,
  type SlotRef,
  type Tournament,
} from '../src/data/types'
import { parseEvent, type EspnEvent } from './espn'
import { liveStatusDaysToPoll, mapLiveStatusEventsForDay, resolveLiveStatusMatchId } from './update-live-status'
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

function findKnockout(tournament: Tournament, id: string): KnockoutMatch {
  for (const round of tournament.knockoutRounds) {
    const match = round.matches.find((candidate) => candidate.id === id)
    if (match) return match
  }
  throw new Error(`missing knockout fixture ${id}`)
}

function expectedSlotTeam(tournament: Tournament, slot: SlotRef): string | null {
  switch (slot.type) {
    case 'group-rank':
      return groupStandings(tournament, slot.group)[slot.rank - 1]?.team ?? null
    case 'match-winner':
      return matchWinner(findKnockout(tournament, slot.match))
    case 'match-loser':
      return matchLoser(findKnockout(tournament, slot.match))
    case 'best-third':
      return null
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
assert(!summary.includes('live_status_match_not_found:missing'), 'audit summary does not include raw internal error detail')

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

const knockoutTournament = makeTournament()
knockoutTournament.knockoutRounds = [
  {
    id: 'r16',
    name: 'Round of 16',
    matches: [
      {
        id: 'ko1',
        date: '2026-07-01',
        kickoff: '2026-07-01T17:00Z',
        home: { type: 'group-rank', group: 'A', rank: 1 },
        away: { type: 'group-rank', group: 'A', rank: 2 },
        homeTeam: 'NED',
        awayTeam: 'MOR',
        score: { home: 1, away: 0 },
      },
      {
        id: 'ko2',
        date: '2026-07-01',
        kickoff: '2026-07-01T21:00Z',
        home: { type: 'group-rank', group: 'A', rank: 3 },
        away: { type: 'group-rank', group: 'A', rank: 4 },
        homeTeam: 'BRA',
        awayTeam: 'JPN',
        score: { home: 0, away: 2 },
      },
    ],
  },
  {
    id: 'qf',
    name: 'Quarterfinals',
    matches: [
      {
        id: 'ko3',
        date: '2026-07-06',
        kickoff: '2026-07-06T19:00Z',
        home: { type: 'match-winner', match: 'ko1' },
        away: { type: 'match-winner', match: 'ko2' },
      },
    ],
  },
]
assert(
  resolveLiveStatusMatchId(knockoutTournament, {
    homeTeam: 'NED',
    awayTeam: 'JPN',
    kickoff: '2026-07-06T19:00Z',
  }) === 'ko3',
  'knockout live status resolves from decided feeder matches before participants are stored',
)

const thirdPlaceTournament = makeTournament()
thirdPlaceTournament.knockoutRounds = [
  {
    id: 'sf',
    name: 'Semifinals',
    matches: [
      {
        id: 'sf1',
        date: '2026-07-14',
        kickoff: '2026-07-14T20:00Z',
        home: { type: 'group-rank', group: 'A', rank: 1 },
        away: { type: 'group-rank', group: 'A', rank: 2 },
        homeTeam: 'NED',
        awayTeam: 'MOR',
        score: { home: 2, away: 0 },
      },
      {
        id: 'sf2',
        date: '2026-07-15',
        kickoff: '2026-07-15T20:00Z',
        home: { type: 'group-rank', group: 'A', rank: 3 },
        away: { type: 'group-rank', group: 'A', rank: 4 },
        homeTeam: 'BRA',
        awayTeam: 'JPN',
        score: { home: 1, away: 3 },
      },
    ],
  },
  {
    id: 'third-place',
    name: 'Third Place',
    matches: [
      {
        id: 'third',
        date: '2026-07-18',
        kickoff: '2026-07-18T20:00Z',
        home: { type: 'match-loser', match: 'sf1' },
        away: { type: 'match-loser', match: 'sf2' },
      },
    ],
  },
]
assert(
  resolveLiveStatusMatchId(thirdPlaceTournament, {
    homeTeam: 'MOR',
    awayTeam: 'BRA',
    kickoff: '2026-07-18T20:00Z',
  }) === 'third',
  'third-place live status resolves from semifinal losers before participants are stored',
)

const current2026 = tournaments.wc2026
for (const matchId of ['m94', 'm95', 'm96']) {
  const match = findKnockout(current2026, matchId)
  const homeTeam = match.homeTeam ?? expectedSlotTeam(current2026, match.home)
  const awayTeam = match.awayTeam ?? expectedSlotTeam(current2026, match.away)
  if (!homeTeam || !awayTeam) throw new Error(`fixture ${matchId} must have expected teams for smoke coverage`)

  const tournamentWithoutStoredTarget = structuredClone(current2026)
  const target = findKnockout(tournamentWithoutStoredTarget, matchId)
  target.homeTeam = undefined
  target.awayTeam = undefined

  assert(
    resolveLiveStatusMatchId(tournamentWithoutStoredTarget, {
      homeTeam,
      awayTeam,
      kickoff: match.kickoff!,
    }) === matchId,
    `current 2026 ${matchId} live status resolves from bracket feeders before participants are stored`,
  )
}

for (const matchId of ['m74', 'm77', 'm79', 'm80', 'm81', 'm82', 'm85', 'm87']) {
  const match = findKnockout(current2026, matchId)
  const homeTeam = match.homeTeam
  const awayTeam = match.awayTeam
  if (!homeTeam || !awayTeam) throw new Error(`fixture ${matchId} must have stored teams for best-third smoke coverage`)

  const tournamentWithoutStoredTarget = structuredClone(current2026)
  const target = findKnockout(tournamentWithoutStoredTarget, matchId)
  target.homeTeam = undefined
  target.awayTeam = undefined

  assert(
    resolveLiveStatusMatchId(tournamentWithoutStoredTarget, {
      homeTeam,
      awayTeam,
      kickoff: match.kickoff!,
    }) === matchId,
    `2026 best-third knockout ${matchId} live status resolves before participants are stored`,
  )
}

const tiedBestThirdTournament: Tournament = {
  id: 'tied-best-third',
  name: 'Tied Best Third Cup',
  year: 2026,
  advancingRanks: [1, 2],
  bestThirdCount: 1,
  bestThirdAllocation: {
    A: { A: 'A' },
    B: { A: 'B' },
  },
  teams: {
    A1: { id: 'A1', name: 'A1', flag: 'A1' },
    A2: { id: 'A2', name: 'A2', flag: 'A2' },
    A3: { id: 'A3', name: 'A3', flag: 'A3' },
    B1: { id: 'B1', name: 'B1', flag: 'B1' },
    B2: { id: 'B2', name: 'B2', flag: 'B2' },
    B3: { id: 'B3', name: 'B3', flag: 'B3' },
  },
  groups: [
    { id: 'A', teams: ['A1', 'A2', 'A3'] },
    { id: 'B', teams: ['B1', 'B2', 'B3'] },
  ],
  groupMatches: [],
  knockoutRounds: [
    {
      id: 'r32',
      name: 'Round of 32',
      matches: [
        {
          id: 'tie1',
          date: '2026-06-28',
          kickoff: '2026-06-28T20:00Z',
          home: { type: 'group-rank', group: 'A', rank: 1 },
          away: { type: 'best-third', groups: ['A', 'B'] },
        },
      ],
    },
  ],
}
assert(
  resolveLiveStatusMatchId(tiedBestThirdTournament, {
    homeTeam: 'A1',
    awayTeam: 'A3',
    kickoff: '2026-06-28T20:00Z',
  }) === null,
  'best-third live status does not guess when the cutoff is tied',
)

let resolved2026KnockoutCount = 0
for (const round of current2026.knockoutRounds) {
  for (const match of round.matches) {
    const homeTeam = match.homeTeam ?? expectedSlotTeam(current2026, match.home)
    const awayTeam = match.awayTeam ?? expectedSlotTeam(current2026, match.away)
    if (!homeTeam || !awayTeam || !match.kickoff) continue

    const tournamentWithoutStoredTarget = structuredClone(current2026)
    const target = findKnockout(tournamentWithoutStoredTarget, match.id)
    target.homeTeam = undefined
    target.awayTeam = undefined

    assert(
      resolveLiveStatusMatchId(tournamentWithoutStoredTarget, {
        homeTeam,
        awayTeam,
        kickoff: match.kickoff,
      }) === match.id,
      `2026 knockout ${match.id} live status resolves from bracket data before participants are stored`,
    )
    resolved2026KnockoutCount += 1
  }
}
assert(resolved2026KnockoutCount >= 24, '2026 bracket coverage includes every currently derivable knockout matchup')

const pollTournament = makeTournament()
pollTournament.groupMatches[0].date = '2026-06-29'
pollTournament.groupMatches[0].kickoff = '2026-06-29T01:00Z'
pollTournament.groupMatches[0].score = { home: 1, away: 0 }
assert(
  JSON.stringify(liveStatusDaysToPoll(pollTournament, '2026-06-30')) === JSON.stringify(['20260630']),
  'poller only includes dates that still have unresolved live-status candidates',
)

console.log('ALL LIVE STATUS TESTS PASS')
