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
  parseYouTubeFeed,
  pacificQuotaDay,
  projectedDailyBaseCost,
  quotaMode,
  renewWebSubSubscriptions,
  runHighlightRecovery,
  runHighlightIngestion,
  runFeedRecovery,
  processHighlightQueue,
  enqueueDueCandidates,
} from './highlights.mjs'

class FakeD1 {
  quota = new Map()
  candidates = new Map()
  subscriptions = new Map()

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
          if (sql.includes('SELECT status, requested_at, expires_at')) {
            return this.subscriptions.get(args[0]) ?? null
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
          if (sql.includes('INSERT INTO subscriptions') && sql.includes('verified_at')) {
            this.subscriptions.set(args[0], {
              status: args[2],
              requested_at: null,
              expires_at: args[4],
            })
            return { success: true }
          }
          if (sql.includes('INSERT INTO subscriptions')) {
            const existing = this.subscriptions.get(args[0])
            this.subscriptions.set(args[0], {
              ...existing,
              status:
                sql.includes("subscriptions.status = 'verified'") && existing?.status === 'verified'
                  ? 'verified'
                  : args[2],
              requested_at: args[3],
            })
            return { success: true }
          }
          if (sql.includes('UPDATE subscriptions SET status')) {
            const existing = this.subscriptions.get(args[3])
            if (existing) {
              this.subscriptions.set(args[3], {
                ...existing,
                status: args[0],
                expires_at: args[2],
              })
            }
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

test('WebSub verification creates its lease row even when the hub callback wins the request race', async () => {
  const db = new FakeD1()
  const store = createD1HighlightStore(db)
  const now = new Date('2026-09-19T20:00:00Z')

  await store.recordSubscriptionVerification(HIGHLIGHT_SOURCES[0].channelId, 'subscribe', 864000, now)

  assert.equal(await store.subscriptionDue(HIGHLIGHT_SOURCES[0].channelId, now), false)
  assert.equal(db.subscriptions.get(HIGHLIGHT_SOURCES[0].channelId)?.status, 'verified')

  await store.recordSubscriptionRequest(
    HIGHLIGHT_SOURCES[0].channelId,
    `https://www.youtube.com/feeds/videos.xml?channel_id=${HIGHLIGHT_SOURCES[0].channelId}`,
    null,
    now,
  )
  assert.equal(db.subscriptions.get(HIGHLIGHT_SOURCES[0].channelId)?.status, 'verified')
})

test('failed WebSub requests retry after a short cooldown instead of waiting six hours', async () => {
  const db = new FakeD1()
  const store = createD1HighlightStore(db)
  const now = new Date('2026-09-19T20:10:00Z')
  db.subscriptions.set(HIGHLIGHT_SOURCES[0].channelId, {
    status: 'error',
    requested_at: '2026-09-19T20:04:59Z',
    expires_at: null,
  })

  assert.equal(await store.subscriptionDue(HIGHLIGHT_SOURCES[0].channelId, now), true)
})

test('the four configured sources fit hourly authenticated recovery under budget', () => {
  assert.equal(HIGHLIGHT_SOURCES.length, 4)
  assert.equal(new Set(HIGHLIGHT_SOURCES.map((source) => source.channelId)).size, 4)
  assert.equal(deepScanPageCost(HIGHLIGHT_SOURCES), 25)
  assert.equal(projectedDailyBaseCost(HIGHLIGHT_SOURCES), 600)
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

test('parseYouTubeFeed extracts every complete entry', () => {
  const feed = NOTIFICATION_XML.replace(
    '</feed>',
    `<entry>
      <yt:videoId>12345678901</yt:videoId>
      <yt:channelId>UCqZQlzSHbVJrwrn5XvzrzcA</yt:channelId>
      <title>Chiefs v. Bills | NFL HIGHLIGHTS | NBC Sports</title>
      <published>2026-09-19T19:00:00Z</published>
      <updated>2026-09-19T19:00:00Z</updated>
    </entry></feed>`,
  )
  assert.equal(parseYouTubeFeed(feed).length, 2)
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
  assert.equal(
    isPotentialHighlight('golazo', 'Venezia vs. Lazio: Extended Highlights | Serie A | CBS Sports Golazo'),
    false,
  )
  assert.equal(isPotentialHighlight('golazo', 'UCL Today BEST BITS'), false)
})

test('WebSub verification accepts only an exact approved channel topic', async () => {
  const verifications = []
  const approved = await handleWebSubRequest(
    new Request(
      'https://worker.test/websub/youtube?hub.mode=subscribe&hub.challenge=ok-123&hub.topic=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3DUCqZQlzSHbVJrwrn5XvzrzcA&hub.lease_seconds=864000',
    ),
    {
      store: {
        recordSubscriptionVerification: async (...args) => verifications.push(args),
      },
      queue: {},
    },
  )
  assert.equal(approved.status, 200)
  assert.equal(await approved.text(), 'ok-123')
  assert.deepEqual(verifications, [
    ['UCqZQlzSHbVJrwrn5XvzrzcA', 'subscribe', 864000],
  ])

  const rejected = await handleWebSubRequest(
    new Request(
      'https://worker.test/websub/youtube?hub.mode=subscribe&hub.challenge=no&hub.topic=https%3A%2F%2Fwww.youtube.com%2Ffeeds%2Fvideos.xml%3Fchannel_id%3Dunknown',
    ),
    { store: {}, queue: {} },
  )
  assert.equal(rejected.status, 404)
})

test('WebSub renewal requests only channels whose leases are due', async () => {
  const calls = []
  const recorded = []
  const result = await renewWebSubSubscriptions({
    now: new Date('2026-09-19T20:00:00Z'),
    callbackUrl: 'https://worker.test/websub/youtube',
    store: {
      subscriptionDue: async (channelId) => channelId === HIGHLIGHT_SOURCES[0].channelId,
      recordSubscriptionRequest: async (...args) => recorded.push(args),
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return new Response(null, { status: 202 })
    },
  })

  assert.deepEqual(result, { requested: 1, skipped: 3, errors: [] })
  assert.equal(calls[0].url, 'https://pubsubhubbub.appspot.com/subscribe')
  const body = new URLSearchParams(calls[0].init.body)
  assert.equal(body.get('hub.mode'), 'subscribe')
  assert.equal(body.get('hub.callback'), 'https://worker.test/websub/youtube')
  assert.equal(
    body.get('hub.topic'),
    `https://www.youtube.com/feeds/videos.xml?channel_id=${HIGHLIGHT_SOURCES[0].channelId}`,
  )
  assert.equal(recorded.length, 1)
})

test('WebSub renewals run in parallel so a slow hub cannot consume the whole cron window', async () => {
  let active = 0
  let maxActive = 0
  const result = await renewWebSubSubscriptions({
    callbackUrl: 'https://worker.test/websub/youtube',
    store: {
      subscriptionDue: async () => true,
      recordSubscriptionRequest: async () => {},
    },
    fetchImpl: async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return new Response(null, { status: 202 })
    },
  })

  assert.equal(result.requested, HIGHLIGHT_SOURCES.length)
  assert.equal(maxActive, HIGHLIGHT_SOURCES.length)
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
    fetchImpl: async () => new Response(NOTIFICATION_XML, { status: 200 }),
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

test('WebSub notification must exist on the trusted live channel feed before enqueue', async () => {
  let stored = 0
  const response = await handleWebSubRequest(
    new Request('https://worker.test/websub/youtube', { method: 'POST', body: NOTIFICATION_XML }),
    {
      store: { recordNotification: async () => {}, upsertCandidate: async () => { stored += 1 } },
      queue: { send: async () => { throw new Error('must not enqueue') } },
      fetchImpl: async () => new Response('<feed></feed>', { status: 200 }),
    },
  )
  assert.equal(response.status, 204)
  assert.equal(stored, 0)
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

test('feed recovery checks all channels without quota and queues only likely highlights', async () => {
  const queued = []
  let quotaCalls = 0
  const result = await runFeedRecovery({
    store: {
      consumeQuota: async () => {
        quotaCalls += 1
        return true
      },
      upsertCandidate: async () => 'inserted',
    },
    queue: { send: async (candidate) => queued.push(candidate) },
    fetchImpl: async (url) => {
      const source = HIGHLIGHT_SOURCES.find((item) => url.includes(item.channelId))
      const titles = {
        fox: 'Alpha vs Beta Highlights | 2026 FIFA World Cup',
        golazo: 'Arsenal vs. Napoli: Extended Highlights | UCL | CBS Sports Golazo',
        nbc: 'Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | NBC Sports',
        espnfc: 'Athletic Club vs. Sevilla | LALIGA Highlights | ESPN FC',
      }
      return new Response(
        `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom"><entry>
          <yt:videoId>${`${source.id}00000000`.slice(0, 11)}</yt:videoId>
          <yt:channelId>${source.channelId}</yt:channelId>
          <title>${titles[source.id]}</title>
          <published>2026-09-19T20:00:00Z</published>
          <updated>2026-09-19T20:00:00Z</updated>
        </entry></feed>`,
        { status: 200, headers: { 'content-type': 'application/atom+xml' } },
      )
    },
  })
  assert.equal(result.feedsFetched, 4)
  assert.equal(queued.length, 4)
  assert.equal(quotaCalls, 0)
})

test('feed recovery fetches every channel in parallel', async () => {
  let active = 0
  let maxActive = 0
  await runFeedRecovery({
    store: { upsertCandidate: async () => 'unchanged' },
    queue: { send: async () => {} },
    fetchImpl: async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return new Response('<feed></feed>', { status: 200 })
    },
  })

  assert.equal(maxActive, HIGHLIGHT_SOURCES.length)
})

test('highlight ingestion always uses quota-free feeds and requeues due work without an API key', async () => {
  const fetched = []
  const queued = []
  const store = {
    upsertCandidate: async () => 'unchanged',
    dueCandidates: async () => [
      { videoId: 'abcdefghijk', sourceId: 'nbc', contentVersion: 'v1' },
    ],
    markQueued: async () => {},
  }

  const result = await runHighlightIngestion({
    now: new Date('2026-09-19T20:17:00Z'),
    store,
    queue: { send: async (candidate) => queued.push(candidate) },
    fetchImpl: async (url) => {
      fetched.push(url)
      return new Response('<feed></feed>', { status: 200 })
    },
  })

  assert.equal(result.feed.feedsFetched, HIGHLIGHT_SOURCES.length)
  assert.equal(result.api, null)
  assert.equal(result.requeued, 1)
  assert.ok(fetched.every((url) => url.startsWith('https://www.youtube.com/feeds/videos.xml')))
  assert.deepEqual(queued, [
    { videoId: 'abcdefghijk', sourceId: 'nbc', contentVersion: 'v1' },
  ])
})

test('slow WebSub renewal does not delay the quota-free feed recovery path', async () => {
  let renewalsCompleted = 0
  let feedStartedBeforeRenewalsCompleted = false
  await runHighlightIngestion({
    webSubCallbackUrl: 'https://worker.test/websub/youtube',
    store: {
      subscriptionDue: async () => true,
      recordSubscriptionRequest: async () => {},
      upsertCandidate: async () => 'unchanged',
      dueCandidates: async () => [],
    },
    queue: { send: async () => {} },
    fetchImpl: async (url) => {
      if (url === 'https://pubsubhubbub.appspot.com/subscribe') {
        await new Promise((resolve) => setTimeout(resolve, 5))
        renewalsCompleted += 1
        return new Response(null, { status: 202 })
      }
      if (renewalsCompleted < HIGHLIGHT_SOURCES.length) {
        feedStartedBeforeRenewalsCompleted = true
      }
      return new Response('<feed></feed>', { status: 200 })
    },
  })

  assert.equal(feedStartedBeforeRenewalsCompleted, true)
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
    channelId: HIGHLIGHT_SOURCES[2].channelId,
    title: 'Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | NBC Sports',
    publishedAt: '2026-09-19T20:00:00Z',
  })
  assert.match(calls[0].url, /actions\/workflows\/curate-highlight\.yml\/dispatches$/)
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    ref: 'main',
    inputs: {
      video_id: 'abcdefghijk',
      source_id: 'nbc',
      content_version: 'version-1',
      channel_id: HIGHLIGHT_SOURCES[2].channelId,
      candidate_title: 'Everton v. Manchester United | PREMIER LEAGUE HIGHLIGHTS | NBC Sports',
      published_at: '2026-09-19T20:00:00Z',
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
