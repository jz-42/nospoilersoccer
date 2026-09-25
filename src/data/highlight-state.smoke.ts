import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Tournament } from './types'
import {
  applyHighlightStatePollFailure,
  applyRuntimeHighlightState,
  buildRuntimeHighlightState,
  fetchRuntimeHighlightState,
  parseRuntimeHighlightState,
  type RuntimeHighlightState,
} from './highlight-state'

const tournament: Tournament = {
  id: 'test-2026',
  name: 'Test League',
  year: 2026,
  advancingRanks: [],
  teams: {
    a: { id: 'a', name: 'Alpha' },
    b: { id: 'b', name: 'Beta' },
  },
  groups: [{ id: 'league', teams: ['a', 'b'] }],
  groupMatches: [
    {
      id: 'a-b',
      group: 'league',
      matchday: 1,
      date: '2026-09-19',
      kickoff: '2026-09-19T18:00:00Z',
      home: 'a',
      away: 'b',
      score: { home: 1, away: 0 },
    },
  ],
  knockoutRounds: [],
}

const payload: RuntimeHighlightState = {
  schemaVersion: 1,
  tournamentId: 'test-2026',
  version: 7,
  generatedAt: '2026-09-19T20:00:00Z',
  matches: {
    'a-b': [{ youtubeId: 'abcdefghijk', kind: 'normal' }],
  },
}

test('parseRuntimeHighlightState accepts the minimal validated payload', () => {
  assert.deepEqual(parseRuntimeHighlightState(payload), payload)
})

test('parseRuntimeHighlightState rejects malformed provider identifiers', () => {
  assert.equal(
    parseRuntimeHighlightState({
      ...payload,
      matches: { 'a-b': [{ youtubeId: 'short', kind: 'normal' }] },
    }),
    null,
  )
})

test('parseRuntimeHighlightState preserves known YouTube publishers', () => {
  const deportesPayload = {
    ...payload,
    matches: {
      'a-b': [{ youtubeId: 'abcdefghijk', kind: 'normal', publisher: 'espn-deportes' }],
    },
  }
  assert.deepEqual(parseRuntimeHighlightState(deportesPayload), deportesPayload)
  const tudnPayload = {
    ...payload,
    matches: {
      'a-b': [{ youtubeId: 'VW2NXp9RaOE', kind: 'normal', publisher: 'tudn' }],
    },
  }
  assert.deepEqual(parseRuntimeHighlightState(tudnPayload), tudnPayload)
})

test('parseRuntimeHighlightState rejects unknown YouTube publishers', () => {
  assert.equal(
    parseRuntimeHighlightState({
      ...payload,
      matches: {
        'a-b': [{ youtubeId: 'abcdefghijk', kind: 'normal', publisher: 'unknown' }],
      },
    }),
    null,
  )
})

test('applyRuntimeHighlightState appends a new cut to the named match', () => {
  const next = applyRuntimeHighlightState(tournament, payload)
  assert.deepEqual(next.groupMatches[0].videos, [
    { youtubeId: 'abcdefghijk', kind: 'normal' },
  ])
})

test('buildRuntimeHighlightState extracts only matches that have videos', () => {
  const withVideo: Tournament = {
    ...tournament,
    groupMatches: tournament.groupMatches.map((match) => ({
      ...match,
      videos: [{ youtubeId: 'abcdefghijk', kind: 'normal' }],
    })),
  }
  const built = buildRuntimeHighlightState(withVideo, 9, '2026-09-19T20:00:00Z')
  assert.deepEqual(built, {
    schemaVersion: 1,
    tournamentId: 'test-2026',
    version: 9,
    generatedAt: '2026-09-19T20:00:00Z',
    matches: { 'a-b': [{ youtubeId: 'abcdefghijk', kind: 'normal' }] },
  })
})

test('runtime state cannot replace a bundled cut of the same kind', () => {
  const bundled: Tournament = {
    ...tournament,
    groupMatches: tournament.groupMatches.map((match) => ({
      ...match,
      videos: [{ youtubeId: '12345678901', kind: 'normal' }],
    })),
  }
  const next = applyRuntimeHighlightState(bundled, payload)
  assert.deepEqual(next.groupMatches[0].videos, [
    { youtubeId: '12345678901', kind: 'normal' },
  ])
})

test('runtime state for another tournament is ignored', () => {
  const next = applyRuntimeHighlightState(tournament, { ...payload, tournamentId: 'other' })
  assert.equal(next, tournament)
})

test('applyHighlightStatePollFailure retains a recent payload and expires a stale one', () => {
  const fetched = { ...payload, fetchedAt: 1_000 }
  assert.equal(applyHighlightStatePollFailure(fetched, 1_999, 1_000), fetched)
  assert.equal(applyHighlightStatePollFailure(fetched, 2_000, 1_000), null)
})

test('fetchRuntimeHighlightState stores a valid response and its etag', async () => {
  const result = await fetchRuntimeHighlightState(
    'https://example.test/api/highlights/test-2026',
    null,
    null,
    5_000,
    10_000,
    async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ETag: '"version-7"', 'Content-Type': 'application/json' },
      }),
  )
  assert.equal(result.state?.fetchedAt, 5_000)
  assert.equal(result.etag, '"version-7"')
})

test('fetchRuntimeHighlightState keeps current state on 304', async () => {
  const current = { ...payload, fetchedAt: 1_000 }
  let requestHeaders: Headers | undefined
  const result = await fetchRuntimeHighlightState(
    'https://example.test/api/highlights/test-2026',
    current,
    '"version-7"',
    5_000,
    10_000,
    async (_input, init) => {
      requestHeaders = new Headers(init?.headers)
      return new Response(null, { status: 304 })
    },
  )
  assert.equal(requestHeaders?.get('If-None-Match'), '"version-7"')
  assert.equal(result.state?.fetchedAt, 5_000)
  assert.equal(result.etag, '"version-7"')
})
