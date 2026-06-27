#!/usr/bin/env node
/**
 * Automatic spoiler-safe entertainment summary curator for World Cup 2026.
 *
 *   npx tsx scripts/curate-entertainment.ts
 *   npx tsx scripts/curate-entertainment.ts --dry-run
 *
 * For finished matches missing an entertainment verdict, the curator:
 *   1. collects broad public-reaction snippets from public web search
 *   2. asks a model for a 1-2 sentence spoiler-safe entertainment synthesis
 *      plus a 1..5 entertainment rating
 *   3. validates the response conservatively
 *   4. writes it to src/data/wc2026-entertainment.ts
 *
 * FAIL CLOSED throughout: if the signal is weak, the response is unsafe, or
 * the model/API misbehaves, the match stays without a summary.
 */
import { writeFileSync } from 'fs'
import { pathToFileURL } from 'url'
import { tournaments } from '../src/data'
import type { EntertainmentRating, GroupMatch, KnockoutMatch } from '../src/data/types'
import { isPlayed } from '../src/logic/spoilers'
import { wc2026Entertainment, type EntertainmentEntry } from '../src/data/wc2026-entertainment'

const FILE = 'src/data/wc2026-entertainment.ts'
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.4'
const EFFORT = process.env.OPENAI_REASONING_EFFORT ?? 'medium'
const BASE_URL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
const AUDIT_FILE = process.env.ENTERTAINMENT_AUDIT_FILE
const dryRun = process.argv.includes('--dry-run')
const AI_ENABLED = Boolean(process.env.OPENAI_API_KEY)
export const ENTERTAINMENT_PROMPT_VERSION = 'entertainment-v2-agnostic-2026-06-27'
const MIN_AGE_MINUTES = 150
const MAX_SEARCH_RESULTS = 6
const SEARCH_QUERIES_PER_MATCH = 2
const MAX_SUMMARY_ATTEMPTS = 2
const MIN_SNIPPETS = 4
const MAX_MATCHES_PER_RUN = Number(process.env.ENTERTAINMENT_MAX_MATCHES_PER_RUN ?? 12)
const SEARCH_TIMEOUT_MS = Number(process.env.ENTERTAINMENT_SEARCH_TIMEOUT_MS ?? 15000)
const MODEL_TIMEOUT_MS = Number(process.env.ENTERTAINMENT_MODEL_TIMEOUT_MS ?? 45000)

const SYSTEM = `You write a spoiler-safe entertainment summary for a soccer match on a no-spoilers highlights site.

You are given broad public-reaction snippets about one match. These may include news reports, liveblogs, fan comments, forum posts, and other public reactions.

Write JSON only:
{"suitable": boolean, "rating": 1|2|3|4|5, "summary": string, "reason": string}

Rules:
- Write exactly 1 or 2 concise sentences when suitable is true.
- Help a user get only a rough sense of whether the match felt entertaining, engaging, tense, lively, flat, open, cagey, or routine.
- Focus on neutral entertainment texture for the viewer, not tactical analysis and not recommendation language.
- Keep the summary agnostic: the user should not learn which team drove the match, whether one side was stronger, or how the match developed.
- Sound modest, not certain.
- Do not begin the summary with "Public reaction", "The overall reaction", or similar framing.
- Do not mention team names, country names, player names, fanbases, or supporters tied to a team.

Do not mention or imply:
- the score
- goal count
- who won, lost, or drew
- one-sidedness, dominance, imbalance, control, resistance, underdog dynamics, defensive mistakes, or which side created more
- specific match events, timing, appeals, weather delays, standout saves, individual displays, or talking points
- late drama, equalizers, comebacks, upsets, penalties, red cards
- qualification or elimination stakes in a way that gives away the result
- whether the user should watch extended highlights, quick highlights, or skip
- strong recommendation language like "must-watch", "skip it", or "watch the longer highlights"

Good summary style:
- "Lively and open-feeling, with enough rhythm to sound more engaging than routine."
- "Cagey and tense rather than free-flowing, with the entertainment seeming to come more from atmosphere and uncertainty than constant action."
- "Flat for long spells, with only modest signs that the atmosphere lifted it beyond a routine watch."

Bad summary style:
- "It was one-sided but still lively."
- "The home support carried the atmosphere."
- "One team controlled most of the attacking."
- "An early goal gave it immediate tension."

Set suitable to false if the snippets are too thin, too noisy, too contradictory, or you cannot write a spoiler-safe answer confidently.`

const RETRY_NOTE =
  'Your previous draft was not usable for this site. Rewrite it more abstractly. Avoid any match-shape clues, team-specific references, or event-specific details.'

