import {
  createD1HighlightStore,
  createHighlightDispatchClient,
  handleCandidateResultRequest,
  handleWebSubRequest,
  processHighlightQueue,
  runHighlightIngestion,
} from './highlights.mjs'

const DEFAULT_SCHEDULE_URL =
  'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/src/data/wc2026.ts'
const DEFAULT_NATIONS_SCHEDULE_URL =
  'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/src/data/nations/unl-2026.ts'
const DEFAULT_HOT_STATE_BASE_URL =
  'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/public/api/hot-state'
const DEFAULT_HOT_STATE_URL = `${DEFAULT_HOT_STATE_BASE_URL}/wc2026.json`
const DEFAULT_HIGHLIGHT_STATE_BASE_URL =
  'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/public/api/highlights'

// Seasons the hot-state endpoint will serve. An allowlist rather than a
// passthrough so the Worker cannot be pointed at arbitrary raw.githubusercontent
// paths, and so an unknown season is a clean 404 instead of a 502.
export const HOT_STATE_SEASON_IDS = ['wc2026', 'unl-2026', 'eng1-2026', 'esp1-2026', 'ucl-2026']

const HOT_STATE_PATH_PATTERN = /^\/api\/hot-state\/([A-Za-z0-9-]+)$/
const HIGHLIGHT_STATE_PATH_PATTERN = /^\/api\/highlights\/([A-Za-z0-9-]+)$/

const GROUP_START_OFFSET_MINUTES = 90
const NATIONS_GROUP_START_OFFSET_MINUTES = 105
const GROUP_END_OFFSET_MINUTES = 8 * 60
const KNOCKOUT_START_OFFSET_MINUTES = 90
const KNOCKOUT_END_OFFSET_MINUTES = 12 * 60
const DATE_ONLY_KNOCKOUT_END_OFFSET_MINUTES = 36 * 60

