/**
 * Snapshot pre-match win probabilities from Polymarket into wc2026.ts.
 *
 *   npx tsx scripts/fetch-odds.ts
 *
 * Polymarket's per-match events are matched to our fixtures by TEAM NAME (their
 * slugs use their own codes — `che` Switzerland, `cvi` Cabo Verde — and some are
 * idiosyncratic, so building slugs from our FIFA codes silently misses them).
 * A group pair meets once, so we key on the team pair and sanity-check the date.
 *
 * Only OPEN, traded markets are used: a resolved market reads 1/0 and would leak
 * the result, and an untraded one has placeholder prices. Unplayed matches are
 * refreshed until kickoff, then left alone forever as a spoiler-safe snapshot.
 */
import { readFileSync, writeFileSync } from 'fs'
import { tournaments } from '../src/data'
import { resolveSlot } from '../src/logic/spoilers'
import type { GroupMatch, KnockoutMatch, TeamId, Tournament } from '../src/data/types'
import { fetchGammaEvents } from './polymarket'

const FILE = 'src/data/wc2026.ts'
const t = tournaments.wc2026
const ENDPOINT = 'https://gamma-api.polymarket.com/events?tag_slug=fifa-world-cup'

interface Market {
  question: string
  outcomes?: string
  outcomePrices?: string
}
interface GammaEvent {
  slug: string
  closed: boolean
  markets?: Market[]
}

export interface OddsFixture {
  id: string
  date: string
  kickoff: string
  home: TeamId
  away: TeamId
  kind: 'group' | 'knockout'
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z]/g, '')

const nameToId: Record<string, string> = {}
for (const team of Object.values(t.teams)) nameToId[norm(team.name)] = team.id
// Polymarket display names that differ from ours.
Object.assign(nameToId, {
  caboverde: 'CPV',
  bosniaherzegovina: 'BIH',
  turkiye: 'TUR',
  korearepublic: 'KOR',
  drcongo: 'COD',
  congodr: 'COD',
  czechrepublic: 'CZE',
  cotedivoire: 'CIV',
  iriran: 'IRN',
  iran: 'IRN',
})

function yesPrice(m: Market): number | null {
  try {
    const outcomes = JSON.parse(m.outcomes ?? '[]') as string[]
    const prices = JSON.parse(m.outcomePrices ?? '[]') as string[]
    const i = outcomes.indexOf('Yes')
    return i === -1 || !prices[i] ? null : Number(prices[i])
  } catch {
    return null
  }
}

const round = (n: number) => Number(n.toFixed(3))

async function fetchEvents(): Promise<GammaEvent[]> {
  // Open markets only — pre-match prices we can safely snapshot.
  return fetchGammaEvents<GammaEvent>(`${ENDPOINT}&closed=false`)
}

interface Odds {
  slug: string
  date: string
  byTeam: Record<string, number>
  draw?: number
}

type LogFn = (message: string) => void

function matchHasKickedOff(m: { kickoff?: string }, now: Date): boolean {
  return m.kickoff !== undefined && now >= new Date(m.kickoff)
}

function actualMarks(tt: Tournament): Record<string, 'watched'> {
  const marks: Record<string, 'watched'> = {}
  for (const m of tt.groupMatches) if (m.score !== undefined) marks[m.id] = 'watched'
  for (const m of tt.knockoutRounds.flatMap((r) => r.matches)) {
    if (m.score !== undefined) marks[m.id] = 'watched'
  }
  return marks
}

function groupFixture(m: GroupMatch): OddsFixture {
  return {
    id: m.id,
    date: m.date,
    kickoff: m.kickoff!,
    home: m.home,
    away: m.away,
    kind: 'group',
  }
}

function knockoutFixture(
  tt: Tournament,
  m: KnockoutMatch,
  marks: Record<string, 'watched'>,
): OddsFixture | null {
  const home = m.homeTeam ?? resolveSlot(tt, m, 'home', marks)
  const away = m.awayTeam ?? resolveSlot(tt, m, 'away', marks)
  if (!home || !away || !m.kickoff) return null
  return {
    id: m.id,
    date: m.date,
    kickoff: m.kickoff,
    home,
    away,
    kind: 'knockout',
  }
}

export function eligibleOddsFixtures(tt: Tournament, now = new Date()): OddsFixture[] {
  const marks = actualMarks(tt)
  const groups = tt.groupMatches
    .filter((m) => m.score === undefined && m.kickoff !== undefined && !matchHasKickedOff(m, now))
    .map(groupFixture)
  const knockouts = tt.knockoutRounds
    .flatMap((r) => r.matches)
    .filter((m) => m.score === undefined && m.kickoff !== undefined && !matchHasKickedOff(m, now))
    .map((m) => knockoutFixture(tt, m, marks))
    .filter((m): m is OddsFixture => m !== null)
  return [...groups, ...knockouts]
}