const SUMMARY_SPOILER_RE =
  /\b(win|won|loss|lose|lost|draw|drew|tie|tied|equali[sz]er|comeback|stoppage|penalt|red card|advance|advanced|qualif|eliminat|knockout|scoreline|late goal|late drama|last-minute|injury[- ]time|goalless|scoreless|winner|one[- ]sided|one[- ]directional|imbalance|dominant|dominated|dominance|controlled|control|resistance|resisted|underdog|siege|showcase|comfortable|cruised|cruise|did most of the attacking|most of the attacking|set the pace|defensive errors?|mistakes?|appeals?|weather delay|storm delay|early jolt|early goal|early energy|first[- ]half|second[- ]half|standout goalkeeping|standout save|supporters?|fanbase|home support|home atmosphere|host[- ]nation)\b|(\d\s*[-–]\s*\d)|(\b\d+\s+goals?\b)|(\b(?:one|two|three|four|five|six|seven|eight|nine|ten)-goal\b)/i
const STARTS_WITH_REACTION_RE = /^(public reaction|the overall reaction|overall reaction|fan reaction)\b/i
const SEARCH_SKIP_RE =
  /\b(how to watch|tv channel|kick-off time|predicted line-ups|predicted lineups|highlights?|watch live|preview)\b/i
const SUMMARY_ENTITY_ALIASES = [
  'American',
  'Bosnian',
  'Ivorian',
  'Moroccan',
  'Saudi',
]

type AnyMatch = GroupMatch | KnockoutMatch

interface SearchSnippet {
  title: string
  snippet: string
  url: string
  domain: string
}

interface GatheredSnippets {
  hadSearchError: boolean
  snippets: SearchSnippet[]
}

interface ModelVerdict {
  suitable: boolean
  rating: EntertainmentRating
  summary: string
  reason: string
}

export type AuditReasonCode =
  | 'added'
  | 'insufficient_signal'
  | 'model_unsuitable'
  | 'safety_rejected'
  | 'model_error'
  | 'api_error'
  | 'search_error'

interface AuditEntry {
  attempts: number
  matchId: string
  reasonCode: AuditReasonCode
}

const t = tournaments.wc2026

