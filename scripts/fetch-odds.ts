/**
 * Snapshot pre-match win probabilities from Polymarket into wc2026.ts.
 *
 *   npx tsx scripts/fetch-odds.ts
 *
 * Only touches unplayed matches that don't have odds yet. Snapshots are
 * deliberate: odds baked into the data can never leak a result the way a
 * live query against a resolved market would.
 *
 * Polymarket event slugs follow `fifwc-<home>-<away>-<date>` with lowercase
 * FIFA codes (e.g. fifwc-bra-mar-2026-06-13).
 */
import { readFileSync, writeFileSync } from 'fs'
import { tournaments } from '../src/data'

const FILE = 'src/data/wc2026.ts'
const t = tournaments.wc2026

interface GammaMarket {
  question: string
  outcomes?: string
  outcomePrices?: string
}

interface GammaEvent {
  slug: string
  markets?: GammaMarket[]
}

async function fetchEvent(slug: string): Promise<GammaEvent | null> {
  const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`)
  if (!res.ok) return null
  const data = (await res.json()) as GammaEvent[]
  return data[0] ?? null
}

function yesPrice(m: GammaMarket): number | null {
  try {
    const outcomes = JSON.parse(m.outcomes ?? '[]') as string[]
    const prices = JSON.parse(m.outcomePrices ?? '[]') as string[]
    const i = outcomes.findIndex((o) => o === 'Yes')
    if (i === -1 || !prices[i]) return null
    return Number(prices[i])
  } catch {
    return null
  }
}

let src = readFileSync(FILE, 'utf8')
let updated = 0

const pending = t.groupMatches.filter((m) => m.score === undefined && m.odds === undefined)

for (const m of pending) {
  const slug = `fifwc-${m.home.toLowerCase()}-${m.away.toLowerCase()}-${m.date}`
  const ev = await fetchEvent(slug)
  if (!ev?.markets) {
    console.error(`no market: ${slug}`)
    continue
  }
  const homeName = t.teams[m.home].name
  const awayName = t.teams[m.away].name
  let home: number | null = null
  let away: number | null = null
  let draw: number | null = null
  for (const market of ev.markets) {
    const q = market.question
    if (/draw/i.test(q)) draw = yesPrice(market)
    else if (q.includes(homeName)) home = yesPrice(market)
    else if (q.includes(awayName)) away = yesPrice(market)
  }
  if (home === null || away === null) {
    console.error(`incomplete markets for ${slug} (${home}/${draw}/${away})`)
    continue
  }
  const total = home + away + (draw ?? 0)
  if (total < 0.85 || total > 1.15) {
    console.error(`implausible probabilities for ${slug}: sum=${total.toFixed(2)}`)
    continue
  }
  const lit = `, odds: { home: ${home}, ${draw !== null ? `draw: ${draw}, ` : ''}away: ${away}, url: 'https://polymarket.com/event/${ev.slug}' }`
  const re = new RegExp(`(\\{ id: '${m.id}',[^\\n]*?away: '[A-Z]{3}')`)
  if (!re.test(src)) {
    console.error(`could not locate ${m.id} in source`)
    continue
  }
  src = src.replace(re, (s) => s + lit)
  updated++
  console.log(`${m.id}: ${homeName} ${(home * 100).toFixed(0)}% / draw ${draw !== null ? (draw * 100).toFixed(0) : '–'}% / ${awayName} ${(away * 100).toFixed(0)}%`)
  await new Promise((r) => setTimeout(r, 150))
}

writeFileSync(FILE, src)
console.log(`\nodds added for ${updated}/${pending.length} pending matches`)