export function parseMatchKickoffs(sourceText, seasonId = 'wc2026') {
  const matchesById = new Map()
  const fixtureArrays = []
  const groupMatches = readPropertyArray(sourceText, 'groupMatches')
  if (groupMatches) fixtureArrays.push({ source: groupMatches, phase: 'group' })
  const knockoutRounds = readPropertyArray(sourceText, 'knockoutRounds')
  if (knockoutRounds) {
    const matchesRegex = /(?:\bmatches|["']matches["'])\s*:\s*\[/g
    for (const match of knockoutRounds.matchAll(matchesRegex)) {
      const matches = readDelimitedAt(knockoutRounds, match.index + match[0].lastIndexOf('['), '[', ']')
      if (matches) fixtureArrays.push({ source: matches, phase: 'knockout' })
    }
  }

  for (const { source, phase } of fixtureArrays) {
    const matchObjectRegex = /\{\s*(?:id|["']id["'])\s*:\s*(["'])([A-Za-z0-9-]+)\1/g
    let match
    while ((match = matchObjectRegex.exec(source)) !== null) {
      const matchId = match[2]
      const objectText = readObjectAt(source, match.index)
      if (!objectText) continue
      matchObjectRegex.lastIndex = match.index + objectText.length

      const kickoffValue = objectText.match(/(?:\bkickoff|["']kickoff["'])\s*:\s*["']([^"']+)["']/)?.[1]
      if (kickoffValue) {
        const kickoff = new Date(kickoffValue)
        if (Number.isNaN(kickoff.getTime())) continue

        matchesById.set(matchId, { seasonId, matchId, phase, kickoff, dateOnly: false })
        continue
      }

      if (phase !== 'knockout') continue
      const date = objectText.match(/\bdate:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1]
      if (!date) continue

      const dateStart = new Date(`${date}T00:00:00Z`)
      if (Number.isNaN(dateStart.getTime())) continue

      matchesById.set(matchId, { seasonId, matchId, phase, date, dateOnly: true })
    }
  }

  return Array.from(matchesById.values())
}

export function parseScheduleSources(sources) {
  const deduplicated = new Map()
  for (const { seasonId, sourceText } of sources) {
    for (const match of parseMatchKickoffs(sourceText, seasonId)) {
      deduplicated.set(`${seasonId}:${match.matchId}`, match)
    }
  }
  return [...deduplicated.values()]
}

function readObjectAt(sourceText, start) {
  return readDelimitedAt(sourceText, start, '{', '}')
}

function readPropertyArray(sourceText, property) {
  const pattern = new RegExp(`(?:\\b${property}|["']${property}["'])\\s*:\\s*\\[`)
  const match = pattern.exec(sourceText)
  return match ? readDelimitedAt(sourceText, match.index + match[0].lastIndexOf('['), '[', ']') : null
}

function readDelimitedAt(sourceText, start, opening, closing) {
  let depth = 0
  let quote = null
  let escaped = false

  for (let i = start; i < sourceText.length; i += 1) {
    const ch = sourceText[i]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === quote) {
        quote = null
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === opening) depth += 1
    if (ch === closing) {
      depth -= 1
      if (depth === 0) return sourceText.slice(start, i + 1)
    }
  }

  return null
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function toWindow(match) {
  if (match.dateOnly) {
    const dateStart = new Date(`${match.date}T00:00:00Z`)
    return {
      matchId: match.matchId,
      seasonId: match.seasonId,
      phase: match.phase,
      date: match.date,
      windowStart: dateStart.toISOString(),
      windowEnd: addMinutes(dateStart, DATE_ONLY_KNOCKOUT_END_OFFSET_MINUTES).toISOString(),
    }
  }

  const startOffset = match.phase === 'knockout'
    ? KNOCKOUT_START_OFFSET_MINUTES
    : match.seasonId === 'unl-2026'
      ? NATIONS_GROUP_START_OFFSET_MINUTES
      : GROUP_START_OFFSET_MINUTES
  const endOffset =
    match.phase === 'knockout' ? KNOCKOUT_END_OFFSET_MINUTES : GROUP_END_OFFSET_MINUTES

  return {
    seasonId: match.seasonId,
    matchId: match.matchId,
    phase: match.phase,
    kickoff: match.kickoff.toISOString(),
    windowStart: addMinutes(match.kickoff, startOffset).toISOString(),
    windowEnd: addMinutes(match.kickoff, endOffset).toISOString(),
  }
}

export function buildWindowReport(matches, now = new Date()) {
  const activeWindows = matches
    .map(toWindow)
    .filter((window) => now >= new Date(window.windowStart) && now <= new Date(window.windowEnd))

  return {
    now: now.toISOString(),
    insideWindow: activeWindows.length > 0,
    activeWindowCount: activeWindows.length,
    activeWindows,
    parsedMatchCount: matches.length,
  }
}

export function chooseAction({ insideWindow, activeRunCount }) {
  if (activeRunCount > 0) return 'skip_active_run'
  return 'dispatch'
}

async function parseJsonResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

export function createGitHubClient({
  token,
  owner,
  repo,
  workflowFile,
  ref,
  fetchImpl = fetch,
}) {
  const baseHeaders = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'nospoilersoccer-scheduler',
  }

  return {
    async getActiveRunCount() {
      const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs?per_page=20`
      const response = await fetchImpl(url, { headers: baseHeaders })
      if (!response.ok) {
        const body = await parseJsonResponse(response)
        const error = new Error(`GitHub runs API ${response.status}`)
        error.status = response.status
        error.body = body
        throw error
      }

      const payload = await response.json()
      return (payload.workflow_runs ?? []).filter((run) => run.status !== 'completed').length
    },

    async dispatchWorkflow() {
      const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref }),
      })

      if (!response.ok) {
        const body = await parseJsonResponse(response)
        const error = new Error(`GitHub dispatch API ${response.status}`)
        error.status = response.status
        error.body = body
        throw error
      }
    },
  }
}

function safeGitHubError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    status: typeof error?.status === 'number' ? error.status : null,
    body: error?.body ?? null,
  }
}

export async function runScheduler({
  now = new Date(),
  fetchSchedule,
  githubClient,
  logger = (entry) => console.log(JSON.stringify(entry)),
  throwOnError = false,
}) {
  const schedulePayload = await fetchSchedule()
  const matches = typeof schedulePayload === 'string'
    ? parseMatchKickoffs(schedulePayload)
    : parseScheduleSources(schedulePayload)
  const report = buildWindowReport(matches, now)

  let activeRunCount = 0
  let action = 'pending'
  let github = null
  let caughtError = null

  try {
    activeRunCount = await githubClient.getActiveRunCount()
    action = chooseAction({ insideWindow: report.insideWindow, activeRunCount })

    if (action === 'dispatch') {
      await githubClient.dispatchWorkflow()
    }
  } catch (error) {
    action = 'error'
    github = safeGitHubError(error)
    caughtError = error
  }

  const entry = {
    now: report.now,
    insideWindow: report.insideWindow,
    activeWindowCount: report.activeWindowCount,
    activeRunCount,
    action,
    ...(github ? { github } : {}),
  }

  logger(entry)

  if (throwOnError && caughtError) throw caughtError

  return {
    ...report,
    activeRunCount,
    action,
    ...(github ? { github } : {}),
  }
}

function getRequiredEnv(env, key) {
  const value = env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

async function fetchScheduleSources(env) {
  const sources = [
    { seasonId: 'wc2026', url: env.SCHEDULE_URL || DEFAULT_SCHEDULE_URL },
    { seasonId: 'unl-2026', url: env.NATIONS_SCHEDULE_URL || DEFAULT_NATIONS_SCHEDULE_URL },
  ]
  return Promise.all(sources.map(async ({ seasonId, url }) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${seasonId} schedule fetch failed: ${response.status}`)
    return { seasonId, sourceText: await response.text() }
  }))
}

function createEnvGitHubClient(env) {
  return createGitHubClient({
    token: getRequiredEnv(env, 'GITHUB_TOKEN'),
    owner: env.GITHUB_OWNER || 'jz-42',
    repo: env.GITHUB_REPO || 'nospoilersoccer',
    workflowFile: env.GITHUB_WORKFLOW || 'update-results.yml',
    ref: env.GITHUB_REF || 'main',
  })
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  })
}

function corsHeaders(extraHeaders = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type, if-none-match',
    ...extraHeaders,
  }
}

async function handleDiagnosticRequest(env) {
  const scheduleSources = await fetchScheduleSources(env)
  const report = buildWindowReport(parseScheduleSources(scheduleSources), new Date())
  return json({
    ok: true,
    note: 'Diagnostic only. This endpoint does not trigger GitHub Actions.',
    now: report.now,
    insideWindow: report.insideWindow,
    activeWindowCount: report.activeWindowCount,
    activeWindows: report.activeWindows,
    parsedMatchCount: report.parsedMatchCount,
    // Club competitions run year-round and dispatch is no longer window-gated,
    // so only the two national-team schedules need explicit window sources.
    hotStateSeasons: HOT_STATE_SEASON_IDS,
  })
}

async function handleAdminTest(url, env) {
  const expected = env.SCHEDULER_TEST_SECRET
  const provided = url.searchParams.get('secret')
  if (!expected || provided !== expected) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  const result = await runScheduler({
    now: new Date(),
    fetchSchedule: () => fetchScheduleSources(env),
    githubClient: createEnvGitHubClient(env),
  })

  return json({ ok: true, mode: 'admin_test', result })
}

/**
 * Resolve the raw source URL for a season's hot-state snapshot.
 *
 * `wc2026` keeps honouring the single-season `HOT_STATE_URL` override so its
 * resolved path — and therefore the `sourcePath` echoed in the payload — stays
 * byte-identical to what the live site polls today.
 */
export function hotStateSourceUrl(env, seasonId) {
  if (seasonId === 'wc2026' && env.HOT_STATE_URL) return env.HOT_STATE_URL
  const base = env.HOT_STATE_BASE_URL || DEFAULT_HOT_STATE_BASE_URL
  return `${base}/${seasonId}.json`
}

export function highlightStateSourceUrl(env, seasonId) {
  const base = env.HIGHLIGHT_STATE_BASE_URL || DEFAULT_HIGHLIGHT_STATE_BASE_URL
  return `${base}/${seasonId}.json`
}

export async function handleHighlightStateRequest(
  env,
  request,
  fetchImpl = fetch,
  seasonId = 'wc2026',
) {
  const sourcePath = highlightStateSourceUrl(env, seasonId)
  const sourceUrl = new URL(sourcePath)
  // raw.githubusercontent.com advertises a five-minute cache. A short bucket
  // in the upstream cache key prevents that CDN from hiding a newly committed
  // highlight behind data older than this endpoint's own 15-second contract.
  sourceUrl.searchParams.set('refresh', String(Math.floor(Date.now() / 15_000)))
  const response = await fetchImpl(sourceUrl.toString(), {
    headers: { Accept: 'application/json' },
    cf: { cacheEverything: true, cacheTtl: 15 },
  })

  if (!response.ok) {
    return json(
      { ok: false, error: 'highlight_state_fetch_failed', status: response.status },
      502,
      corsHeaders({ 'cache-control': 'no-store' }),
    )
  }

  const payload = await response.json()
  const etag = `"${payload.version}"`
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: corsHeaders({ etag, 'cache-control': 'public, max-age=15' }),
    })
  }
  return json(payload, 200, corsHeaders({ etag, 'cache-control': 'public, max-age=15' }))
}