function normalizeForSafety(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function shouldRetryReason(reasonCode: AuditReasonCode): boolean {
  return reasonCode === 'model_unsuitable' || reasonCode === 'safety_rejected' || reasonCode === 'model_error'
}

const SUMMARY_FORBIDDEN_ENTITY_RE = new RegExp(
  `\\b(?:${[
    ...Object.values(t.teams).map((team) => team.name),
    ...Object.values(t.teams).map((team) => team.id),
    ...SUMMARY_ENTITY_ALIASES,
  ]
    .map(normalizeForSafety)
    .map(escapeRegExp)
    .join('|')})\\b`,
  'i',
)

function nowMs(): number {
  return Date.now()
}

function kickoffMs(m: AnyMatch): number {
  return new Date(m.kickoff ?? `${m.date}T00:00:00Z`).getTime()
}

function playableTeams(m: AnyMatch): [string, string] | null {
  if ('group' in m) return [t.teams[m.home].name, t.teams[m.away].name]
  if (!m.homeTeam || !m.awayTeam) return null
  return [t.teams[m.homeTeam].name, t.teams[m.awayTeam].name]
}

export function loadEntertainment(): Record<string, EntertainmentEntry> {
  return { ...wc2026Entertainment }
}

function serializeEntertainment(map: Record<string, EntertainmentEntry>): string {
  const ids = Object.keys(map).sort()
  const header = `import type { EntertainmentRating } from './types'

export interface EntertainmentEntry {
  entertainmentSummary: string
  entertainmentRating: EntertainmentRating
  promptVersion?: string
}

/**
 * Auto-curated entertainment summaries keyed by match id.
 *
 * GENERATED by scripts/curate-entertainment.ts — do not edit by hand.
 * Kept separate from wc2026.ts so the curation bot can own this file
 * end-to-end without touching the hand-maintained tournament data.
 */
`
  if (ids.length === 0) {
    return `${header}export const wc2026Entertainment: Record<string, EntertainmentEntry> = {}\n`
  }
  const body = ids
    .map((id) => `  ${JSON.stringify(id)}: {\n    entertainmentSummary: ${JSON.stringify(map[id].entertainmentSummary)},\n    entertainmentRating: ${map[id].entertainmentRating},\n    promptVersion: ${JSON.stringify(map[id].promptVersion ?? ENTERTAINMENT_PROMPT_VERSION)},\n  },`)
    .join('\n')
  return `${header}export const wc2026Entertainment: Record<string, EntertainmentEntry> = {\n${body}\n}\n`
}

function decodeHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolvedDdgUrl(raw: string): string {
  const href = raw.startsWith('//') ? `https:${raw}` : raw
  try {
    const url = new URL(href)
    const uddg = url.searchParams.get('uddg')
    return uddg ? decodeURIComponent(uddg) : href
  } catch {
    return href
  }
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function searchDuckDuckGo(query: string, max: number): Promise<SearchSnippet[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, SEARCH_TIMEOUT_MS)
  if (!res.ok) throw new Error(`duckduckgo ${res.status}`)
  const html = await res.text()
  const out: SearchSnippet[] = []
  const re =
    /<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet" href="[^"]+">([\s\S]*?)<\/a>/g
  for (const m of html.matchAll(re)) {
    const title = decodeHtml(m[2])
    const snippet = decodeHtml(m[3])
    if (!title || !snippet) continue
    if (SEARCH_SKIP_RE.test(title) || SEARCH_SKIP_RE.test(snippet)) continue
    const url = resolvedDdgUrl(m[1])
    let domain = ''
    try {
      domain = new URL(url).hostname.replace(/^www\./, '')
    } catch {
      continue
    }
    if (/(youtube\.com|youtu\.be|foxsports\.com)$/.test(domain)) continue
    out.push({ title, snippet, url, domain })
    if (out.length >= max) break
  }
  return out
}

async function gatherSnippets(matchId: string, home: string, away: string): Promise<GatheredSnippets> {
  const queries = [
    `${home} ${away} World Cup 2026 reaction`,
    `${home} ${away} World Cup 2026 fan reaction`,
  ].slice(0, SEARCH_QUERIES_PER_MATCH)
  const seen = new Set<string>()
  const out: SearchSnippet[] = []
  let hadSearchError = false
  for (const query of queries) {
    let results: SearchSnippet[] = []
    try {
      results = await searchDuckDuckGo(query, MAX_SEARCH_RESULTS)
    } catch (e) {
      console.error(`skip ${matchId}: search_error`)
      hadSearchError = true
      continue
    }
    for (const item of results) {
      const key = `${item.domain}|${item.title.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }
  return { snippets: out.slice(0, 8), hadSearchError }
}

async function callModel(body: Record<string, unknown>): Promise<Response> {
  return fetchWithTimeout(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  }, MODEL_TIMEOUT_MS)
}

export function parseVerdict(text: string): ModelVerdict {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('no JSON in model reply')
  const obj = JSON.parse(text.slice(start, end + 1)) as Partial<ModelVerdict>
  if (typeof obj.suitable !== 'boolean') throw new Error('missing suitable')
  if (!Number.isInteger(obj.rating) || obj.rating < 1 || obj.rating > 5) throw new Error('bad rating')
  if (typeof obj.summary !== 'string' || typeof obj.reason !== 'string') throw new Error('bad strings')
  return {
    suitable: obj.suitable,
    rating: obj.rating as EntertainmentRating,
    summary: obj.summary.trim(),
    reason: obj.reason.trim(),
  }
}

export function isCurrentEntertainmentEntry(entry: EntertainmentEntry | undefined): boolean {
  return entry?.promptVersion === ENTERTAINMENT_PROMPT_VERSION
}

function classifyModelError(error: unknown): AuditReasonCode {
  const message = error instanceof Error ? error.message : String(error)
  if (message.startsWith('API ')) return 'api_error'
  return 'model_error'
}

function writeAudit(entries: AuditEntry[]): void {
  if (!AUDIT_FILE) return
  const added = entries.filter((entry) => entry.reasonCode === 'added')
  const skipped = entries.filter((entry) => entry.reasonCode !== 'added')
  const lines = [
    `- added: ${added.length}`,
    `- skipped: ${skipped.length}`,
  ]
  for (const entry of skipped) {
    lines.push(`- \`${entry.matchId}\`: \`${entry.reasonCode}\` after ${entry.attempts} attempt${entry.attempts === 1 ? '' : 's'}`)
  }
  writeFileSync(AUDIT_FILE, `${lines.join('\n')}\n`)
}

export function isSafeSummary(summary: string): boolean {
  if (!summary) return false
  if (STARTS_WITH_REACTION_RE.test(summary)) return false
  if (SUMMARY_SPOILER_RE.test(summary)) return false
  if (SUMMARY_FORBIDDEN_ENTITY_RE.test(normalizeForSafety(summary))) return false
  const sentenceCount = summary
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length
  return sentenceCount >= 1 && sentenceCount <= 2
}

async function summarizeMatch(
  home: string,
  away: string,
  snippets: SearchSnippet[],
  retryNote?: string,
): Promise<ModelVerdict> {
  const messages = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        `MATCH: ${home} vs ${away}\n` +
        `SNIPPETS:\n` +
        snippets
          .map((s, i) => `${i + 1}. [${s.domain}] ${s.title} — ${s.snippet}`)
          .join('\n') +
        (retryNote ? `\n\nREWRITE NOTE:\n${retryNote}` : ''),
    },
  ]
  const rich = {
    model: MODEL,
    messages,
    reasoning_effort: EFFORT,
    response_format: { type: 'json_object' },
  }
  let res = await callModel(rich)
  if (res.status === 400) res = await callModel({ model: MODEL, messages })
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 150)}`)
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('empty model reply')
  return parseVerdict(text)
}

const allMatches: AnyMatch[] = [
  ...t.groupMatches,
  ...t.knockoutRounds.flatMap((r) => r.matches),
]

export function shouldCurate(
  m: AnyMatch,
  entertainment: Record<string, EntertainmentEntry>,
  options: {
    aiEnabled?: boolean
    now?: number
    minAgeMinutes?: number
  } = {},
): boolean {
  const aiEnabled = options.aiEnabled ?? AI_ENABLED
  const now = options.now ?? nowMs()
  const minAgeMinutes = options.minAgeMinutes ?? MIN_AGE_MINUTES

  if (!aiEnabled) return false
  if (!isPlayed(m)) return false
  if (isCurrentEntertainmentEntry(entertainment[m.id])) return false
  const teams = playableTeams(m)
  if (!teams) return false
  const ageMinutes = (now - kickoffMs(m)) / 60000
  return ageMinutes >= minAgeMinutes
}

async function run() {
  const entertainment = Object.fromEntries(
    Object.entries(loadEntertainment()).filter(([, entry]) => isCurrentEntertainmentEntry(entry)),
  )
  const allCandidates = allMatches.filter((m) => shouldCurate(m, entertainment))
  const candidates = allCandidates.slice(0, MAX_MATCHES_PER_RUN)
  const audit: AuditEntry[] = []

  if (!AI_ENABLED) {
    console.log('no OPENAI_API_KEY — skipping entertainment curation')
    writeAudit(audit)
    return
  }

  if (candidates.length === 0) {
    console.log('no entertainment summaries to curate')
    writeAudit(audit)
    return
  }

  console.log(`curating ${candidates.length}/${allCandidates.length} entertainment candidate(s)`)

  const added: string[] = []
  for (const match of candidates) {
    const teams = playableTeams(match)
    if (!teams) continue
    const [home, away] = teams
    const { snippets, hadSearchError } = await gatherSnippets(match.id, home, away)
    if (snippets.length < MIN_SNIPPETS) {
      const reasonCode: AuditReasonCode = hadSearchError ? 'search_error' : 'insufficient_signal'
      console.log(`skip ${match.id}: ${reasonCode}`)
      audit.push({ matchId: match.id, reasonCode, attempts: 1 })
      continue
    }

    let addedThisMatch = false
    for (let attempt = 1; attempt <= MAX_SUMMARY_ATTEMPTS; attempt += 1) {
      try {
        const verdict = await summarizeMatch(
          home,
          away,
          snippets,
          attempt > 1 ? RETRY_NOTE : undefined,
        )
        if (!verdict.suitable) {
          const reasonCode: AuditReasonCode = 'model_unsuitable'
          if (attempt < MAX_SUMMARY_ATTEMPTS && shouldRetryReason(reasonCode)) continue
          console.log(`skip ${match.id}: ${reasonCode}`)
          audit.push({ matchId: match.id, reasonCode, attempts: attempt })
          break
        }
        if (!isSafeSummary(verdict.summary)) {
          const reasonCode: AuditReasonCode = 'safety_rejected'
          if (attempt < MAX_SUMMARY_ATTEMPTS && shouldRetryReason(reasonCode)) continue
          console.log(`skip ${match.id}: ${reasonCode}`)
          audit.push({ matchId: match.id, reasonCode, attempts: attempt })
          break
        }
        entertainment[match.id] = {
          entertainmentSummary: verdict.summary,
          entertainmentRating: verdict.rating,
          promptVersion: ENTERTAINMENT_PROMPT_VERSION,
        }
        added.push(match.id)
        audit.push({ matchId: match.id, reasonCode: 'added', attempts: attempt })
        addedThisMatch = true
        console.log(`added ${match.id}`)
        break
      } catch (e) {
        const reasonCode = classifyModelError(e)
        if (attempt < MAX_SUMMARY_ATTEMPTS && shouldRetryReason(reasonCode)) continue
        console.error(`skip ${match.id}: ${reasonCode}`)
        audit.push({ matchId: match.id, reasonCode, attempts: attempt })
        break
      }
    }

    if (addedThisMatch) {
      await new Promise((r) => setTimeout(r, 250))
      continue
    }
    await new Promise((r) => setTimeout(r, 250))
  }

  if (added.length === 0) {
    console.log('no entertainment summaries added')
    writeAudit(audit)
    return
  }

  if (!dryRun) writeFileSync(FILE, serializeEntertainment(entertainment))
  writeAudit(audit)
  console.log(`${dryRun ? 'would add' : 'added'} ${added.length} entertainment summary(s):`)
  for (const id of added) console.log(`  ${id}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
