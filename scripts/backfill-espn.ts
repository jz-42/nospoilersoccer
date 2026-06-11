/**
 * One-off backfill from ESPN: kickoff times for everything, plus goal
 * scorers for played matches. Emits JSON keyed by our match ids.
 *
 *   npx tsx scripts/backfill-espn.ts 2022 > /tmp/espn-2022.json
 *   npx tsx scripts/backfill-espn.ts 2026 > /tmp/espn-2026.json
 */
import { tournaments } from '../src/data'
import type { GroupMatch, KnockoutMatch, Tournament } from '../src/data/types'
import { dateRange, fetchDay, parseEvent } from './espn'

const RANGES: Record<string, [string, string]> = {
  wc2022: ['2022-11-20', '2022-12-18'],
  wc2026: ['2026-06-11', '2026-07-19'],
}

function allMatches(t: Tournament): { id: string; home?: string; away?: string; date: string }[] {
  const out: { id: string; home?: string; away?: string; date: string }[] = []
  for (const m of t.groupMatches as GroupMatch[]) out.push({ id: m.id, home: m.home, away: m.away, date: m.date })
  for (const r of t.knockoutRounds) {
    for (const m of r.matches as KnockoutMatch[]) {
      out.push({ id: m.id, home: m.homeTeam, away: m.awayTeam, date: m.date })
    }
  }
  return out
}

const year = process.argv[2]
const t = tournaments[`wc${year}`]
if (!t) throw new Error(`usage: backfill-espn.ts 2022|2026`)

const matches = allMatches(t)
const result: Record<string, unknown> = {}
const misses: string[] = []
const [start, end] = RANGES[t.id]

for (const day of dateRange(start, end)) {
  let events
  try {
    events = await fetchDay(day)
  } catch (e) {
    console.error(`skip ${day}: ${e}`)
    continue
  }
  for (const ev of events) {
    const parsed = parseEvent(t, ev)
    if (!parsed) {
      misses.push(`${day}: unmapped event ${JSON.stringify(ev.competitions[0]?.competitors.map((c) => c.team.displayName))}`)
      continue
    }
    const evDate = parsed.kickoff.slice(0, 10)
    // Match on team pair; kickoff may land a day off our local "date" field.
    const hit = matches.find(
      (m) =>
        ((m.home === parsed.homeTeam && m.away === parsed.awayTeam) ||
          (m.home === parsed.awayTeam && m.away === parsed.homeTeam)) &&
        Math.abs(new Date(m.date).getTime() - new Date(evDate).getTime()) < 3 * 86400e3 &&
        result[m.id] === undefined,
    )
    if (!hit) {
      misses.push(`${day}: no match for ${parsed.homeTeam} v ${parsed.awayTeam}`)
      continue
    }
    const flipped = hit.home === parsed.awayTeam
    result[hit.id] = {
      kickoff: parsed.kickoff,
      // Goals stay keyed by team id, so orientation doesn't matter; only
      // warn if ESPN's home/away disagrees with ours.
      ...(flipped ? { flipped: true } : {}),
      ...(parsed.goals ? { goals: parsed.goals } : {}),
    }
  }
  await new Promise((r) => setTimeout(r, 150))
}

console.log(JSON.stringify(result, null, 1))
console.error(`mapped ${Object.keys(result).length}/${matches.length}; misses: ${misses.length}`)
for (const miss of misses.slice(0, 10)) console.error('  ' + miss)
