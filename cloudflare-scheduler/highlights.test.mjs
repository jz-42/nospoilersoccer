import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DAILY_QUOTA_LIMIT,
  HIGHLIGHT_SOURCES,
  createD1HighlightStore,
  createHighlightDispatchClient,
  deepScanPageCost,
  handleWebSubRequest,
  handleCandidateResultRequest,
  isPotentialHighlight,
  parseYouTubeNotification,
  pacificQuotaDay,
  projectedDailyBaseCost,
  quotaMode,
  runHighlightRecovery,
  processHighlightQueue,
  enqueueDueCandidates,
} from './highlights.mjs'

class FakeD1 {
  quota = new Map()
  candidates = new Map()

  prepare(sql) {
    return {
      bind: (...args) => ({
        first: async () => {
          if (sql.includes('SELECT used_units')) {
            return this.quota.has(args[0]) ? { used_units: this.quota.get(args[0]) } : null
          }
          if (sql.includes('UPDATE quota_days')) {
            const [units, day, _repeatedUnits, limit] = args
            const current = this.quota.get(day) ?? 0
            if (current + units > limit) return null
            this.quota.set(day, current + units)
            return { used_units: current + units }
          }
          if (sql.includes('SELECT content_version')) {
            const existing = this.candidates.get(args[0])
            return existing ? { content_version: existing.contentVersion } : null
          }
          throw new Error(`unexpected first SQL: ${sql}`)
        },
        run: async () => {
          if (sql.includes('INSERT OR IGNORE INTO quota_days')) {
            if (!this.quota.has(args[0])) this.quota.set(args[0], 0)
            return { success: true }
          }
          if (sql.includes('INSERT INTO quota_events')) return { success: true }
          if (sql.includes('INSERT INTO candidates')) {
            this.candidates.set(args[0], {
              contentVersion: args[1],
              title: args[4],
            })
            return { success: true }
          }
          throw new Error(`unexpected run SQL: ${sql}`)
        },
      }),
    }
  }
}

test('quota mode degrades expensive recovery before the notification fast path', () => {
  assert.equal(quotaMode(0), 'normal')
  assert.equal(quotaMode(6_999), 'normal')
  assert.equal(quotaMode(7_000), 'no_deep')
  assert.equal(quotaMode(7_499), 'no_deep')
  assert.equal(quotaMode(7_500), 'slow_shallow')
  assert.equal(quotaMode(7_999), 'slow_shallow')
  assert.equal(quotaMode(8_000), 'websub_only')
  assert.equal(DAILY_QUOTA_LIMIT, 8_000)
})

test('D1 store enforces the hard quota and deduplicates candidate versions', async () => {
  const db = new FakeD1()
  const store = createD1HighlightStore(db)
  assert.equal(await store.consumeQuota('2026-09-19', 'playlistItems.list', 7_999), true)
  assert.equal(await store.consumeQuota('2026-09-19', 'videos.list', 1), true)
  assert.equal(await store.consumeQuota('2026-09-19', 'videos.list', 1), false)
  assert.equal(await store.quotaUsed('2026-09-19'), 8_000)

  const candidate = {
    videoId: 'abcdefghijk',
    contentVersion: 'v1',
    sourceId: 'nbc',
    channelId: HIGHLIGHT_SOURCES[2].channelId,
    title: 'Title one',
    publishedAt: '2026-09-19T20:00:00Z',
    updatedAt: '2026-09-19T20:00:00Z',
    discoveredBy: 'websub',
  }
  assert.equal(await store.upsertCandidate(candidate), 'inserted')
  assert.equal(await store.upsertCandidate(candidate), 'unchanged')
  assert.equal(
    await store.upsertCandidate({ ...candidate, contentVersion: 'v2', title: 'Retitled' }),
    'updated',
  )
})

test('the four configured sources fit one-page minute polling under budget', () => {
  assert.equal(HIGHLIGHT_SOURCES.length, 4)
  assert.equal(new Set(HIGHLIGHT_SOURCES.map((source) => source.channelId)).size, 4)
  assert.equal(deepScanPageCost(HIGHLIGHT_SOURCES), 25)
  assert.equal(projectedDailyBaseCost(HIGHLIGHT_SOURCES), 6_360)
  assert.ok(projectedDailyBaseCost(HIGHLIGHT_SOURCES) < DAILY_QUOTA_LIMIT)
})

test('quota days reset at Pacific midnight, including across UTC date boundaries', () => {
  assert.equal(pacificQuotaDay(new Date('2026-09-19T06:59:59Z')), '2026-09-18')
  assert.equal(pacificQuotaDay(new Date('2026-09-19T07:00:00Z')), '2026-09-19')
})

const NOTIFICATION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <yt:videoId>abcdefghijk</yt:videoId>
    <yt:channelId>UCqZQlzSHbVJrwrn5XvzrzcA</yt:channelId>
    <title>Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | NBC Sports</title>
    <published>2026-09-19T20:00:00Z</published>
    <updated>2026-09-19T20:01:00Z</updated>
  </entry>
