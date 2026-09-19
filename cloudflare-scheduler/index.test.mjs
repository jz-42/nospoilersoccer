import test from 'node:test'
import assert from 'node:assert/strict'

import worker, {
  HOT_STATE_SEASON_IDS,
  buildWindowReport,
  chooseAction,
  createGitHubClient,
  handleHighlightStateRequest,
  handleHotStateRequest,
  highlightStateSourceUrl,
  hotStateSourceUrl,
  parseMatchKickoffs,
  runScheduler,
} from './index.mjs'

const SAMPLE_TS = `
export const wc2026 = {
  groupMatches: [
    { id: 'E5', kickoff: '2026-06-25T20:00Z' },
  ],
  knockoutRounds: [
    {
      id: 'r32',
      matches: [
        { id: 'm73', date: '2026-06-28', home: { type: 'group-rank', group: 'A', rank: 2 } },
      ],
    },
  ],
}
`

test('parseMatchKickoffs extracts match ids, phase, and kickoff time', () => {
  const matches = parseMatchKickoffs(SAMPLE_TS)

  assert.equal(matches.length, 2)
  assert.deepEqual(
    matches.map(({ matchId, phase, kickoff, date, dateOnly }) => ({
      matchId,
      phase,
      kickoff: kickoff?.toISOString() ?? null,
      date: date ?? null,
      dateOnly: dateOnly ?? false,
    })),
    [
      {
        matchId: 'E5',
        phase: 'group',
        kickoff: '2026-06-25T20:00:00.000Z',
        date: null,
        dateOnly: false,
      },
      { matchId: 'm73', phase: 'knockout', kickoff: null, date: '2026-06-28', dateOnly: true },
    ],
  )
})

test('parseMatchKickoffs does not borrow kickoff from the next match object', () => {
  const source = `
  export const wc2026 = {
    knockoutRounds: [{
      matches: [
        { id: 'm73', date: '2026-06-28', home: { type: 'group-rank', group: 'A', rank: 2 } },
        { id: 'm74', date: '2026-06-29', kickoff: '2026-06-29T20:00Z', home: { type: 'group-rank', group: 'B', rank: 2 } },
      ],
    }],
  }
  `

  const matches = parseMatchKickoffs(source)

  assert.deepEqual(
    matches.map(({ matchId, kickoff, date, dateOnly }) => ({
      matchId,
      kickoff: kickoff?.toISOString() ?? null,
      date: date ?? null,
      dateOnly,
    })),
    [
      { matchId: 'm73', kickoff: null, date: '2026-06-28', dateOnly: true },
      { matchId: 'm74', kickoff: '2026-06-29T20:00:00.000Z', date: null, dateOnly: false },
    ],
  )
})

test('buildWindowReport returns active windows with conservative buffers', () => {
  const matches = parseMatchKickoffs(SAMPLE_TS)
  const report = buildWindowReport(matches, new Date('2026-06-25T23:00:00Z'))

  assert.equal(report.insideWindow, true)
  assert.equal(report.activeWindows.length, 1)
  assert.deepEqual(report.activeWindows[0], {
    matchId: 'E5',
    phase: 'group',
    kickoff: '2026-06-25T20:00:00.000Z',
    windowStart: '2026-06-25T21:30:00.000Z',
    windowEnd: '2026-06-26T04:00:00.000Z',
  })
})

test('buildWindowReport covers date-only knockout matches for the full match date plus buffer', () => {
  const matches = parseMatchKickoffs(SAMPLE_TS)
  const report = buildWindowReport(matches, new Date('2026-06-28T23:00:00Z'))

  assert.equal(report.insideWindow, true)
  assert.deepEqual(report.activeWindows, [
    {
      matchId: 'm73',
      phase: 'knockout',
      date: '2026-06-28',
      windowStart: '2026-06-28T00:00:00.000Z',
      windowEnd: '2026-06-29T12:00:00.000Z',
    },
  ])
})

test('chooseAction dispatches whenever no workflow run is active', () => {
  assert.equal(chooseAction({ insideWindow: false, activeRunCount: 0 }), 'dispatch')
  assert.equal(chooseAction({ insideWindow: true, activeRunCount: 2 }), 'skip_active_run')
  assert.equal(chooseAction({ insideWindow: true, activeRunCount: 0 }), 'dispatch')
})

