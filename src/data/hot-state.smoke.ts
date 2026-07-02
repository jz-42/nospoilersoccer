import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import type { Tournament } from './types'
import {
  buildTournamentHotState,
  applyHotStatePollFailure,
  applyTournamentHotState,
  parseTournamentHotState,
} from './hot-state'
import { wc2026 as wc2026Base } from './wc2026'

function sampleTournament(): Tournament {
  return {
    id: 'wc2026',
    name: 'Sample Cup',
    year: 2026,
    advancingRanks: [1, 2],
    teams: {
      FRA: { id: 'FRA', name: 'France', flag: 'FR' },
      SWE: { id: 'SWE', name: 'Sweden', flag: 'SE' },
      MEX: { id: 'MEX', name: 'Mexico', flag: 'MX' },
      ECU: { id: 'ECU', name: 'Ecuador', flag: 'EC' },
    },
    groups: [{ id: 'A', teams: ['FRA', 'SWE'] }],
    groupMatches: [
      {
        id: 'A1',
        group: 'A',
        matchday: 1,
        date: '2026-06-11',
        home: 'FRA',
        away: 'SWE',
        liveStatus: { kind: 'live' },
      },
    ],
    knockoutRounds: [
      {
        id: 'r32',
        name: 'Round of 32',
        matches: [
          {
            id: 'm79',
            date: '2026-07-01',
            home: { type: 'group-rank', group: 'A', rank: 1 },
            away: { type: 'group-rank', group: 'A', rank: 2 },
            homeTeam: 'MEX',
            awayTeam: 'ECU',
          },
        ],
      },
    ],
  }
}

test('buildTournamentHotState keeps only hot match fields', () => {
  const snapshot = buildTournamentHotState(sampleTournament())

  assert.equal(snapshot.tournamentId, 'wc2026')
  assert.deepEqual(snapshot.matches.A1, {
    liveStatus: { kind: 'live' },
    score: null,
    goals: null,
  })
  assert.deepEqual(snapshot.matches.m79, {
    liveStatus: null,
    score: null,
    goals: null,
    penalties: null,
    afterExtraTime: null,
    homeTeam: 'MEX',
    awayTeam: 'ECU',
  })
})

test('applyTournamentHotState clears stale live status and overlays finished results', () => {
  const tournament = sampleTournament()
  const merged = applyTournamentHotState(tournament, {
    tournamentId: 'wc2026',
    matches: {
      A1: {
        liveStatus: null,
        score: { home: 2, away: 1 },
        goals: [{ team: 'FRA', player: 'Kylian Mbappe', minute: "18'" }],
      },
    },
  })

  assert.equal(merged.groupMatches[0].liveStatus, undefined)
  assert.deepEqual(merged.groupMatches[0].score, { home: 2, away: 1 })
  assert.deepEqual(merged.groupMatches[0].goals, [{ team: 'FRA', player: 'Kylian Mbappe', minute: "18'" }])
})

test('committed wc2026 hot-state snapshot matches the current tournament data', () => {
  const snapshotText = readFileSync('public/api/hot-state/wc2026.json', 'utf8')
  const committed = JSON.parse(snapshotText)
  const generated = buildTournamentHotState(wc2026Base)

  assert.deepEqual(committed, generated)
})

test('parseTournamentHotState rejects malformed payloads', () => {
  assert.equal(parseTournamentHotState(null), null)
  assert.equal(parseTournamentHotState({ tournamentId: 2026, matches: {} }), null)
  assert.equal(parseTournamentHotState({ tournamentId: 'wc2026', matches: null }), null)
  assert.equal(
    parseTournamentHotState({
      tournamentId: 'wc2026',
      matches: { A1: { liveStatus: { kind: 'live' }, score: null } },
    }),
    null,
  )
  assert.equal(
    parseTournamentHotState({
      tournamentId: 'wc2026',
      matches: { m79: { liveStatus: null, score: null, goals: null, penalties: null } },
    }),
    null,
  )
  assert.deepEqual(parseTournamentHotState({ tournamentId: 'wc2026', matches: {} }), {
    tournamentId: 'wc2026',
    matches: {},
  })
})

test('applyTournamentHotState preserves bundled values when optional hot fields are missing', () => {
  const tournament = sampleTournament()
  tournament.knockoutRounds[0].matches[0].penalties = { home: 4, away: 3 }
  tournament.knockoutRounds[0].matches[0].afterExtraTime = true
  const merged = applyTournamentHotState(tournament, {
    tournamentId: 'wc2026',
    matches: {
      m79: {
        liveStatus: null,
        score: { home: 1, away: 1 },
        goals: [],
      },
    },
  })

  assert.deepEqual(merged.knockoutRounds[0].matches[0].penalties, { home: 4, away: 3 })
  assert.equal(merged.knockoutRounds[0].matches[0].afterExtraTime, true)
})

test('applyHotStatePollFailure expires stale hot state only after the ttl', () => {
  const hotState = {
    tournamentId: 'wc2026',
    matches: {},
    fetchedAt: 1_000,
  }

  assert.deepEqual(applyHotStatePollFailure(hotState, 1_000 + 5 * 60 * 1000, 15 * 60 * 1000), hotState)
  assert.equal(applyHotStatePollFailure(hotState, 1_000 + 16 * 60 * 1000, 15 * 60 * 1000), null)
  assert.equal(applyHotStatePollFailure(null, 1_000, 15 * 60 * 1000), null)
})