</feed>`

test('parseYouTubeNotification extracts the approved-channel candidate', () => {
  assert.deepEqual(parseYouTubeNotification(NOTIFICATION_XML), {
    videoId: 'abcdefghijk',
    channelId: 'UCqZQlzSHbVJrwrn5XvzrzcA',
    title: 'Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | NBC Sports',
    publishedAt: '2026-09-19T20:00:00Z',
    updatedAt: '2026-09-19T20:01:00Z',
  })
})

test('source title screening keeps full-match highlights and drops channel noise', () => {
  assert.equal(
    isPotentialHighlight('fox', 'Canada vs Japan Extended Highlights | 2026 FIFA World Cup'),
    true,
  )
  assert.equal(
    isPotentialHighlight('golazo', 'Arsenal vs. Napoli: Extended Highlights | UCL | CBS Sports Golazo'),
    true,
  )
  assert.equal(
    isPotentialHighlight('nbc', 'Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | NBC Sports'),
    true,
  )
  assert.equal(
    isPotentialHighlight('espnfc', 'Athletic Club vs. Sevilla | LALIGA Highlights | ESPN FC'),
    true,
  )
  assert.equal(isPotentialHighlight('nbc', 'Chiefs v. Bills | NFL HIGHLIGHTS | NBC Sports'), false)
  assert.equal(isPotentialHighlight('golazo', 'UCL Today BEST BITS'), false)
})

test('WebSub verification accepts only an exact approved channel topic', async () => {
  const approved = await handleWebSubRequest(
    new Request(
      'https://worker.test/websub/youtube?hub.mode=subscribe&hub.challenge=ok-123&hub.topic=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUCqZQlzSHbVJrwrn5XvzrzcA&hub.lease_seconds=864000',
    ),
    { store: {}, queue: {} },
  )
  assert.equal(approved.status, 200)
  assert.equal(await approved.text(), 'ok-123')

  const rejected = await handleWebSubRequest(
    new Request(
      'https://worker.test/websub/youtube?hub.mode=subscribe&hub.challenge=no&hub.topic=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3Dunknown',
    ),
    { store: {}, queue: {} },
  )
  assert.equal(rejected.status, 404)
})

test('WebSub notification persists before enqueue and deduplicates unchanged versions', async () => {
  const order = []
  let result = 'inserted'
  const deps = {
    store: {
      upsertCandidate: async (candidate) => {
        order.push(`store:${candidate.videoId}`)
        assert.match(candidate.contentVersion, /^[a-f0-9]{64}$/)
        return result
      },
    },
    queue: {
      send: async (message) => order.push(`queue:${message.videoId}`),
    },
  }
  const first = await handleWebSubRequest(
    new Request('https://worker.test/websub/youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/atom+xml' },
      body: NOTIFICATION_XML,
    }),
    deps,
  )
  assert.equal(first.status, 204)
  assert.deepEqual(order, ['store:abcdefghijk', 'queue:abcdefghijk'])

  result = 'unchanged'
  order.length = 0
  const duplicate = await handleWebSubRequest(
    new Request('https://worker.test/websub/youtube', { method: 'POST', body: NOTIFICATION_XML }),
    deps,
  )
  assert.equal(duplicate.status, 204)
  assert.deepEqual(order, ['store:abcdefghijk'])
})

test('normal recovery polls one newest page per source and enqueues only changed uploads', async () => {
  const fetched = []
  const queued = []
  let consumed = 0
  const store = {
    quotaUsed: async () => consumed,
    consumeQuota: async (_day, _method, units) => {
      if (consumed + units > DAILY_QUOTA_LIMIT) return false
      consumed += units
      return true
    },
    upsertCandidate: async (candidate) =>
      candidate.sourceId === 'fox' ? 'unchanged' : 'inserted',
  }
  const result = await runHighlightRecovery({
    now: new Date('2026-09-19T20:17:00Z'),
    apiKey: 'test-key',
    store,
    queue: { send: async (message) => queued.push(message) },
    fetchImpl: async (url) => {
      fetched.push(url)
      const source = HIGHLIGHT_SOURCES.find((item) => url.includes(item.playlistId))
      const titles = {
        fox: 'Alpha vs Beta Highlights | 2026 FIFA World Cup',
        golazo: 'Arsenal vs. Napoli: Extended Highlights | UCL | CBS Sports Golazo',
        nbc: 'Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | NBC Sports',
        espnfc: 'Athletic Club vs. Sevilla | LALIGA Highlights | ESPN FC',
      }
      return new Response(
        JSON.stringify({
          items: [
            {
              snippet: {
                title: titles[source.id],
                publishedAt: '2026-09-19T20:16:00Z',
                resourceId: { videoId: `${source.id}00000000`.slice(0, 11) },
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    },
  })

  assert.equal(result.mode, 'normal')
  assert.equal(result.pagesFetched, 4)
  assert.equal(fetched.length, 4)
  assert.equal(consumed, 4)
  assert.equal(queued.length, 3)
})

test('quota ceiling disables recovery requests without disabling WebSub receipt', async () => {
  let fetched = 0
  const result = await runHighlightRecovery({
    now: new Date('2026-09-19T20:17:00Z'),
    apiKey: 'test-key',
    store: {
      quotaUsed: async () => DAILY_QUOTA_LIMIT,
      consumeQuota: async () => false,
      upsertCandidate: async () => 'inserted',
    },
    queue: { send: async () => {} },
    fetchImpl: async () => {
      fetched += 1
      throw new Error('should not fetch')
    },
  })
  assert.equal(result.mode, 'websub_only')
  assert.equal(result.pagesFetched, 0)
  assert.equal(fetched, 0)
})

test('hourly recovery scans each source to its bounded depth', async () => {
  let consumed = 0
  const pageBySource = new Map()
  const result = await runHighlightRecovery({
    now: new Date('2026-09-19T20:00:00Z'),
    apiKey: 'test-key',
    store: {
      quotaUsed: async () => consumed,
      consumeQuota: async (_day, _method, units) => {
        consumed += units
        return true
      },
      upsertCandidate: async () => 'unchanged',
    },
    queue: { send: async () => {} },
    fetchImpl: async (url) => {
      const source = HIGHLIGHT_SOURCES.find((item) => url.includes(item.playlistId))
      const page = (pageBySource.get(source.id) ?? 0) + 1
      pageBySource.set(source.id, page)
      const pageLimit = Math.ceil(source.scanDepth / 50)
      return new Response(
        JSON.stringify({
          items: [],
          ...(page < pageLimit ? { nextPageToken: `page-${page + 1}` } : {}),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    },
  })
  assert.equal(result.pagesFetched, 25)
  assert.equal(consumed, 25)
  assert.deepEqual([...pageBySource.values()], [2, 3, 12, 8])
})

test('highlight dispatch client starts the narrow workflow with candidate inputs', async () => {
  const calls = []
  const client = createHighlightDispatchClient({
    token: 'token',
    owner: 'jz-42',
    repo: 'nospoilersoccer',
    ref: 'main',
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return new Response(null, { status: 204 })
    },
  })
  await client.dispatch({
    videoId: 'abcdefghijk',
    sourceId: 'nbc',
    contentVersion: 'version-1',
  })
  assert.match(calls[0].url, /actions\/workflows\/curate-highlight\.yml\/dispatches$/)
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    ref: 'main',
    inputs: {
      video_id: 'abcdefghijk',
      source_id: 'nbc',
      content_version: 'version-1',
    },
  })
})

test('queue processing acknowledges dispatched candidates and retries failures', async () => {
  const events = []
  const ok = {
    body: { videoId: 'abcdefghijk', sourceId: 'nbc', contentVersion: 'v1' },
    ack: () => events.push('ack'),
    retry: () => events.push('retry-unexpected'),
  }
  const bad = {
    body: { videoId: '12345678901', sourceId: 'fox', contentVersion: 'v2' },
    ack: () => events.push('ack-unexpected'),
    retry: () => events.push('retry'),
  }
  await processHighlightQueue(
    { messages: [ok, bad] },
    {
      dispatch: async (candidate) => {
        events.push(candidate.videoId)
        if (candidate.videoId === '12345678901') throw new Error('GitHub unavailable')
      },
    },
  )
  assert.deepEqual(events, ['abcdefghijk', 'ack', '12345678901', 'retry'])
})

test('due candidates are enqueued once and marked queued', async () => {
  const events = []
  const store = {
    dueCandidates: async () => [
      { videoId: 'abcdefghijk', sourceId: 'nbc', contentVersion: 'v1' },
    ],
    markQueued: async (videoId, version) => events.push(`marked:${videoId}:${version}`),
  }
  const count = await enqueueDueCandidates(store, {
    send: async (candidate) => events.push(`sent:${candidate.videoId}`),
  }, new Date('2026-09-19T20:00:00Z'))
  assert.equal(count, 1)
  assert.deepEqual(events, ['sent:abcdefghijk', 'marked:abcdefghijk:v1'])
})

test('candidate result callback authenticates and records accepted or retry status', async () => {
  const recorded = []
  const store = {
    recordCandidateResult: async (...args) => recorded.push(args),
  }
  const unauthorized = await handleCandidateResultRequest(
    new Request('https://worker.test/admin/highlight-result', {
      method: 'POST',
      body: JSON.stringify({ videoId: 'abcdefghijk', contentVersion: 'v1', status: 'accepted' }),
    }),
    { secret: 'secret', store },
  )
  assert.equal(unauthorized.status, 401)

  const accepted = await handleCandidateResultRequest(
    new Request('https://worker.test/admin/highlight-result', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: 'abcdefghijk', contentVersion: 'v1', status: 'accepted' }),
    }),
    { secret: 'secret', store },
  )
  assert.equal(accepted.status, 204)
  assert.deepEqual(recorded, [['abcdefghijk', 'v1', 'accepted', null]])
})
