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
 * the result, and an untraded one has placeholder prices. Only unplayed matches
 * without odds are filled — snapshots are deliberate so a later resolved market
 * can't leak a result to someone catching up.
 */
import { readFileSync, writeFileSync } from 'fs'
import { tournaments } from '../src/data'

const FILE = 'src/data/wc2026.ts'
const t = tournaments.wc2026
const ENDPOINT = 'https://gamma-api.polymarket.com/events?tag_slug=fifa-world-cup&limit=500'

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
  const res = await fetch(`${ENDPOINT}&closed=false`)
  if (!res.ok) throw new Error(`gamma ${res.status}`)
  return (await res.json()) as GammaEvent[]
}

interface Odds {
  slug: string
  date: string
  byTeam: Record<string, number>
  draw: number
}

const byPair = new Map<string, Odds[]>()
for (const e of await fetchEvents()) {
  if (!/^fifwc-[a-z]{3}-[a-z]{3}-2026-\d\d-\d\d$/.test(e.slug)) continue
  const wins = (e.markets ?? []).filter((m) => /^Will .+ win on /.test(m.question))
  const drawM = (e.markets ?? []).find((m) => /end in a draw/.test(m.question))
  if (wins.length !== 2 || !drawM) continue
  const teams = wins.map((m) => ({
    id: nameToId[norm(m.question.replace(/^Will /, '').replace(/ win on .*/, ''))],
    p: yesPrice(m),
  }))
  const draw = yesPrice(drawM)
  if (teams.some((x) => !x.id || x.p == null) || draw == null) continue
  const [h, a] = [teams[0].p!, teams[1].p!]
  const sum = h + a + draw
  // Skip untraded / degenerate markets (no real liquidity yet).
  if (sum < 0.9 || sum > 1.15 || h <= 0 || a <= 0 || h >= 0.99 || a >= 0.99 || draw >= 0.99) continue
  const key = teams.map((x) => x.id!).sort().join('|')
  const entry: Odds = {
    slug: e.slug,
    date: e.slug.slice(-10),
    byTeam: { [teams[0].id!]: h, [teams[1].id!]: a },
    draw,
  }
  ;(byPair.get(key) ?? byPair.set(key, []).get(key)!).push(entry)
}

let src = readFileSync(FILE, 'utf8')
let updated = 0
const pending = t.groupMatches.filter((m) => m.score === undefined && m.odds === undefined)

for (const m of pending) {
  const list = byPair.get([m.home, m.away].sort().join('|'))
  if (!list) {
    console.error(`no open market: ${m.id} ${m.home} v ${m.away}`)
    continue
  }
  // A pair plays once in the groups; if several events match, take the nearest date.
  const hit = list.sort(
    (a, b) =>
      Math.abs(+new Date(a.date) - +new Date(m.date)) -
      Math.abs(+new Date(b.date) - +new Date(m.date)),
  )[0]
  const home = hit.byTeam[m.home]
  const away = hit.byTeam[m.away]
  const lit = `, odds: { home: ${round(home)}, draw: ${round(hit.draw)}, away: ${round(away)}, url: 'https://polymarket.com/event/${hit.slug}' }`
  const re = new RegExp(`(\\{ id: '${m.id}',[^\\n]*?away: '[A-Z]{3}')`)
  if (!re.test(src)) {
    console.error(`could not locate ${m.id} in source`)
    continue
  }
  src = src.replace(re, (s) => s + lit)
  updated++
  console.log(
    `${m.id}: ${m.home} ${(home * 100).toFixed(0)}% / draw ${(hit.draw * 100).toFixed(0)}% / ${m.away} ${(away * 100).toFixed(0)}%`,
  )
}

writeFileSync(FILE, src)
console.log(`\nreal odds added for ${updated}/${pending.length} pending matches`)
