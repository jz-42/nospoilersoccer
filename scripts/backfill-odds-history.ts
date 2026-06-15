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

const FILE = 'src/data/wc2026.ts'
const t = tournaments.wc2026
const GAMMA = 'https://gamma-api.polymarket.com/events?tag_slug=fifa-world-cup&closed=true&limit=500'
const CLOB = 'https://clob.polymarket.com/prices-history'

interface Market { question: string; clobTokenIds?: string }
interface GammaEvent { slug: string; markets?: Market[] }

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z]/g, '')
const nameToId: Record<string, string> = {}
for (const team of Object.values(t.teams)) nameToId[norm(team.name)] = team.id
Object.assign(nameToId, {
  caboverde: 'CPV', bosniaherzegovina: 'BIH', turkiye: 'TUR', korearepublic: 'KOR',
  drcongo: 'COD', congodr: 'COD', czechrepublic: 'CZE', cotedivoire: 'CIV',
  iriran: 'IRN', iran: 'IRN',
})
const round = (n: number) => Number(n.toFixed(3))

/** Yes-token price from the last trade at/just before `ts` (unix seconds). */
async function priceBefore(tokenId: string, ts: number): Promise<number | null> {
  const url = `${CLOB}?market=${tokenId}&startTs=${ts - 24 * 3600}&endTs=${ts}&fidelity=10`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { history?: { t: number; p: number }[] }
  const h = data.history ?? []
  return h.length ? h[h.length - 1].p : null
}

// Index closed events by team pair.
const events = (await (await fetch(GAMMA)).json()) as GammaEvent[]
const byPair = new Map<string, GammaEvent>()
for (const e of events) {
  if (!/^fifwc-[a-z]{3}-[a-z]{3}-2026-\d\d-\d\d$/.test(e.slug)) continue
  const wins = (e.markets ?? []).filter((m) => /^Will .+ win on /.test(m.question))
  if (wins.length !== 2) continue
  const ids = wins.map((m) => nameToId[norm(m.question.replace(/^Will /, '').replace(/ win on .*/, ''))])
  if (ids.some((x) => !x)) continue
  byPair.set(ids.map((x) => x!).sort().join('|'), e)
}

function yesToken(e: GammaEvent, match: (q: string) => boolean): string | null {
  const m = (e.markets ?? []).find((mk) => match(mk.question))
  if (!m?.clobTokenIds) return null
  try { return (JSON.parse(m.clobTokenIds) as string[])[0] ?? null } catch { return null }
}

let src = readFileSync(FILE, 'utf8')
let updated = 0
const pending = t.groupMatches.filter((m) => m.score !== undefined && m.odds === undefined && m.kickoff)

for (const m of pending) {
  const ev = byPair.get([m.home, m.away].sort().join('|'))
  if (!ev) { console.error(`no market: ${m.id} ${m.home} v ${m.away}`); continue }
  const ts = Math.floor(new Date(m.kickoff!).getTime() / 1000)
  const homeName = t.teams[m.home].name
  const awayName = t.teams[m.away].name
  // The Yes token for each outcome, identified by the team named in the question.
  const findTok = (name: string) =>
    yesToken(ev, (q) => /win on/.test(q) && norm(q.replace(/^Will /, '').replace(/ win on.*/, '')) === norm(name))
  const hTok = findTok(homeName)
  const aTok = findTok(awayName)
  const dTok = yesToken(ev, (q) => /end in a draw/.test(q))
  if (!hTok || !aTok || !dTok) { console.error(`missing tokens: ${m.id}`); continue }
  const [home, away, draw] = await Promise.all([priceBefore(hTok, ts), priceBefore(aTok, ts), priceBefore(dTok, ts)])
  if (home == null || away == null || draw == null) { console.error(`no pre-kickoff trades: ${m.id}`); continue }
  const sum = home + away + draw
  if (sum < 0.85 || sum > 1.2 || home >= 0.99 || away >= 0.99) { console.error(`implausible: ${m.id} sum=${sum.toFixed(2)}`); continue }
  const lit = `, odds: { home: ${round(home)}, draw: ${round(draw)}, away: ${round(away)}, url: 'https://polymarket.com/event/${ev.slug}' }`
  const re = new RegExp(`(\\{ id: '${m.id}',[^\\n]*?away: '[A-Z]{3}')`)
  if (!re.test(src)) { console.error(`could not locate ${m.id}`); continue }
  src = src.replace(re, (s) => s + lit)
  updated++
  console.log(`${m.id}: ${m.home} ${(home * 100).toFixed(0)}% / draw ${(draw * 100).toFixed(0)}% / ${m.away} ${(away * 100).toFixed(0)}%  [pre-match, ${ev.slug}]`)
  await new Promise((r) => setTimeout(r, 150))
}

writeFileSync(FILE, src)
console.log(`\npre-match odds recovered for ${updated}/${pending.length} played matches`)