test('createGitHubClient lists active runs and dispatches workflow', async () => {
  const calls = []
  const client = createGitHubClient({
    token: 'test-token',
    owner: 'jz-42',
    repo: 'nospoilersoccer',
    workflowFile: 'update-results.yml',
    ref: 'main',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ?? null })
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            workflow_runs: [
              { id: 1, status: 'in_progress', event: 'schedule' },
              { id: 2, status: 'completed', event: 'workflow_dispatch' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      return new Response(null, { status: 204 })
    },
  })

  const activeRunCount = await client.getActiveRunCount()
  assert.equal(activeRunCount, 1)

  await client.dispatchWorkflow()

  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /actions\/workflows\/update-results\.yml\/runs/)
  assert.match(calls[1].url, /actions\/workflows\/update-results\.yml\/dispatches/)
  assert.equal(calls[1].method, 'POST')
  assert.equal(calls[1].body, JSON.stringify({ ref: 'main' }))
})

test('runScheduler logs a dispatch decision with active run count and action', async () => {
  const messages = []
  const result = await runScheduler({
    now: new Date('2026-06-25T23:00:00Z'),
    fetchSchedule: async () => SAMPLE_TS,
    githubClient: {
      getActiveRunCount: async () => 0,
      dispatchWorkflow: async () => {},
    },
    logger: (entry) => messages.push(entry),
  })

  assert.equal(result.action, 'dispatch')
  assert.equal(result.insideWindow, true)
  assert.equal(result.activeRunCount, 0)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].action, 'dispatch')
  assert.equal(messages[0].insideWindow, true)
  assert.equal(messages[0].activeWindowCount, 1)
})

test('runScheduler dispatches outside match windows so the updater runs 24/7', async () => {
  const messages = []
  const result = await runScheduler({
    now: new Date('2026-06-25T10:00:00Z'),
    fetchSchedule: async () => SAMPLE_TS,
    githubClient: {
      getActiveRunCount: async () => 0,
      dispatchWorkflow: async () => {},
    },
    logger: (entry) => messages.push(entry),
  })

  assert.equal(result.action, 'dispatch')
  assert.equal(result.insideWindow, false)
  assert.equal(result.activeRunCount, 0)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].action, 'dispatch')
  assert.equal(messages[0].insideWindow, false)
})

test('runScheduler can fail cron execution after logging GitHub errors', async () => {
  const messages = []
  const error = new Error('GitHub runs API 500')
  error.status = 500

  await assert.rejects(
    runScheduler({
      now: new Date('2026-06-25T23:00:00Z'),
      fetchSchedule: async () => SAMPLE_TS,
      githubClient: {
        getActiveRunCount: async () => {
          throw error
        },
        dispatchWorkflow: async () => {},
      },
      logger: (entry) => messages.push(entry),
      throwOnError: true,
    }),
    /GitHub runs API 500/,
  )

  assert.equal(messages.length, 1)
  assert.equal(messages[0].action, 'error')
  assert.equal(messages[0].github.status, 500)
})

test('worker serves hot-state JSON with CORS headers', async () => {
  const { handleHotStateRequest } = await import('./index.mjs')
  const response = await handleHotStateRequest(
    {
      HOT_STATE_URL: 'https://example.com/wc2026.json',
    },
    async () =>
      new Response(JSON.stringify({ tournamentId: 'wc2026', matches: { m77: { liveStatus: { kind: 'live' } } } }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'last-modified': 'Tue, 30 Jun 2026 21:02:16 GMT',
        },
      }),
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  const payload = await response.json()
  assert.equal(payload.tournamentId, 'wc2026')
  assert.equal(typeof payload.matches, 'object')
  assert.equal(payload.sourceLastModified, 'Tue, 30 Jun 2026 21:02:16 GMT')
})

