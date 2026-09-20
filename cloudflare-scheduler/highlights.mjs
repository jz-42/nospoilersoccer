export const DAILY_QUOTA_LIMIT = 8_000

export const HIGHLIGHT_SOURCES = Object.freeze([
  {
    id: 'fox',
    label: 'FOX Sports',
    channelId: 'UCwNqHDsnBCKT-olwJwIFyfg',
    playlistId: 'UUwNqHDsnBCKT-olwJwIFyfg',
    scanDepth: 100,
  },
  {
    id: 'golazo',
    label: 'CBS Sports Golazo',
    channelId: 'UCET00YnetHT7tOpu12v8jxg',
    playlistId: 'UUET00YnetHT7tOpu12v8jxg',
    scanDepth: 150,
  },
  {
    id: 'nbc',
    label: 'NBC Sports',
    channelId: 'UCqZQlzSHbVJrwrn5XvzrzcA',
    playlistId: 'UUqZQlzSHbVJrwrn5XvzrzcA',
    scanDepth: 600,
  },
  {
    id: 'espnfc',
    label: 'ESPN FC',
    channelId: 'UC6c1z7bA__85CIWZ_jpCK-Q',
    playlistId: 'UU6c1z7bA__85CIWZ_jpCK-Q',
    scanDepth: 400,
  },
])

const POTENTIAL_HIGHLIGHT_RE = {
  fox: /^.+?\s+vs\.?\s+.+?\s+(?:Extended\s+)?Highlights\b.*World Cup/i,
  golazo: /^.+?\s+vs\.?\s+.+?:\s+(?:Extended\s+)?Highlights\b.*\|\s*(?:UCL\b|UEFA\s+Champions\s+League\b|Champions\s+League\b)/i,
  nbc: /^.+?\s+vs?\.?\s+.+?\s*\|\s*PREMIER\s+LEAGUE(?:\s+EXTENDED)?\s+HIGHLIGHTS\b/i,
  espnfc: /^.+?\s+vs?\.?\s+.+?\s*\|\s*LA\s?LIGA\s+(?:EXTENDED\s+)?HIGHLIGHTS\b/i,
}

export function isPotentialHighlight(sourceId, title) {
  return typeof title === 'string' && (POTENTIAL_HIGHLIGHT_RE[sourceId]?.test(title) ?? false)
}

export function quotaMode(used) {
  if (used >= DAILY_QUOTA_LIMIT) return 'websub_only'
  if (used >= 7_500) return 'slow_shallow'
  if (used >= 7_000) return 'no_deep'
  return 'normal'
}

export function deepScanPageCost(sources = HIGHLIGHT_SOURCES) {
  return sources.reduce((sum, source) => sum + Math.ceil(source.scanDepth / 50), 0)
}

export function projectedDailyBaseCost(sources = HIGHLIGHT_SOURCES) {
  return deepScanPageCost(sources) * 24
}

export function candidateRetryDelayMs(attemptCount) {
  return attemptCount < 30 ? 60 * 1000 : 5 * 60 * 1000
}

