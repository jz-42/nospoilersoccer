/**
 * Recover pre-match odds for matches that were already played when no live
 * snapshot was taken. The live market is now resolved (reads 1/0), but
 * Polymarket's CLOB keeps per-token price history, so we read each outcome's
 * implied probability from the last trade BEFORE kickoff — a true pre-match
 * snapshot that can't leak the result.
 *
 *   npx tsx scripts/backfill-odds-history.ts
 *
 * Only fills played matches that have no odds yet. Matches with no Polymarket
 * market (or no pre-kickoff trades) are left blank.
 */
import { readFileSync, writeFileSync } from 'fs'
import { tournaments } from '../src/data'
import { resolveSlot } from '../src/logic/spoilers'
import type { GroupMatch, KnockoutMatch, TeamId, Tournament } from '../src/data/types'

const FILE = 'src/data/wc2026.ts'
const t = tournaments.wc2026
const GAMMA = 'https://gamma-api.polymarket.com/events?tag_slug=fifa-world-cup&closed=true&limit=500'
const CLOB = 'https://clob.polymarket.com/prices-history'

interface Market {
  question: string
  clobTokenIds?: string
}

interface GammaEvent {
  slug: string
  markets?: Market[]
}

export interface HistoricalOddsFixture {
  id: string
  date: string
  kickoff: string
  home: TeamId
  away: TeamId
  kind: 'group' | 'knockout'
}

interface HistoricalOddsEvent {
  slug: string
  date: string
  byTeam: Record<string, string>
  drawToken?: string
  requiresDraw: boolean
}

type LogFn = (message: string) => void
type PriceBeforeFn = (tokenId: string, ts: number) => Promise<number | null>

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z]/g, '')

const nameToId: Record<string, string> = {}
for (const team of Object.values(t.teams)) nameToId[norm(team.name)] = team.id
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

const round = (n: number) => Number(n.toFixed(3))

function playedGroupFixture(m: GroupMatch): HistoricalOddsFixture | null {
  if (m.score === undefined || m.odds !== undefined || !m.kickoff) return null
  return {
    id: m.id,
    date: m.date,
    kickoff: m.kickoff,
    home: m.home,
    away: m.away,
    kind: 'group',
  }
}

function actualMarks(tt: Tournament): Record<string, 'watched'> {
  const marks: Record<string, 'watched'> = {}
  for (const m of tt.groupMatches) if (m.score !== undefined) marks[m.id] = 'watched'
  for (const m of tt.knockoutRounds.flatMap((round) => round.matches)) {
    if (m.score !== undefined) marks[m.id] = 'watched'
  }
  return marks
}

function playedKnockoutFixture(
  tt: Tournament,
  m: KnockoutMatch,
  marks: Record<string, 'watched'>,
): HistoricalOddsFixture | null {
  if (m.score === undefined || m.odds !== undefined || !m.kickoff) {
    return null
  }
  const home = m.homeTeam ?? resolveSlot(tt, m, 'home', marks)
  const away = m.awayTeam ?? resolveSlot(tt, m, 'away', marks)
  if (!home || !away) return null
  return {
    id: m.id,
    date: m.date,
    kickoff: m.kickoff,
    home,
    away,
    kind: 'knockout',
  }
}

export function eligibleHistoricalOddsFixtures(tt: Tournament): HistoricalOddsFixture[] {
  const marks = actualMarks(tt)
  const groups = tt.groupMatches
    .map(playedGroupFixture)
    .filter((m): m is HistoricalOddsFixture => m !== null)
  const knockouts = tt.knockoutRounds
    .flatMap((round) => round.matches)
    .map((m) => playedKnockoutFixture(tt, m, marks))
    .filter((m): m is HistoricalOddsFixture => m !== null)
  return [...groups, ...knockouts]
}

/** Yes-token price from the last trade at/just before `ts` (unix seconds). */
async function priceBefore(tokenId: string, ts: number): Promise<number | null> {
  const url = `${CLOB}?market=${tokenId}&startTs=${ts - 24 * 3600}&endTs=${ts}&fidelity=10`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { history?: { t: number; p: number }[] }
  const history = data.history ?? []
  return history.length ? history[history.length - 1].p : null
}

function parseQuestionTeam(question: string): string {
  return question.replace(/^Will /, '').replace(/ (?:win|advance).*/, '')
}

function yesToken(questionMarket: Market | undefined): string | null {
  if (!questionMarket?.clobTokenIds) return null
  try {
    return (JSON.parse(questionMarket.clobTokenIds) as string[])[0] ?? null
  } catch {
    return null
  }
}

