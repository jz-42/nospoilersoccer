const DEFAULT_SCHEDULE_URL =
  'https://raw.githubusercontent.com/jz-42/nospoilersoccer/main/src/data/wc2026.ts'

const GROUP_START_OFFSET_MINUTES = 90
const GROUP_END_OFFSET_MINUTES = 8 * 60
const KNOCKOUT_START_OFFSET_MINUTES = 90
const KNOCKOUT_END_OFFSET_MINUTES = 12 * 60

export function parseMatchKickoffs(sourceText) {
  const matches = []
  const regex = /\{\s*id:\s*'((?:[A-L]\d+)|(?:m\d+))'[\s\S]*?kickoff:\s*'([^']+)'/g

  for (const match of sourceText.matchAll(regex)) {
    const matchId = match[1]
    const kickoff = new Date(match[2])
    if (Number.isNaN(kickoff.getTime())) continue

    matches.push({
      matchId,
      phase: matchId.startsWith('m') ? 'knockout' : 'group',
      kickoff,
    })
  }

  return matches
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function toWindow(match) {
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
  if (!insideWindow) return 'skip_outside_window'
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
}) {
  const scheduleText = await fetchSchedule()
  const matches = parseMatchKickoffs(scheduleText)
  const report = buildWindowReport(matches, now)

  let activeRunCount = 0
  let action = 'skip_outside_window'
  let github = null

  if (report.insideWindow) {
    try {
      activeRunCount = await githubClient.getActiveRunCount()
      action = chooseAction({ insideWindow: report.insideWindow, activeRunCount })

      if (action === 'dispatch') {
        await githubClient.dispatchWorkflow()
      }
    } catch (error) {
      action = 'error'
      github = safeGitHubError(error)
    }
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '') {
      return handleDiagnosticRequest(env)
    }
    if (url.pathname === '/admin/test-dispatch') {
      return handleAdminTest(url, env)
    }
    return json({ ok: false, error: 'not_found' }, 404)
  },

  async scheduled(_controller, env) {
    await runScheduler({
      now: new Date(),
      fetchSchedule: () => fetchScheduleText(env),
      githubClient: createEnvGitHubClient(env),
    })
  },
}