export function pacificQuotaDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type) => parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function createD1HighlightStore(db) {
  return {
    async subscriptionDue(channelId, now = new Date()) {
      const row = await db
        .prepare('SELECT status, requested_at, expires_at FROM subscriptions WHERE channel_id = ?')
        .bind(channelId)
        .first()
      if (!row) return true

      const requestedAt = row.requested_at ? new Date(row.requested_at) : null
      const requestCooldown = row.status === 'error' ? 5 * 60 * 1000 : 6 * 60 * 60 * 1000
      if (requestedAt && now.getTime() - requestedAt.getTime() < requestCooldown) return false

      const expiresAt = row.expires_at ? new Date(row.expires_at) : null
      return !expiresAt || expiresAt.getTime() <= now.getTime() + 48 * 60 * 60 * 1000
    },

    async recordSubscriptionRequest(channelId, topicUrl, error = null, now = new Date()) {
      await db
        .prepare(
          `INSERT INTO subscriptions (
            channel_id, topic_url, status, requested_at, last_error
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(channel_id) DO UPDATE SET
            topic_url = excluded.topic_url,
            status = CASE
              WHEN subscriptions.status = 'verified' AND excluded.last_error IS NULL
                THEN subscriptions.status
              ELSE excluded.status
            END,
            requested_at = excluded.requested_at,
            last_error = excluded.last_error`,
        )
        .bind(channelId, topicUrl, error ? 'error' : 'pending', now.toISOString(), error)
        .run()
    },

    async recordSubscriptionVerification(channelId, mode, leaseSeconds, now = new Date()) {
      const expiresAt = mode === 'subscribe' && Number.isFinite(leaseSeconds) && leaseSeconds > 0
        ? new Date(now.getTime() + leaseSeconds * 1000).toISOString()
        : null
      const topicUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
      await db
        .prepare(
          `INSERT INTO subscriptions (
            channel_id, topic_url, status, verified_at, expires_at, last_error
          ) VALUES (?, ?, ?, ?, ?, NULL)
          ON CONFLICT(channel_id) DO UPDATE SET
            topic_url = excluded.topic_url,
            status = excluded.status,
            verified_at = excluded.verified_at,
            expires_at = excluded.expires_at,
            last_error = NULL`,
        )
        .bind(
          channelId,
          topicUrl,
          mode === 'subscribe' ? 'verified' : 'unsubscribed',
          now.toISOString(),
          expiresAt,
        )
        .run()
    },

    async recordNotification(channelId, now = new Date()) {
      await db
        .prepare('UPDATE subscriptions SET last_notification_at = ? WHERE channel_id = ?')
        .bind(now.toISOString(), channelId)
        .run()
    },

    async quotaUsed(day) {
      const row = await db
        .prepare('SELECT used_units FROM quota_days WHERE day = ?')
        .bind(day)
        .first()
      return Number(row?.used_units ?? 0)
    },

    async consumeQuota(day, method, units) {
      await db
        .prepare('INSERT OR IGNORE INTO quota_days (day, used_units) VALUES (?, 0)')
        .bind(day)
        .run()
      const reserved = await db
        .prepare(
          'UPDATE quota_days SET used_units = used_units + ? WHERE day = ? AND used_units + ? <= ? RETURNING used_units',
        )
        .bind(units, day, units, DAILY_QUOTA_LIMIT)
        .first()
      if (!reserved) return false
      await db
        .prepare(
          'INSERT INTO quota_events (day, method, units, created_at) VALUES (?, ?, ?, ?)',
        )
        .bind(day, method, units, new Date().toISOString())
        .run()
      return true
    },

    async upsertCandidate(candidate) {
      const existing = await db
        .prepare('SELECT content_version FROM candidates WHERE video_id = ?')
        .bind(candidate.videoId)
        .first()
      if (existing?.content_version === candidate.contentVersion) return 'unchanged'
      await db
        .prepare(
          `INSERT INTO candidates (
            video_id, content_version, source_id, channel_id, title,
            published_at, updated_at, discovered_by, status, first_seen_at, last_seen_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
          ON CONFLICT(video_id) DO UPDATE SET
            content_version = excluded.content_version,
            source_id = excluded.source_id,
            channel_id = excluded.channel_id,
            title = excluded.title,
            published_at = excluded.published_at,
            updated_at = excluded.updated_at,
            discovered_by = excluded.discovered_by,
            status = 'pending',
            attempt_count = 0,
            next_attempt_at = NULL,
            last_seen_at = excluded.last_seen_at,
            last_error = NULL`,
        )
        .bind(
          candidate.videoId,
          candidate.contentVersion,
          candidate.sourceId,
          candidate.channelId,
          candidate.title,
          candidate.publishedAt,
          candidate.updatedAt,
          candidate.discoveredBy,
          new Date().toISOString(),
          new Date().toISOString(),
        )
        .run()
      return existing ? 'updated' : 'inserted'
    },

    async markQueued(videoId, contentVersion, now = new Date()) {
      const nextAttempt = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
      await db
        .prepare(
          `UPDATE candidates SET status = 'queued', next_attempt_at = ?
           WHERE video_id = ? AND content_version = ?`,
        )
        .bind(nextAttempt, videoId, contentVersion)
        .run()
    },

    async markDispatched(videoId, contentVersion, now = new Date()) {
      const nextAttempt = new Date(now.getTime() + 5 * 60 * 1000).toISOString()
      await db
        .prepare(
          `UPDATE candidates SET status = 'dispatched', attempt_count = attempt_count + 1,
             next_attempt_at = ? WHERE video_id = ? AND content_version = ?`,
        )
        .bind(nextAttempt, videoId, contentVersion)
        .run()
    },

    async dueCandidates(now = new Date(), limit = 20) {
      const rows = await db
        .prepare(
          `SELECT video_id, source_id, content_version, channel_id, title, published_at FROM candidates
           WHERE attempt_count < 288 AND (
             status = 'pending' OR
             (status IN ('queued', 'dispatched', 'retry') AND next_attempt_at <= ?)
           ) ORDER BY first_seen_at LIMIT ?`,
        )
        .bind(now.toISOString(), limit)
        .all()
      return (rows.results ?? []).map((row) => ({
        videoId: row.video_id,
        sourceId: row.source_id,
        contentVersion: row.content_version,
        channelId: row.channel_id,
        title: row.title,
        publishedAt: row.published_at,
      }))
    },

    async recordCandidateResult(videoId, contentVersion, status, error = null, now = new Date()) {
      let nextAttempt = null
      if (status === 'retry') {
        const row = await db
          .prepare('SELECT attempt_count FROM candidates WHERE video_id = ? AND content_version = ?')
          .bind(videoId, contentVersion)
          .first()
        nextAttempt = new Date(
          now.getTime() + candidateRetryDelayMs(Number(row?.attempt_count ?? 0)),
        ).toISOString()
      }
      await db
        .prepare(
          `UPDATE candidates SET status = ?, next_attempt_at = ?, last_error = ?
           WHERE video_id = ? AND content_version = ?`,
        )
        .bind(status, nextAttempt, error, videoId, contentVersion)
        .run()
    },
  }
}

function decodeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
}

function xmlValue(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`))
  return match ? decodeXml(match[1].trim()) : null
}

export function parseYouTubeNotification(xml) {
  const videoId = xmlValue(xml, 'yt:videoId')
  const channelId = xmlValue(xml, 'yt:channelId')
  const title = xmlValue(xml, 'title')
  const publishedAt = xmlValue(xml, 'published')
  const updatedAt = xmlValue(xml, 'updated')
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null
  if (!channelId || !title || !publishedAt || !updatedAt) return null
  return { videoId, channelId, title, publishedAt, updatedAt }
}

export function parseYouTubeFeed(xml) {
  return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)]
    .map((match) => parseYouTubeNotification(match[1]))
    .filter(Boolean)
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function candidateContentVersion(title, publishedAt) {
  const published = new Date(publishedAt)
  if (!Number.isFinite(published.getTime())) throw new Error('invalid candidate publish time')
  return sha256Hex(JSON.stringify([title, published.toISOString()]))
}

function sourceForChannel(channelId) {
  return HIGHLIGHT_SOURCES.find((source) => source.channelId === channelId) ?? null
}

function channelFromTopic(topic) {
  try {
    const url = new URL(topic)
    if (url.origin !== 'https://www.youtube.com' || url.pathname !== '/feeds/videos.xml') return null
    return url.searchParams.get('channel_id')
  } catch {
    return null
  }
}

function queueCandidate(candidate) {
  return {
    videoId: candidate.videoId,
    sourceId: candidate.sourceId,
    contentVersion: candidate.contentVersion,
    channelId: candidate.channelId,
    title: candidate.title,
    publishedAt: candidate.publishedAt,
  }
}

export async function handleWebSubRequest(request, { store, queue, fetchImpl = fetch }) {
  if (request.method === 'GET') {
    const url = new URL(request.url)
    const mode = url.searchParams.get('hub.mode')
    const challenge = url.searchParams.get('hub.challenge')
    const channelId = channelFromTopic(url.searchParams.get('hub.topic') ?? '')
    if ((mode !== 'subscribe' && mode !== 'unsubscribe') || !challenge || !sourceForChannel(channelId)) {
      return new Response('unknown topic', { status: 404 })
    }
    const leaseSeconds = Number(url.searchParams.get('hub.lease_seconds'))
    await store?.recordSubscriptionVerification?.(channelId, mode, leaseSeconds)
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
  }

  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const parsed = parseYouTubeNotification(await request.text())
  const source = parsed ? sourceForChannel(parsed.channelId) : null
  if (!parsed) return new Response('invalid notification', { status: 400 })
  if (!source) return new Response('unknown channel', { status: 404 })
  await store.recordNotification?.(parsed.channelId)
  if (!isPotentialHighlight(source.id, parsed.title)) return new Response(null, { status: 204 })

  const feedResponse = await fetchImpl(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`,
  )
  if (!feedResponse.ok) return new Response('feed verification unavailable', { status: 503 })
  const verified = parseYouTubeFeed(await feedResponse.text()).find(
    (entry) => entry.videoId === parsed.videoId && entry.channelId === source.channelId,
  )
  if (!verified || !isPotentialHighlight(source.id, verified.title)) {
    return new Response(null, { status: 204 })
  }

  const contentVersion = await candidateContentVersion(verified.title, verified.publishedAt)
  const candidate = { ...verified, sourceId: source.id, contentVersion, discoveredBy: 'websub' }
  const result = await store.upsertCandidate(candidate)
  if (result !== 'unchanged') {
    await queue.send(queueCandidate(candidate))
    await store.markQueued?.(candidate.videoId, contentVersion)
  }
  return new Response(null, { status: 204 })
}

