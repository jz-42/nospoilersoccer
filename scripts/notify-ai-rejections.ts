import { existsSync, readFileSync } from 'fs'

export const AI_REJECTION_ALERT_ISSUE_TITLE = 'AI highlight curator alerts'

export interface AiRejectionAlertItem {
  matchId: string
  source: 'fox' | 'youtube'
  id: string
  reason: string
  at?: string
}

function assertEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing required env ${name}`)
  return value
}

async function github<T>(path: string, init?: RequestInit): Promise<T> {
  const token = assertEnv('GITHUB_TOKEN')
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'nospoilersoccer-ai-rejection-alert',
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json() as Promise<T>
}

export function buildAiRejectionIssueComment(args: {
  mention: string
  runUrl: string
  cycle: number
  rejections: AiRejectionAlertItem[]
}): string {
  const lines = [
    `@${args.mention} the highlight curator AI rejected ${args.rejections.length} new video${args.rejections.length === 1 ? '' : 's'} in cycle ${args.cycle}.`,
    '',
    `Run: ${args.runUrl}`,
    '',
    'Spoiler-safe summary:',
    ...args.rejections.map((r) => `- ${r.matchId} (${r.source} ${r.id}) — ${r.reason}`),
    '',
    `Alert keys: ${args.rejections.map((r) => `${r.source}:${r.id}`).join(', ')}`,
    '',
    'Titles and model verdicts stay in the repo rejection ledger to avoid leaking spoilers here.',
  ]
  return lines.join('\n')
}

function alertKey(rejection: Pick<AiRejectionAlertItem, 'source' | 'id'>): string {
  return `${rejection.source}:${rejection.id}`
}

export function extractAlertKeysFromComment(body: string): Set<string> {
  const matches = body.match(/\b(?:youtube|fox):[A-Za-z0-9_-]+\b/g) ?? []
  return new Set(matches)
}

export function findUnalertedRejections(
  rejections: AiRejectionAlertItem[],
  existingCommentBodies: string[],
): AiRejectionAlertItem[] {
  const seen = new Set<string>()
  for (const body of existingCommentBodies) {
    for (const key of extractAlertKeysFromComment(body)) seen.add(key)
  }
  return rejections.filter((rejection) => !seen.has(alertKey(rejection)))
}

function loadRejectionLedger(file: string): AiRejectionAlertItem[] {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Partial<AiRejectionAlertItem>>
  return Object.values(raw)
    .map((r) => ({
      matchId: String(r?.matchId ?? ''),
      source: r?.source === 'fox' ? 'fox' : 'youtube',
      id: String(r?.id ?? ''),
      reason: String(r?.reason ?? ''),
      at: r?.at ? String(r.at) : undefined,
    }))
    .filter((r) => r.matchId && r.id && r.reason)
    .sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')))
}

async function ensureAlertIssue(owner: string, repo: string): Promise<number> {
  const issues = await github<{ number: number; title: string }[]>(
    `/repos/${owner}/${repo}/issues?state=open&per_page=100`,
  )
  const existing = issues.find((issue) => issue.title === AI_REJECTION_ALERT_ISSUE_TITLE)
  if (existing) return existing.number

  const created = await github<{ number: number }>(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: AI_REJECTION_ALERT_ISSUE_TITLE,
      body: [
        'Best-effort alert thread for spoiler-safe highlight curator AI rejections.',
        '',
        'The updater should continue normally when a single video is rejected.',
        'This issue exists only to trigger GitHub notifications without failing the workflow.',
      ].join('\n'),
    }),
  })
  return created.number
}

async function listIssueCommentBodies(owner: string, repo: string, issueNumber: number): Promise<string[]> {
  const bodies: string[] = []
  for (let page = 1; ; page++) {
    const comments = await github<{ body?: string }[]>(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
    )
    if (comments.length === 0) break
    bodies.push(...comments.map((comment) => comment.body ?? ''))
    if (comments.length < 100) break
  }
  return bodies
}

async function postAlertComment(args: {
  owner: string
  repo: string
  mention: string
  runUrl: string
  cycle: number
  rejections: AiRejectionAlertItem[]
}) {
  const issueNumber = await ensureAlertIssue(args.owner, args.repo)
  const existingCommentBodies = await listIssueCommentBodies(args.owner, args.repo, issueNumber)
  const pending = findUnalertedRejections(args.rejections, existingCommentBodies)
  if (pending.length === 0) {
    console.log('AI rejection alert issue already covers every current rejection; skipping')
    return
  }
  await github(`/repos/${args.owner}/${args.repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      body: buildAiRejectionIssueComment({
        mention: args.mention,
        runUrl: args.runUrl,
        cycle: args.cycle,
        rejections: pending,
      }),
    }),
  })
}

if (import.meta.main) {
  const file = process.argv[2]
  if (!file) throw new Error('usage: tsx scripts/notify-ai-rejections.ts <curate-ai-rejections.json>')
  if (!existsSync(file)) {
    console.log(`no AI rejection ledger at ${file}; skipping`)
    process.exit(0)
  }

  const rejections = loadRejectionLedger(file)
  if (rejections.length === 0) {
    console.log('AI rejection ledger empty; skipping')
    process.exit(0)
  }

  const [owner, repo] = assertEnv('GITHUB_REPOSITORY').split('/')
  if (!owner || !repo) throw new Error('invalid GITHUB_REPOSITORY')
  const mention = process.env.AI_REJECTION_ALERT_MENTION ?? owner
  const runUrl =
    process.env.GITHUB_RUN_URL ?? `${assertEnv('GITHUB_SERVER_URL')}/${owner}/${repo}/actions/runs/${assertEnv('GITHUB_RUN_ID')}`

  await postAlertComment({
    owner,
    repo,
    mention,
    runUrl,
    cycle: Number(process.env.CURATOR_CYCLE ?? 0),
    rejections,
  })
  console.log(`processed AI rejection alert check for ${rejections.length} video(s)`)
}
