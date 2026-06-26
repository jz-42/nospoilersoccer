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
        { id: 'm73', date: '2026-06-28', kickoff: '2026-06-28T19:00Z' },
      ],
    },
  ],
}
`

test('parseMatchKickoffs extracts match ids, phase, and kickoff time', () => {
  const matches = parseMatchKickoffs(SAMPLE_TS)

  assert.equal(matches.length, 2)
  assert.deepEqual(
    matches.map(({ matchId, phase, kickoff }) => ({
      matchId,
      phase,
      kickoff: kickoff.toISOString(),
    })),
    [
      { matchId: 'E5', phase: 'group', kickoff: '2026-06-25T20:00:00.000Z' },
      { matchId: 'm73', phase: 'knockout', kickoff: '2026-06-28T19:00:00.000Z' },
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

test('chooseAction skips dispatch when outside window or action already running', () => {
  assert.equal(chooseAction({ insideWindow: false, activeRunCount: 0 }), 'skip_outside_window')
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