export async function runHighlightRecovery({
  now = new Date(),
  apiKey,
  store,
  queue,
  fetchImpl = fetch,
}) {
  const day = pacificQuotaDay(now)
  const used = await store.quotaUsed(day)
  const mode = quotaMode(used)
  const result = { mode, pagesFetched: 0, candidatesChanged: 0, errors: [] }
  if (mode === 'websub_only') return result
  if (mode === 'slow_shallow' && now.getUTCMinutes() % 2 !== 0) return result

  const deep = mode === 'normal' && now.getUTCMinutes() === 0
  for (const source of HIGHLIGHT_SOURCES) {
    const pageLimit = deep ? Math.ceil(source.scanDepth / 50) : 1
    let pageToken = ''
    for (let page = 0; page < pageLimit; page += 1) {
      const reserved = await store.consumeQuota(day, 'playlistItems.list', 1)
      if (!reserved) return result
      const url =
        'https://www.googleapis.com/youtube/v3/playlistItems' +
        `?part=snippet&maxResults=50&playlistId=${source.playlistId}&key=${apiKey}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
      try {
        const response = await fetchImpl(url)
        result.pagesFetched += 1
        if (!response.ok) {
          result.errors.push(`${source.id}:youtube_${response.status}`)
          break
        }
        const payload = await response.json()
        for (const item of payload.items ?? []) {
          const videoId = item.snippet?.resourceId?.videoId
          const title = item.snippet?.title
          const publishedAt = item.snippet?.publishedAt
          if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title || !publishedAt) continue
          if (!isPotentialHighlight(source.id, title)) continue
          const contentVersion = await candidateContentVersion(title, publishedAt)
          const candidate = {
            videoId,
            channelId: source.channelId,
            sourceId: source.id,
            title,
            publishedAt,
            updatedAt: publishedAt,
            contentVersion,
            discoveredBy: deep ? 'deep_poll' : 'shallow_poll',
          }
          const changed = await store.upsertCandidate(candidate)
          if (changed === 'unchanged') continue
          await queue.send(queueCandidate(candidate))
          await store.markQueued?.(videoId, contentVersion, now)
          result.candidatesChanged += 1
        }
        if (!payload.nextPageToken) break
        pageToken = payload.nextPageToken
      } catch (error) {
        result.errors.push(`${source.id}:${error instanceof Error ? error.message : String(error)}`)
        break
      }
    }
  }
  return result
}

export async function runFeedRecovery({ now = new Date(), store, queue, fetchImpl = fetch }) {
  const sourceResults = await Promise.all(HIGHLIGHT_SOURCES.map(async (source) => {
    const result = { feedsFetched: 0, candidatesChanged: 0, errors: [] }
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`
    try {
      const response = await fetchImpl(url)
      result.feedsFetched += 1
      if (!response.ok) {
        result.errors.push(`${source.id}:feed_${response.status}`)
        return result
      }
      for (const parsed of parseYouTubeFeed(await response.text())) {
        if (parsed.channelId !== source.channelId) continue
        if (!isPotentialHighlight(source.id, parsed.title)) continue
        const contentVersion = await candidateContentVersion(parsed.title, parsed.publishedAt)
        const candidate = {
          ...parsed,
          sourceId: source.id,
          contentVersion,
          discoveredBy: 'feed_poll',
        }
        const changed = await store.upsertCandidate(candidate)
        if (changed === 'unchanged') continue
        await queue.send(queueCandidate(candidate))
        await store.markQueued?.(parsed.videoId, contentVersion, now)
        result.candidatesChanged += 1
      }
    } catch (error) {
      result.errors.push(`${source.id}:${error instanceof Error ? error.message : String(error)}`)
    }
    return result
  }))
  return sourceResults.reduce(
    (total, result) => ({
      feedsFetched: total.feedsFetched + result.feedsFetched,
      candidatesChanged: total.candidatesChanged + result.candidatesChanged,
      errors: [...total.errors, ...result.errors],
    }),
    { feedsFetched: 0, candidatesChanged: 0, errors: [] },
  )
}