export function closedOddsByPair(events: GammaEvent[]): Map<string, HistoricalOddsEvent[]> {
  const byPair = new Map<string, HistoricalOddsEvent[]>()

  for (const e of events) {
    if (!/^fifwc-[a-z]{3}-[a-z]{3}-2026-\d\d-\d\d$/.test(e.slug)) continue
    const wins = (e.markets ?? []).filter((m) =>
      /^Will .+ (?:win|advance)(?: on |$)/.test(m.question),
    )
    if (wins.length !== 2) continue

    const sides = wins.map((market) => ({
      id: nameToId[norm(parseQuestionTeam(market.question))],
      token: yesToken(market),
    }))
    if (sides.some((side) => !side.id || !side.token)) continue

    const drawToken = yesToken((e.markets ?? []).find((m) => /end in a draw/.test(m.question)))
    const key = sides.map((side) => side.id!).sort().join('|')
    const entry: HistoricalOddsEvent = {
      slug: e.slug,
      date: e.slug.slice(-10),
      byTeam: {
        [sides[0].id!]: sides[0].token!,
        [sides[1].id!]: sides[1].token!,
      },
      ...(drawToken ? { drawToken } : {}),
      requiresDraw: drawToken !== null,
    }
    ;(byPair.get(key) ?? byPair.set(key, []).get(key)!).push(entry)
  }

  return byPair
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

function plausibleProbabilities(
  home: number,
  away: number,
  draw: number | undefined,
): boolean {
  const sum = home + away + (draw ?? 0)
  if (home <= 0 || away <= 0 || home >= 0.99 || away >= 0.99) return false
  if (draw !== undefined && draw >= 0.99) return false
  return draw === undefined ? sum >= 0.85 && sum <= 1.15 : sum >= 0.85 && sum <= 1.2
}

export async function recoverHistoricalOddsSource(
  sourceText: string,
  fixtures: HistoricalOddsFixture[],
  byPair: Map<string, HistoricalOddsEvent[]>,
  getPriceBefore: PriceBeforeFn = priceBefore,
  logError: LogFn = console.error,
  logUpdate: LogFn = console.log,
): Promise<{ sourceText: string; updated: number }> {
  let nextSource = sourceText
  let updated = 0

  for (const fixture of fixtures) {
    try {
      const list = byPair.get([fixture.home, fixture.away].sort().join('|'))
      if (!list) {
        logError(`no market: ${fixture.id} ${fixture.kind}`)
        continue
      }

      const event = list.sort(
        (a, b) =>
          Math.abs(+new Date(a.date) - +new Date(fixture.date)) -
          Math.abs(+new Date(b.date) - +new Date(fixture.date)),
      )[0]
      const homeToken = event.byTeam[fixture.home]
      const awayToken = event.byTeam[fixture.away]
      if (!homeToken || !awayToken || (event.requiresDraw && !event.drawToken)) {
        throw new Error('missing historical tokens')
      }

      const ts = Math.floor(new Date(fixture.kickoff).getTime() / 1000)
      const [home, away, draw] = await Promise.all([
        getPriceBefore(homeToken, ts),
        getPriceBefore(awayToken, ts),
        event.drawToken ? getPriceBefore(event.drawToken, ts) : Promise.resolve(undefined),
      ])
      if (home == null || away == null || (event.requiresDraw && draw == null)) {
        throw new Error('no pre-kickoff trades')
      }
      if (!plausibleProbabilities(home, away, draw)) {
        throw new Error('implausible historical probabilities')
      }

      const drawLiteral = draw === undefined ? '' : `, draw: ${round(draw)}`
      const literal = `, odds: { home: ${round(home)}${drawLiteral}, away: ${round(away)}, url: 'https://polymarket.com/event/${event.slug}' }`
      const next = setMatchOdds(nextSource, fixture.id, literal)
      if (next === null) {
        logError(`could not locate ${fixture.id}`)
        continue
      }
      if (next !== nextSource) {
        nextSource = next
        updated++
      }
      logUpdate(
        `${fixture.id}: ${fixture.home} ${(home * 100).toFixed(0)}%${draw === undefined ? '' : ` / draw ${(draw * 100).toFixed(0)}%`} / ${fixture.away} ${(away * 100).toFixed(0)}%`,
      )
      await new Promise((resolve) => setTimeout(resolve, 150))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logError(`historical fixture error: ${fixture.id} ${fixture.kind} (${reason})`)
    }
  }

  return { sourceText: nextSource, updated }
}

export async function main() {
  const events = (await (await fetch(GAMMA)).json()) as GammaEvent[]
  const sourceText = readFileSync(FILE, 'utf8')
  const fixtures = eligibleHistoricalOddsFixtures(t)
  const recovered = await recoverHistoricalOddsSource(
    sourceText,
    fixtures,
    closedOddsByPair(events),
  )

  writeFileSync(FILE, recovered.sourceText)
  console.log(`\npre-match odds recovered for ${recovered.updated}/${fixtures.length} played matches`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
