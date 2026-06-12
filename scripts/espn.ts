/**
 * Shared helpers for ESPN's public World Cup scoreboard API — used by the
 * one-off backfill (scripts/backfill-espn.ts) and the daily results updater.
 */
import type { Goal, Tournament } from '../src/data/types'

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'

/** ESPN display names that differ from ours. */
const ALIASES: Record<string, string> = {
  USA: 'United States',
  'Korea Republic': 'South Korea',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Côte d’Ivoire': 'Ivory Coast',
  "Cote d'Ivoire": 'Ivory Coast',
  'Czech Republic': 'Czechia',
  Turkey: 'Türkiye',
  'DR Congo': 'DR Congo',
  'Congo DR': 'DR Congo',
  'Cabo Verde': 'Cape Verde',
}

export interface EspnGoalDetail {
  scoringPlay: boolean
  penaltyKick: boolean
  ownGoal: boolean
  clock: { displayValue: string }
  team: { id: string }
  athletesInvolved?: { displayName: string }[]
}

export interface EspnEvent {
  date: string
  competitions: {
    competitors: {
      homeAway: 'home' | 'away'
      score?: string
      shootoutScore?: number
      winner?: boolean
      team: { id: string; displayName: string }
    }[]
    status: { type: { completed: boolean; detail: string } }
    details?: EspnGoalDetail[]
  }[]
}

export async function fetchDay(yyyymmdd: string): Promise<EspnEvent[]> {
  const res = await fetch(`${BASE}?dates=${yyyymmdd}&limit=50`)
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${yyyymmdd}`)
  const data = (await res.json()) as { events?: EspnEvent[] }
  return data.events ?? []
}

export function teamIdByName(t: Tournament, espnName: string): string | null {
  const name = ALIASES[espnName] ?? espnName
  for (const team of Object.values(t.teams)) {
    if (team.name.toLowerCase() === name.toLowerCase()) return team.id
  }
  return null
}

export interface ParsedEvent {
  homeTeam: string
  awayTeam: string
  kickoff: string
  completed: boolean
  afterExtraTime: boolean
  score?: { home: number; away: number }
  penalties?: { home: number; away: number }
  goals?: Goal[]
}

/**
 * Turn an ESPN event into our shape. Shootout kicks show up in `details` as
 * extra 120' penalty entries, so goals are accumulated only until both sides
 * reconcile with the final score — everything after that is the shootout.
 */
export function parseEvent(t: Tournament, ev: EspnEvent): ParsedEvent | null {
  const comp = ev.competitions[0]
  const home = comp.competitors.find((c) => c.homeAway === 'home')
  const away = comp.competitors.find((c) => c.homeAway === 'away')
  if (!home || !away) return null
  const homeTeam = teamIdByName(t, home.team.displayName)
  const awayTeam = teamIdByName(t, away.team.displayName)
  if (!homeTeam || !awayTeam) return null

  const completed = comp.status.type.completed
  const out: ParsedEvent = {
    homeTeam,
    awayTeam,
    kickoff: ev.date.replace('+00:00', 'Z'),
    completed,
    afterExtraTime: /AET|pen/i.test(comp.status.type.detail),
  }
  if (!completed) return out

  const score = { home: Number(home.score ?? 0), away: Number(away.score ?? 0) }
  out.score = score
  if (home.shootoutScore !== undefined && away.shootoutScore !== undefined) {
    out.penalties = { home: home.shootoutScore, away: away.shootoutScore }
    out.afterExtraTime = true
  }

  const goals: Goal[] = []
  const tally = { home: 0, away: 0 }
  for (const det of comp.details ?? []) {
    if (!det.scoringPlay) continue
    if (tally.home === score.home && tally.away === score.away) break // shootout from here on
    // ESPN's detail.team is already the credited side (own goals included).
    const creditedSide = det.team.id === home.team.id ? 'home' : 'away'
    tally[creditedSide]++
    goals.push({
      team: creditedSide === 'home' ? homeTeam : awayTeam,
      player: det.athletesInvolved?.[0]?.displayName ?? 'Unknown',
      minute: det.clock.displayValue.replace(/\s/g, ''),
      ...(det.penaltyKick ? { penalty: true } : {}),
      ...(det.ownGoal ? { ownGoal: true } : {}),
    })
  }
  if (tally.home === score.home && tally.away === score.away) {
    out.goals = goals
  }
  return out
}

export function* dateRange(startISO: string, endISO: string): Generator<string> {
  const d = new Date(`${startISO}T12:00:00Z`)
  const end = new Date(`${endISO}T12:00:00Z`)
  while (d <= end) {
    yield d.toISOString().slice(0, 10).replaceAll('-', '')
    d.setUTCDate(d.getUTCDate() + 1)
  }
}