export async function renewWebSubSubscriptions({
  now = new Date(),
  callbackUrl,
  store,
  fetchImpl = fetch,
}) {
  const sourceResults = await Promise.all(HIGHLIGHT_SOURCES.map(async (source) => {
    if (!(await store.subscriptionDue(source.channelId, now))) {
      return { requested: 0, skipped: 1, errors: [] }
    }

    const topicUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`
    const body = new URLSearchParams({
      'hub.callback': callbackUrl,
      'hub.mode': 'subscribe',
      'hub.topic': topicUrl,
      'hub.verify': 'async',
      'hub.lease_seconds': '864000',
    })
    let error = null
    try {
      const response = await fetchImpl('https://pubsubhubbub.appspot.com/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      if (!response.ok) error = `hub_${response.status}`
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }
    await store.recordSubscriptionRequest(source.channelId, topicUrl, error, now)
    return error
      ? { requested: 0, skipped: 0, errors: [`${source.id}:${error}`] }
      : { requested: 1, skipped: 0, errors: [] }
  }))
  return sourceResults.reduce(
    (total, result) => ({
      requested: total.requested + result.requested,
      skipped: total.skipped + result.skipped,
      errors: [...total.errors, ...result.errors],
    }),
    { requested: 0, skipped: 0, errors: [] },
  )
}

export async function runHighlightIngestion({
  now = new Date(),
  apiKey,
  webSubCallbackUrl,
  store,
  queue,
  fetchImpl = fetch,
}) {
  const subscriptionsPromise = webSubCallbackUrl
    ? renewWebSubSubscriptions({ now, callbackUrl: webSubCallbackUrl, store, fetchImpl })
    : Promise.resolve(null)
  const feedPromise = runFeedRecovery({ now, store, queue, fetchImpl })
  const [subscriptions, feed] = await Promise.all([subscriptionsPromise, feedPromise])
  const api = apiKey && now.getUTCMinutes() === 0
    ? await runHighlightRecovery({ now, apiKey, store, queue, fetchImpl })
    : null
  const requeued = await enqueueDueCandidates(store, queue, now)
  return { subscriptions, feed, api, requeued }
}

export function createHighlightDispatchClient({
  token,
  owner,
  repo,
  ref = 'main',
  fetchImpl = fetch,
}) {
  return {
    async dispatch(candidate) {
      const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/curate-highlight.yml/dispatches`
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'nospoilersoccer-highlight-ingestion',
        },
        body: JSON.stringify({
          ref,
          inputs: {
            video_id: candidate.videoId,
            source_id: candidate.sourceId,
            content_version: candidate.contentVersion,
            channel_id: candidate.channelId,
            candidate_title: candidate.title,
            published_at: candidate.publishedAt,
          },
        }),
      })
      if (!response.ok) throw new Error(`GitHub highlight dispatch ${response.status}`)
    },
  }
}

export async function processHighlightQueue(batch, dispatchClient, store = null) {
  for (const message of batch.messages) {
    try {
      await dispatchClient.dispatch(message.body)
      await store?.markDispatched(message.body.videoId, message.body.contentVersion)
      message.ack()
    } catch {
      message.retry()
    }
  }
}

export async function enqueueDueCandidates(store, queue, now = new Date()) {
  const candidates = await store.dueCandidates(now)
  for (const candidate of candidates) {
    await queue.send(candidate)
    await store.markQueued(candidate.videoId, candidate.contentVersion, now)
  }
  return candidates.length
}

export async function handleCandidateResultRequest(request, { secret, store }) {
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 })
  }
  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  let body
  try {
    body = await request.json()
  } catch {
    return new Response('invalid json', { status: 400 })
  }
  if (
    !/^[A-Za-z0-9_-]{11}$/.test(body.videoId ?? '') ||
    typeof body.contentVersion !== 'string' ||
    !['accepted', 'retry', 'quarantined'].includes(body.status)
  ) {
    return new Response('invalid result', { status: 400 })
  }
  await store.recordCandidateResult(
    body.videoId,
    body.contentVersion,
    body.status,
    typeof body.error === 'string' ? body.error : null,
  )
  return new Response(null, { status: 204 })
}
