import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildWindowReport,
  chooseAction,
  createGitHubClient,
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