export async function handleHotStateRequest(env, fetchImpl = fetch, seasonId = 'wc2026') {
  const sourcePath = hotStateSourceUrl(env, seasonId)
  const response = await fetchImpl(sourcePath, {
    headers: { Accept: 'application/json' },
    cf: { cacheEverything: true, cacheTtl: 60 },
  })

  if (!response.ok) {
    return json(
      { ok: false, error: 'hot_state_fetch_failed', status: response.status },
      502,
      corsHeaders({ 'cache-control': 'no-store' }),
    )
  }

  const payload = await response.json()
  return json(
    {
      ...payload,
      generatedAt: new Date().toISOString(),
      sourceLastModified: response.headers.get('last-modified'),
      sourcePath,
    },
    200,
    corsHeaders({ 'cache-control': 'public, max-age=60' }),
  )
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }
    if (url.pathname === '/' || url.pathname === '') {
      return handleDiagnosticRequest(env)
    }
    if (url.pathname === '/admin/test-dispatch') {
      return handleAdminTest(url, env)
    }
    if (url.pathname === '/websub/youtube') {
      const store = env.HIGHLIGHT_DB ? createD1HighlightStore(env.HIGHLIGHT_DB) : null
      if (request.method === 'POST' && (!store || !env.HIGHLIGHT_QUEUE)) {
        return json({ ok: false, error: 'highlight_ingestion_not_configured' }, 503)
      }
      return handleWebSubRequest(request, {
        store,
        queue: env.HIGHLIGHT_QUEUE,
      })
    }
    if (url.pathname === '/admin/highlight-result') {
      if (!env.HIGHLIGHT_DB) {
        return json({ ok: false, error: 'highlight_ingestion_not_configured' }, 503)
      }
      return handleCandidateResultRequest(request, {
        secret: env.HIGHLIGHT_CALLBACK_SECRET,
        store: createD1HighlightStore(env.HIGHLIGHT_DB),
      })
    }
    const hotStateMatch = url.pathname.match(HOT_STATE_PATH_PATTERN)
    if (hotStateMatch) {
      const seasonId = hotStateMatch[1]
      if (!HOT_STATE_SEASON_IDS.includes(seasonId)) {
        return json(
          { ok: false, error: 'unknown_season', seasonId, known: HOT_STATE_SEASON_IDS },
          404,
          corsHeaders({ 'cache-control': 'no-store' }),
        )
      }
      return handleHotStateRequest(env, fetch, seasonId)
    }
    const highlightStateMatch = url.pathname.match(HIGHLIGHT_STATE_PATH_PATTERN)
    if (highlightStateMatch) {
      const seasonId = highlightStateMatch[1]
      if (!HOT_STATE_SEASON_IDS.includes(seasonId)) {
        return json(
          { ok: false, error: 'unknown_season', seasonId, known: HOT_STATE_SEASON_IDS },
          404,
          corsHeaders({ 'cache-control': 'no-store' }),
        )
      }
      return handleHighlightStateRequest(env, request, fetch, seasonId)
    }
    return json({ ok: false, error: 'not_found' }, 404)
  },

  async scheduled(_controller, env) {
    const now = new Date()
    const jobs = [
      runScheduler({
        now,
        fetchSchedule: () => fetchScheduleSources(env),
        githubClient: createEnvGitHubClient(env),
        throwOnError: true,
      }),
    ]
    if (env.HIGHLIGHT_DB && env.HIGHLIGHT_QUEUE) {
      const store = createD1HighlightStore(env.HIGHLIGHT_DB)
      jobs.push(
        runHighlightIngestion({
          now,
          apiKey: env.YOUTUBE_API_KEY,
          webSubCallbackUrl: env.WEBSUB_CALLBACK_URL,
          nationsHotStateUrl: hotStateSourceUrl(env, 'unl-2026'),
          nationsHighlightStateUrl: highlightStateSourceUrl(env, 'unl-2026'),
          store,
          queue: env.HIGHLIGHT_QUEUE,
        }),
      )
    }
    const results = await Promise.allSettled(jobs)
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason))
  },

  async queue(batch, env) {
    await processHighlightQueue(
      batch,
      createHighlightDispatchClient({
        token: getRequiredEnv(env, 'GITHUB_TOKEN'),
        owner: env.GITHUB_OWNER || 'jz-42',
        repo: env.GITHUB_REPO || 'nospoilersoccer',
        ref: env.GITHUB_REF || 'main',
      }),
      env.HIGHLIGHT_DB ? createD1HighlightStore(env.HIGHLIGHT_DB) : null,
    )
  },
}
