import assert from 'node:assert/strict'
import test from 'node:test'

import tickWorker from './highlight-tick.mjs'

test('highlight cron scans all seven sources without invoking the result scheduler', async () => {
  const requests = []
  await tickWorker.scheduled({ scheduledTime: Date.parse('2026-09-27T18:08:00Z') }, {
    HIGHLIGHT_DB: {
      prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }),
    },
    HIGHLIGHT_QUEUE: { send: async () => {} },
    FEED_SCANNER: {
      fetch: async (request) => {
        requests.push(new URL(request.url).searchParams.get('source'))
        return new Response('{}')
      },
    },
  })
  assert.equal(requests.length, 7)
  assert.equal(new Set(requests).size, 7)
})

test('highlight cron uses scheduled time to spread WebSub renewals', async () => {
  const requests = []
  await tickWorker.scheduled({ scheduledTime: Date.parse('2026-09-28T00:01:00Z') }, {
    HIGHLIGHT_DB: {
      prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }),
    },
    HIGHLIGHT_QUEUE: { send: async () => {} },
    FEED_SCANNER: {
      fetch: async (request) => {
        requests.push(new URL(request.url))
        return new Response('{}')
      },
    },
  })
  assert.equal(requests.filter((url) => url.pathname === '/scan').length, 7)
  assert.deepEqual(requests.filter((url) => url.pathname === '/renew').map(
    (url) => url.searchParams.get('source'),
  ), ['foxsoccer'])
})