function parseQuestionTeam(question: string): string {
  return question.replace(/^Will /, '').replace(/ (?:win|advance).*/, '')
}

function readObjectAt(sourceText: string, start: number): { start: number; end: number } | null {
  let depth = 0
  let quote: string | null = null
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
      if (depth === 0) return { start, end: i + 1 }
    }
  }

  return null
}

function setMatchOdds(sourceText: string, id: string, literal: string): string | null {
  const start = sourceText.indexOf(`{ id: '${id}',`)
  if (start === -1) return null
  const span = readObjectAt(sourceText, start)
  if (!span) return null
  const block = sourceText.slice(span.start, span.end)
  const oddsRe = /,\s*odds:\s*\{[^}]*\}/
  const nextBlock = oddsRe.test(block)
    ? block.replace(oddsRe, literal)
    : `${block.slice(0, -1)}${literal} }`
  return `${sourceText.slice(0, span.start)}${nextBlock}${sourceText.slice(span.end)}`
}

function oddsByPair(events: GammaEvent[]): Map<string, Odds[]> {
  const byPair = new Map<string, Odds[]>()

  for (const e of events) {
    if (!/^fifwc-[a-z]{3}-[a-z]{3}-2026-\d\d-\d\d$/.test(e.slug)) continue
    const wins = (e.markets ?? []).filter((m) =>
      /^Will .+ (?:win|advance)(?: on |$)/.test(m.question),
    )
    const drawM = (e.markets ?? []).find((m) => /end in a draw/.test(m.question))
    if (wins.length !== 2) continue
    const teams = wins.map((m) => ({
      id: nameToId[norm(parseQuestionTeam(m.question))],
      p: yesPrice(m),
    }))
    const draw = drawM ? yesPrice(drawM) : undefined
    if (teams.some((x) => !x.id || x.p == null) || (drawM && draw == null)) continue
    const [h, a] = [teams[0].p!, teams[1].p!]
    const sum = h + a + (draw ?? 0)
    // Skip untraded / degenerate markets (no real liquidity yet).
    if (
      sum < 0.9 ||
      sum > 1.15 ||
      h <= 0 ||
      a <= 0 ||
      h >= 0.99 ||
      a >= 0.99 ||
      (draw ?? 0) >= 0.99
    ) continue
    const key = teams.map((x) => x.id!).sort().join('|')
    const entry: Odds = {
      slug: e.slug,
      date: e.slug.slice(-10),
      byTeam: { [teams[0].id!]: h, [teams[1].id!]: a },
      ...(draw === undefined ? {} : { draw }),
    }
    ;(byPair.get(key) ?? byPair.set(key, []).get(key)!).push(entry)
  }

  return byPair
}

export function refreshOddsSource(
  sourceText: string,
  fixtures: OddsFixture[],
  byPair: Map<string, Odds[]>,
  logError: LogFn = console.error,
  logUpdate: LogFn = console.log,
): { sourceText: string; updated: number } {
  let nextSource = sourceText
  let updated = 0

  for (const m of fixtures) {
    try {
      const list = byPair.get([m.home, m.away].sort().join('|'))
      if (!list) {
        logError(`no open market: ${m.id} ${m.kind}`)
        continue
      }
      const hit = list.sort(
        (a, b) =>
          Math.abs(+new Date(a.date) - +new Date(m.date)) -
          Math.abs(+new Date(b.date) - +new Date(m.date)),
      )[0]
      const home = hit.byTeam[m.home]
      const away = hit.byTeam[m.away]
      if (home === undefined || away === undefined) {
        throw new Error('market missing side price')
      }
      const draw = hit.draw === undefined ? '' : `, draw: ${round(hit.draw)}`
      const lit = `, odds: { home: ${round(home)}${draw}, away: ${round(away)}, url: 'https://polymarket.com/event/${hit.slug}' }`
      const next = setMatchOdds(nextSource, m.id, lit)
      if (next === null) {
        logError(`could not locate ${m.id} in source`)
        continue
      }
      if (next !== nextSource) {
        nextSource = next
        updated++
      }
      logUpdate(
        `${m.id}: ${m.home} ${(home * 100).toFixed(0)}%${hit.draw === undefined ? '' : ` / draw ${(hit.draw * 100).toFixed(0)}%`} / ${m.away} ${(away * 100).toFixed(0)}%`,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logError(`fixture error: ${m.id} ${m.kind} (${reason})`)
    }
  }

  return { sourceText: nextSource, updated }
}

export async function main(now = new Date()) {
  const byPair = oddsByPair(await fetchEvents())

  const src = readFileSync(FILE, 'utf8')
  const pending = eligibleOddsFixtures(t, now)
  const refreshed = refreshOddsSource(src, pending, byPair)

  writeFileSync(FILE, refreshed.sourceText)
  console.log(`\nreal odds refreshed for ${refreshed.updated}/${pending.length} pending matches`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
