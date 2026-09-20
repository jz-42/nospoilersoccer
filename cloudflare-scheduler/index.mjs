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
const DEFAULT_HOT_STATE_BASE_URL =
  'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/public/api/hot-state'
const DEFAULT_HOT_STATE_URL = `${DEFAULT_HOT_STATE_BASE_URL}/wc2026.json`
const DEFAULT_HIGHLIGHT_STATE_BASE_URL =
  'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/public/api/highlights'

// Seasons the hot-state endpoint will serve. An allowlist rather than a
// passthrough so the Worker cannot be pointed at arbitrary raw.githubusercontent
// paths, and so an unknown season is a clean 404 instead of a 502.
export const HOT_STATE_SEASON_IDS = ['wc2026', 'eng1-2026', 'esp1-2026', 'ucl-2026']

const HOT_STATE_PATH_PATTERN = /^\/api\/hot-state\/([A-Za-z0-9-]+)$/
const HIGHLIGHT_STATE_PATH_PATTERN = /^\/api\/highlights\/([A-Za-z0-9-]+)$/

const GROUP_START_OFFSET_MINUTES = 90
const GROUP_END_OFFSET_MINUTES = 8 * 60
const KNOCKOUT_START_OFFSET_MINUTES = 90
const KNOCKOUT_END_OFFSET_MINUTES = 12 * 60
const DATE_ONLY_KNOCKOUT_END_OFFSET_MINUTES = 36 * 60

export function parseMatchKickoffs(sourceText) {
  const matchesById = new Map()
  const matchObjectRegex = /\{\s*id:\s*'((?:[A-L]\d+)|(?:m\d+))'/g

  for (const match of sourceText.matchAll(matchObjectRegex)) {
    const matchId = match[1]
    const objectText = readObjectAt(sourceText, match.index)
    if (!objectText) continue

    const kickoffValue = objectText.match(/\bkickoff:\s*'([^']+)'/)?.[1]
    if (kickoffValue) {
      const kickoff = new Date(kickoffValue)
      if (Number.isNaN(kickoff.getTime())) continue

      matchesById.set(matchId, {
        matchId,
        phase: matchId.startsWith('m') ? 'knockout' : 'group',
        kickoff,
        dateOnly: false,
      })
      continue
    }

    if (!matchId.startsWith('m')) continue
    const date = objectText.match(/\bdate:\s*'(\d{4}-\d{2}-\d{2})'/)?.[1]
    if (!date) continue

    const dateStart = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(dateStart.getTime())) continue

    matchesById.set(matchId, {
      matchId,
      phase: 'knockout',
      date,
      dateOnly: true,
    })
  }

  return Array.from(matchesById.values())
}

function readObjectAt(sourceText, start) {
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
    if (ch === '{') depth += 1
    if (ch === '}') {
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
      phase: match.phase,
      date: match.date,
      windowStart: dateStart.toISOString(),
      windowEnd: addMinutes(dateStart, DATE_ONLY_KNOCKOUT_END_OFFSET_MINUTES).toISOString(),
    }
  }

  const startOffset =
    match.phase === 'knockout' ? KNOCKOUT_START_OFFSET_MINUTES : GROUP_START_OFFSET_MINUTES
  const endOffset =
    match.phase === 'knockout' ? KNOCKOUT_END_OFFSET_MINUTES : GROUP_END_OFFSET_MINUTES

  return {
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
  const scheduleText = await fetchSchedule()
  const matches = parseMatchKickoffs(scheduleText)
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

async function fetchScheduleText(env) {
  const url = env.SCHEDULE_URL || DEFAULT_SCHEDULE_URL
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Schedule fetch failed: ${response.status}`)
  }
  return response.text()
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
  const scheduleText = await fetchScheduleText(env)
  const report = buildWindowReport(parseMatchKickoffs(scheduleText), new Date())
  return json({
    ok: true,
    note: 'Diagnostic only. This endpoint does not trigger GitHub Actions.',
    now: report.now,
    insideWindow: report.insideWindow,
    activeWindowCount: report.activeWindowCount,
    activeWindows: report.activeWindows,
    parsedMatchCount: report.parsedMatchCount,
    // Windows are parsed from wc2026.ts only; club competitions run year-round
    // and dispatch is no longer window-gated, so they need no window source.
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
    fetchSchedule: () => fetchScheduleText(env),
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
  const response = await fetchImpl(sourcePath, {
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
        fetchSchedule: () => fetchScheduleText(env),
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
