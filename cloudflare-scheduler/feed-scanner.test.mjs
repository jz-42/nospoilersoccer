import assert from 'node:assert/strict'
import test from 'node:test'

import { handleFeedScanRequest } from './feed-scanner.mjs'
import { HIGHLIGHT_SOURCES } from './highlights.mjs'

test('scan service fetches exactly one requested channel', async () => {
  const requested = []
  const response = await handleFeedScanRequest(
    new Request('https://feed-scanner.internal/scan?source=tudn'),
    {
      store: { upsertCandidate: async () => 'unchanged' },
      queue: { send: async () => {} },
      fetchImpl: async (url) => {
        requested.push(new URL(url).searchParams.get('channel_id'))
        return new Response('<feed></feed>')
      },
    },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(requested, [HIGHLIGHT_SOURCES.find((source) => source.id === 'tudn').channelId])
})

test('scan service rejects unknown sources', async () => {
  const response = await handleFeedScanRequest(
    new Request('https://feed-scanner.internal/scan?source=unknown'),
    { store: {}, queue: {} },
  )
  assert.equal(response.status, 404)
})
