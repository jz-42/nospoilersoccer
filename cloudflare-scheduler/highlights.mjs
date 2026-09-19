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
  golazo: /^.+?\s+vs\.?\s+.+?:\s+(?:Extended\s+)?Highlights\b/i,
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
  const shallow = sources.length * 24 * 60
  const deep = deepScanPageCost(sources) * 24
  return shallow + deep
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
          `SELECT video_id, source_id, content_version FROM candidates
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
      }))
    },

    async recordCandidateResult(videoId, contentVersion, status, error = null, now = new Date()) {
      const nextAttempt = status === 'retry'
        ? new Date(now.getTime() + 5 * 60 * 1000).toISOString()
        : null
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

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
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

export async function handleWebSubRequest(request, { store, queue }) {
  if (request.method === 'GET') {
    const url = new URL(request.url)
    const mode = url.searchParams.get('hub.mode')
    const challenge = url.searchParams.get('hub.challenge')
    const channelId = channelFromTopic(url.searchParams.get('hub.topic') ?? '')
    if ((mode !== 'subscribe' && mode !== 'unsubscribe') || !challenge || !sourceForChannel(channelId)) {
      return new Response('unknown topic', { status: 404 })
    }
    return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
  }

  if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
  const parsed = parseYouTubeNotification(await request.text())
  const source = parsed ? sourceForChannel(parsed.channelId) : null
  if (!parsed) return new Response('invalid notification', { status: 400 })
  if (!source) return new Response('unknown channel', { status: 404 })
  if (!isPotentialHighlight(source.id, parsed.title)) return new Response(null, { status: 204 })

  const contentVersion = await sha256Hex(
    JSON.stringify([parsed.title, parsed.publishedAt, parsed.updatedAt]),
  )
  const candidate = { ...parsed, sourceId: source.id, contentVersion, discoveredBy: 'websub' }
  const result = await store.upsertCandidate(candidate)
  if (result !== 'unchanged') {
    await queue.send({ videoId: candidate.videoId, sourceId: source.id, contentVersion })
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
          const contentVersion = await sha256Hex(JSON.stringify([title, publishedAt, publishedAt]))
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
          await queue.send({ videoId, sourceId: source.id, contentVersion })
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