test('hotStateSourceUrl keeps wc2026 on its existing override, clubs on the base path', () => {
  // The live site polls wc2026; its resolved source must not move.
  assert.equal(
    hotStateSourceUrl({}, 'wc2026'),
    'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/public/api/hot-state/wc2026.json',
  )
  assert.equal(hotStateSourceUrl({ HOT_STATE_URL: 'https://example.com/x.json' }, 'wc2026'), 'https://example.com/x.json')

  // The single-season override must not leak onto club seasons.
  assert.equal(
    hotStateSourceUrl({ HOT_STATE_URL: 'https://example.com/x.json' }, 'eng1-2026'),
    'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/public/api/hot-state/eng1-2026.json',
  )
  assert.equal(
    hotStateSourceUrl({}, 'ucl-2026'),
    'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/public/api/hot-state/ucl-2026.json',
  )
})

test('worker serves every club season and 404s unknown ones', async () => {
  const requested = []
  const fetchImpl = async (url) => {
    requested.push(url)
    return new Response(JSON.stringify({ tournamentId: 'stub', matches: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  for (const seasonId of HOT_STATE_SEASON_IDS) {
    const response = await handleHotStateRequest({}, fetchImpl, seasonId)
    assert.equal(response.status, 200, seasonId)
    const payload = await response.json()
    assert.match(payload.sourcePath, new RegExp(`/${seasonId}\\.json$`))
  }

  assert.deepEqual(HOT_STATE_SEASON_IDS, ['wc2026', 'eng1-2026', 'esp1-2026', 'ucl-2026'])
  assert.equal(requested.length, 4)
})

test('hot-state route accepts the four seasons and rejects anything else', async () => {
  const env = { HOT_STATE_BASE_URL: 'https://example.com/hot-state' }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ tournamentId: 'stub' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  try {
    for (const seasonId of HOT_STATE_SEASON_IDS) {
      const response = await worker.fetch(new Request(`https://w.dev/api/hot-state/${seasonId}`), env)
      assert.equal(response.status, 200, seasonId)
      assert.equal(response.headers.get('access-control-allow-origin'), '*')
    }

    // Unknown seasons and traversal attempts must not reach raw.githubusercontent.
    for (const bad of ['wc2022', 'ger1-2026', 'eng1-2026.json', '../secrets']) {
      const response = await worker.fetch(new Request(`https://w.dev/api/hot-state/${bad}`), env)
      assert.equal(response.status, 404, bad)
    }

    const unknown = await worker.fetch(new Request('https://w.dev/api/hot-state/wc2022'), env)
    assert.equal(unknown.headers.get('access-control-allow-origin'), '*')
    assert.equal((await unknown.json()).error, 'unknown_season')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('highlight state resolves from the generated runtime snapshot path', () => {
  assert.equal(
    highlightStateSourceUrl({}, 'eng1-2026'),
    'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/public/api/highlights/eng1-2026.json',
  )
  assert.equal(
    highlightStateSourceUrl({ HIGHLIGHT_STATE_BASE_URL: 'https://example.test/highlights' }, 'wc2026'),
    'https://example.test/highlights/wc2026.json',
  )
})

test('worker serves highlight state with a stable etag and honors conditional requests', async () => {
  const body = {
    schemaVersion: 1,
    tournamentId: 'eng1-2026',
    version: 42,
    generatedAt: '2026-09-19T20:00:00Z',
    matches: {},
  }
  const fetchImpl = async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

  const first = await handleHighlightStateRequest(
    {},
    new Request('https://w.dev/api/highlights/eng1-2026'),
    fetchImpl,
    'eng1-2026',
  )
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('etag'), '"42"')
  assert.equal(first.headers.get('access-control-allow-origin'), '*')

  const second = await handleHighlightStateRequest(
    {},
    new Request('https://w.dev/api/highlights/eng1-2026', {
      headers: { 'If-None-Match': '"42"' },
    }),
    fetchImpl,
    'eng1-2026',
  )
  assert.equal(second.status, 304)
})

test('highlight-state route accepts known seasons and rejects unknown ones', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        schemaVersion: 1,
        tournamentId: 'stub',
        version: 1,
        generatedAt: '2026-09-19T20:00:00Z',
        matches: {},
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  try {
    const response = await worker.fetch(new Request('https://w.dev/api/highlights/ucl-2026'), {})
    assert.equal(response.status, 200)
    const unknown = await worker.fetch(new Request('https://w.dev/api/highlights/wc2022'), {})
    assert.equal(unknown.status, 404)
    assert.equal((await unknown.json()).error, 'unknown_season')
  } finally {
    globalThis.fetch = originalFetch
  }
})
