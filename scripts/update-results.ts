/**
 * Daily results updater for World Cup 2026 — run by the scheduled GitHub
 * Action (or by hand: `npx tsx scripts/update-results.ts`).
 *
 * Fetches finished matches from ESPN's public scoreboard and writes scores,
 * goals, penalties, and resolved knockout teams into src/data/wc2026.ts.
 * Only matches that don't have a score yet are touched, and `npm run check`
 * must pass afterwards (the workflow refuses to commit otherwise).
 *
 * Knockout events are matched to bracket slots by checking which slot each
 * team can legally fill (group winner/runner-up via recomputed standings,
 * best-third membership, or feeder-match winner/loser).
 */
import { readFileSync, writeFileSync } from 'fs'
import { tournaments } from '../src/data'
import { groupStandings } from '../src/data/standings'
import { matchLoser, matchWinner } from '../src/data/types'
import type { Goal, KnockoutMatch, SlotRef, TeamId, Tournament } from '../src/data/types'
import { fetchDay, parseEvent } from './espn'
import type { ParsedEvent } from './espn'

const FILE = 'src/data/wc2026.ts'
const t = tournaments.wc2026

function tsGoals(goals: Goal[]): string {
  const items = goals.map((g) => {
    const parts = [
      `team: '${g.team}'`,
      `player: ${JSON.stringify(g.player)}`,
      `minute: ${JSON.stringify(g.minute)}`,
    ]
    if (g.penalty) parts.push('penalty: true')
    if (g.ownGoal) parts.push('ownGoal: true')
    return `{ ${parts.join(', ')} }`
  })
  return `goals: [${items.join(', ')}]`
}

function satisfies(slot: SlotRef, team: TeamId, tt: Tournament): boolean {
  switch (slot.type) {
    case 'group-rank': {
      const rows = groupStandings(tt, slot.group)
      return rows[slot.rank - 1]?.team === team
    }
    case 'best-third':
      return slot.groups.some((g) => groupStandings(tt, g)[2]?.team === team)
    case 'match-winner': {
      const src = findKnockout(tt, slot.match)
      return src !== null && matchWinner(src) === team
    }
    case 'match-loser': {
      const src = findKnockout(tt, slot.match)
      return src !== null && matchLoser(src) === team
    }
  }
}

function findKnockout(tt: Tournament, id: string): KnockoutMatch | null {
  for (const r of tt.knockoutRounds) {
    const m = r.matches.find((x) => x.id === id)
    if (m) return m
  }
  return null
}

function applyGroupResult(src: string, id: string, ev: ParsedEvent, flipped: boolean): string {
  const score = flipped
    ? { home: ev.score!.away, away: ev.score!.home }
    : ev.score!
  const insertion = `, score: { home: ${score.home}, away: ${score.away} }${ev.goals ? `, ${tsGoals(ev.goals)}` : ''}`
  const re = new RegExp(`(\\{ id: '${id}',[^\\n]*?away: '[A-Z]{3}')`)
  if (!re.test(src)) throw new Error(`could not locate group match ${id}`)
  return src.replace(re, (m) => m + insertion)
}

function applyKnockoutResult(src: string, m: KnockoutMatch, ev: ParsedEvent, flipped: boolean): string {
  const homeTeam = flipped ? ev.awayTeam : ev.homeTeam
  const awayTeam = flipped ? ev.homeTeam : ev.awayTeam
  const score = flipped ? { home: ev.score!.away, away: ev.score!.home } : ev.score!
  const pens = ev.penalties
    ? flipped
      ? { home: ev.penalties.away, away: ev.penalties.home }
      : ev.penalties
    : null

  const idIdx = src.indexOf(`id: '${m.id}',`)
  if (idIdx === -1) throw new Error(`could not locate knockout match ${m.id}`)
  const close = src.indexOf('\n        },', idIdx)
  if (close === -1) throw new Error(`could not find end of ${m.id}`)

  let block = ''
  block += `          homeTeam: '${homeTeam}', awayTeam: '${awayTeam}', score: { home: ${score.home}, away: ${score.away} },\n`
  if (ev.afterExtraTime || pens) block += `          afterExtraTime: true,${pens ? ` penalties: { home: ${pens.home}, away: ${pens.away} },` : ''}\n`
  if (ev.goals) block += `          ${tsGoals(ev.goals)},\n`

  let out = src.slice(0, close + 1) + block + src.slice(close + 1)
  // Fill kickoff on the date line if it's still missing.
  if (!m.kickoff) {
    out = out.replace(`id: '${m.id}', date: '${m.date}',`, `id: '${m.id}', date: '${m.date}', kickoff: '${ev.kickoff}',`)
  }
  return out
}

let src = readFileSync(FILE, 'utf8')
const today = new Date().toISOString().slice(0, 10)
const updated: string[] = []

// Group matches still missing scores, knockouts missing scores.
const pendingGroup = t.groupMatches.filter((m) => m.score === undefined && m.date <= today)
const pendingKnockout = t.knockoutRounds
  .flatMap((r) => r.matches)
  .filter((m) => m.score === undefined && m.date <= today)

const days = new Set([...pendingGroup, ...pendingKnockout].map((m) => m.date.replaceAll('-', '')))

for (const day of [...days].sort()) {
  let events
  try {
    events = await fetchDay(day)
  } catch (e) {
    console.error(`skip ${day}: ${e}`)
    continue
  }
  for (const ev of events) {
    const parsed = parseEvent(t, ev)
    if (!parsed || !parsed.completed || !parsed.score) continue

    const groupHit = pendingGroup.find(
      (m) =>
        (m.home === parsed.homeTeam && m.away === parsed.awayTeam) ||
        (m.home === parsed.awayTeam && m.away === parsed.homeTeam),
    )
    if (groupHit) {
      const flipped = groupHit.home !== parsed.homeTeam
      src = applyGroupResult(src, groupHit.id, parsed, flipped)
      // Log the id only — scores/teams in CI logs would spoil the maintainer.
      updated.push(groupHit.id)
      pendingGroup.splice(pendingGroup.indexOf(groupHit), 1)
      continue
    }

    // Knockouts: find the slot pair both teams can legally fill.
    const evDay = parsed.kickoff.slice(0, 10)
    const candidates = pendingKnockout.filter(
      (m) => Math.abs(new Date(m.date).getTime() - new Date(evDay).getTime()) < 2 * 86400e3,
    )
    const fits = candidates.filter(
      (m) =>
        (satisfies(m.home, parsed.homeTeam, t) && satisfies(m.away, parsed.awayTeam, t)) ||
        (satisfies(m.home, parsed.awayTeam, t) && satisfies(m.away, parsed.homeTeam, t)),
    )
    if (fits.length !== 1) {
      if (candidates.length > 0)
        console.error(`ambiguous knockout mapping near ${evDay} (${fits.length} fits)`)
      continue
    }
    const m = fits[0]
    const flipped = !satisfies(m.home, parsed.homeTeam, t)
    src = applyKnockoutResult(src, m, parsed, flipped)
    // Id only — a knockout matchup reveals who advanced.
    updated.push(m.id)
    pendingKnockout.splice(pendingKnockout.indexOf(m), 1)
  }
  await new Promise((r) => setTimeout(r, 200))
}

if (updated.length > 0) {
  writeFileSync(FILE, src)
  console.log(`updated ${updated.length} match(es):`)
  for (const u of updated) console.log(`  ${u}`)
} else {
  console.log('no new results')
}
