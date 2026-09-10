/**
 * ESPN ingest for the club competitions — Premier League, La Liga and the
 * Champions League, 2026-27.
 *
 *   npx tsx scripts/espn-club.ts                    # regenerate all three
 *   npx tsx scripts/espn-club.ts --competition ucl  # just one
 *   npx tsx scripts/espn-club.ts --dry-run          # print, write nothing
 *   npx tsx scripts/espn-club.ts --registry         # clubs.ts entries we lack
 *
 * Unlike the World Cup updater, which surgically patches results into a
 * hand-maintained file, a club season is regenerated whole from the feed every
 * run: ESPN serves an entire season in one ranged scoreboard call, so there is
 * no partial state to get wrong. Curated highlights live in a separate file
 * (see src/data/club/with-videos.ts) precisely so this script can overwrite
 * its own output without ever touching the curator's.
 *
 * Everything that can go wrong fails closed. A club ESPN knows and the
 * registry doesn't, a knockout round we can't bucket, a bracket slot we can't
 * derive — each drops the fixture and reports it, rather than guessing. A
 * missing fixture is visible and fixable; a wrong one silently misattributes a
 * result.
 */
import { writeFileSync } from 'fs'
import { parseEvent } from './espn'
import type { EspnEvent } from './espn'
import type {
  Goal,
  GroupMatch,
  KnockoutMatch,
  KnockoutRound,
  MatchLiveStatus,
  Score,
  TeamId,
  Tie,
  Tiebreak,
  Tournament,
} from '../src/data/types'
import { clubIdByEspnId, clubs } from '../src/data/club/clubs'

const SITE_API = 'https://site.api.espn.com/apis/site/v2/sports/soccer'
const CORE_API = 'https://site.api.espn.com/apis/v2/sports/soccer'
/** The single table every club competition here is played as. */
export const LEAGUE_GROUP = 'league'

// ---- competition table -----------------------------------------------------

export interface ClubKnockoutRound {
  id: string
  name: string
  /** ESPN calendar/series labels that mean this round. */
  espnLabels: string[]
  twoLegged: boolean
}

export interface ClubCompetitionConfig {
  id: string
  espnSlug: string
  name: string
  /** Heading for the single table. */
  tableLabel: string
  /** Absent means the default goal-difference → goals-for chain. */
  tiebreakers?: Tiebreak[]
  /**
   * Every rank a knockout slot may reference. The validator checks slot ranks
   * against this, so it is the set of positions that reach a knockout round —
   * empty for a league that ends with the table.
   */
  advancingRanks: number[]
  knockoutRounds: ClubKnockoutRound[]
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

export const CLUB_COMPETITIONS: Record<string, ClubCompetitionConfig> = {
  eng1: {
    id: 'eng1',
    espnSlug: 'eng.1',
    name: 'Premier League',
    tableLabel: 'Table',
    advancingRanks: [],
    knockoutRounds: [],
  },
  esp1: {
    id: 'esp1',
    espnSlug: 'esp.1',
    name: 'La Liga',
    tableLabel: 'Table',
    // La Liga settles level teams head-to-head before goal difference. This is
    // a visible difference in table order, not a rounding detail.
    tiebreakers: ['head-to-head', 'goal-difference', 'goals-for'],
    advancingRanks: [],
    knockoutRounds: [],
  },
  ucl: {
    id: 'ucl',
    espnSlug: 'uefa.champions',
    name: 'Champions League',
    // No groups since 2024-25: one 36-team league phase, then knockouts.
    tableLabel: 'League phase',
    // Top 8 go straight to the round of 16; 9th-24th play the knockout playoff.
    advancingRanks: range(1, 24),
    knockoutRounds: [
      { id: 'ko-playoff', name: 'Knockout playoff', espnLabels: ['Knockout Round Playoffs'], twoLegged: true },
      { id: 'r16', name: 'Round of 16', espnLabels: ['Rd of 16', 'Round of 16'], twoLegged: true },
      { id: 'qf', name: 'Quarter-finals', espnLabels: ['Quarterfinals', 'Quarterfinal'], twoLegged: true },
      { id: 'sf', name: 'Semi-finals', espnLabels: ['Semifinals', 'Semifinal'], twoLegged: true },
      { id: 'final', name: 'Final', espnLabels: ['Final'], twoLegged: false },
    ],
  },
}

export const SEASON_YEAR = 2026

// ---- ESPN shapes we read beyond scripts/espn.ts ----------------------------

interface EspnSeries {
  title?: string
  completed?: boolean
  totalCompetitions?: number
  competitors?: { id: string; winner?: boolean; aggregateScore?: number }[]
}

/** An ESPN event plus the club-only fields the World Cup feed never carries. */
export interface ClubEspnEvent extends EspnEvent {
  id: string
  competitions: (EspnEvent['competitions'][number] & {
    leg?: { value: number }
    series?: EspnSeries
  })[]
}

export interface EspnCalendarEntry {
  label: string
  startDate: string
  endDate: string
}

// ---- parsing ---------------------------------------------------------------

export interface ClubSeries {
  title: string
  completed: boolean
  /** Aggregate by our team id; absent until ESPN publishes one. */
  aggregate?: Record<TeamId, number>
  winner?: TeamId
}

export interface ClubEvent {
  espnEventId: string
  homeTeam: TeamId
  awayTeam: TeamId
  kickoff: string
  date: string
  completed: boolean
  afterExtraTime: boolean
  score?: Score
  /** Shootout, in this event's own orientation. Belongs to the tie, not the leg. */
  penalties?: Score
  goals?: Goal[]
  liveStatus?: MatchLiveStatus
  leg?: 1 | 2
  series?: ClubSeries
}

export type ClubEventResult =
  | { status: 'ok'; event: ClubEvent }
  | { status: 'unknown-club'; espnIds: string[] }
  | { status: 'unparsable' }

/**
 * Turn one ESPN event into our shape.
 *
 * Clubs are matched on ESPN's numeric team id, never on a display name, so a
 * club renaming itself upstream can't quietly become a second team. The actual
 * score/goal/shootout parsing is `parseEvent()` from scripts/espn.ts, shared
 * verbatim with the World Cup path — it already knows that shootout kicks
 * arrive as extra 120' entries and stops accumulating goals once both sides
 * reconcile with the final score. To reuse it we hand it a two-team stand-in
 * tournament whose names are ESPN's own, which is the one input it resolves on.
 */
export function parseClubEvent(ev: ClubEspnEvent): ClubEventResult {
  const comp = ev.competitions[0]
  if (!comp) return { status: 'unparsable' }
  const home = comp.competitors.find((c) => c.homeAway === 'home')
  const away = comp.competitors.find((c) => c.homeAway === 'away')
  if (!home || !away) return { status: 'unparsable' }

  const homeTeam = clubIdByEspnId(home.team.id)
  const awayTeam = clubIdByEspnId(away.team.id)
  if (!homeTeam || !awayTeam) {
    const missing = [
      ...(homeTeam ? [] : [`${home.team.id} (${home.team.displayName})`]),
      ...(awayTeam ? [] : [`${away.team.id} (${away.team.displayName})`]),
    ]
    return { status: 'unknown-club', espnIds: missing }
  }

  const shim: Tournament = {
    id: 'espn-club-shim',
    name: 'shim',
    year: SEASON_YEAR,
    advancingRanks: [],
    teams: {
      [homeTeam]: { id: homeTeam, name: home.team.displayName },
      [awayTeam]: { id: awayTeam, name: away.team.displayName },
    },
    groups: [],
    groupMatches: [],
    knockoutRounds: [],
  }
  const parsed = parseEvent(shim, ev)
  if (!parsed) return { status: 'unparsable' }

  const event: ClubEvent = {
    espnEventId: ev.id,
    homeTeam: parsed.homeTeam,
    awayTeam: parsed.awayTeam,
    kickoff: parsed.kickoff,
    // Every fixture here kicks off in European daytime/evening, so the UTC
    // date and the competition's local date are always the same day.
    date: parsed.kickoff.slice(0, 10),
    completed: parsed.completed,
    afterExtraTime: Boolean(parsed.afterExtraTime),
  }
  if (parsed.score) event.score = parsed.score
  if (parsed.penalties) event.penalties = parsed.penalties
  if (parsed.goals) event.goals = parsed.goals
  if (parsed.liveStatusMode === 'set' && parsed.liveStatus) event.liveStatus = parsed.liveStatus

  const leg = comp.leg?.value
  if (leg === 1 || leg === 2) event.leg = leg

  const series = comp.series
  if (series?.title) {
    const parsedSeries: ClubSeries = { title: series.title, completed: Boolean(series.completed) }
    const aggregate: Record<TeamId, number> = {}
    let winner: TeamId | undefined
    for (const c of series.competitors ?? []) {
      const id = clubIdByEspnId(c.id)
      if (!id) continue
      if (typeof c.aggregateScore === 'number') aggregate[id] = c.aggregateScore
      if (c.winner) winner = id
    }
    if (Object.keys(aggregate).length === 2) parsedSeries.aggregate = aggregate
    if (winner) parsedSeries.winner = winner
    event.series = parsedSeries
  }

  return { status: 'ok', event }
}

// ---- round bucketing -------------------------------------------------------

/**
 * Which configured round an event belongs to, or null for the league phase.
 *
 * ESPN's season calendar is the primary signal because it is the only one that
 * covers the final — a single-leg final carries neither `leg` nor `series`.
 * `series.title` is the fallback, and an event that matches neither is dropped
 * rather than guessed at.
 */
export function roundIdForEvent(
  config: ClubCompetitionConfig,
  ev: ClubEvent,
  calendar: EspnCalendarEntry[],
): { status: 'league' } | { status: 'knockout'; roundId: string } | { status: 'unknown'; label: string } {
  if (config.knockoutRounds.length === 0) return { status: 'league' }

  const labels: string[] = []
  const at = Date.parse(ev.kickoff)
  for (const entry of calendar) {
    if (at >= Date.parse(entry.startDate) && at <= Date.parse(entry.endDate)) labels.push(entry.label)
  }
  if (ev.series?.title) labels.push(ev.series.title)

  for (const label of labels) {
    if (/league phase/i.test(label)) return { status: 'league' }
    const round = config.knockoutRounds.find((r) =>
      r.espnLabels.some((l) => l.toLowerCase() === label.toLowerCase()),
    )
    if (round) return { status: 'knockout', roundId: round.id }
  }
  return { status: 'unknown', label: labels.join(' / ') || 'no label' }
}

// ---- matchday --------------------------------------------------------------

/**
 * ESPN's club scoreboard carries no matchday number, so it is counted off the
 * fixture list: a match is a team's nth of the season, and the matchday is the
 * later of the two sides' counts. Chronological, so a rescheduled game lands on
 * the round it was actually played in rather than the one it was drawn for.
 */
export function assignMatchdays(
  fixtures: { id: string; kickoff: string; home: TeamId; away: TeamId }[],
): Map<string, number> {
  const ordered = [...fixtures].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))
  const played = new Map<TeamId, number>()
  const out = new Map<string, number>()
  for (const f of ordered) {
    const home = (played.get(f.home) ?? 0) + 1
    const away = (played.get(f.away) ?? 0) + 1
    played.set(f.home, home)
    played.set(f.away, away)
    out.set(f.id, Math.max(home, away))
  }
  return out
}

// ---- tie derivation --------------------------------------------------------

export const pairKey = (a: TeamId, b: TeamId) => [a, b].sort().join('|')

export interface DerivedTie {
  tie: Tie
  legs: KnockoutMatch[]
}

function orient(score: Score, flipped: boolean): Score {
  return flipped ? { home: score.away, away: score.home } : score
}

/**
 * Build one two-legged tie from its legs.
 *
 * The aggregate, the winner and the shootout are published only once ESPN
 * marks the series complete — a half-derived aggregate would be a result the
 * user hasn't earned. The shootout is held on the tie rather than on leg 2
 * because leg 2's own 90-minute score is usually *not* level when a tie goes to
 * penalties (2-0, then 0-2), and a shootout hanging off a non-level scoreline
 * is neither true nor checkable.
 */
export function buildTie(tieId: string, events: ClubEvent[]): DerivedTie | null {
  const ordered = [...events].sort(
    (a, b) => (a.leg ?? 0) - (b.leg ?? 0) || a.kickoff.localeCompare(b.kickoff),
  )
  if (ordered.length !== 2) return null
  const [first, second] = ordered

  const tie: Tie = {
    id: tieId,
    legs: [`${tieId}-l1`, `${tieId}-l2`],
    homeTeam: first.homeTeam,
    awayTeam: first.awayTeam,
  }

  const series = second.series ?? first.series
  if (series?.completed && series.aggregate) {
    const home = series.aggregate[tie.homeTeam!]
    const away = series.aggregate[tie.awayTeam!]
    if (typeof home === 'number' && typeof away === 'number') {
      tie.aggregate = { home, away }
      if (home === away && second.penalties) {
        tie.penalties = orient(second.penalties, second.homeTeam !== tie.homeTeam)
      }
    }
    if (series.winner) tie.winner = series.winner
  }

  const legs = ordered.map((ev, i): KnockoutMatch => {
    const leg = (i + 1) as 1 | 2
    const match: KnockoutMatch = {
      id: `${tieId}-l${leg}`,
      tie: { id: tieId, leg },
      date: ev.date,
      kickoff: ev.kickoff,
      // Slot refs are filled in by the bracket pass, which needs every round.
      home: { type: 'match-winner', match: '' },
      away: { type: 'match-winner', match: '' },
      homeTeam: ev.homeTeam,
      awayTeam: ev.awayTeam,
    }
    if (ev.liveStatus) match.liveStatus = ev.liveStatus
    if (ev.score) match.score = ev.score
    if (ev.goals) match.goals = ev.goals
    if (ev.afterExtraTime) match.afterExtraTime = true
    return match
  })

  return { tie, legs }
}

/**
 * Stable tie numbering. A round's ties are drawn together but reach the feed
 * over several days, so numbering them fresh each run would renumber a tie the
 * moment a later one appeared — and tie ids key both the curated highlights and
 * the user's saved progress. Ids already in the previous generation are kept;
 * only genuinely new pairings take a number, the lowest free one.
 */
export function assignTieIds(
  competitionId: string,
  roundId: string,
  pairs: { key: string; kickoff: string }[],
  previous: Map<string, string>,
): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  for (const p of pairs) {
    const known = previous.get(`${roundId}|${p.key}`)
    if (known) {
      out.set(p.key, known)
      used.add(known)
    }
  }
  const ordered = [...pairs].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.key.localeCompare(b.key))
  let next = 1
  for (const p of ordered) {
    if (out.has(p.key)) continue
    let id = `${competitionId}-${roundId}-${next}`
    while (used.has(id)) {
      next += 1
      id = `${competitionId}-${roundId}-${next}`
    }
    out.set(p.key, id)
    used.add(id)
    next += 1
  }
  return out
}

// ---- season assembly -------------------------------------------------------

export interface SeasonBuild {
  tournament: Tournament
  audit: string[]
}

export interface SeasonInput {
  config: ClubCompetitionConfig
  year: number
  /** Every event of the season, league phase and knockouts alike. */
  events: ClubEvent[]
  calendar: EspnCalendarEntry[]
  /** Table membership, from the standings endpoint. */
  tableTeams: TeamId[]
  /** Final table position per team, as ESPN ranks it. */
  ranks: Map<TeamId, number>
  /** `${roundId}|${pairKey}` → tie id, from the previous generation. */
  previousTieIds: Map<string, string>
}

export function buildSeason(input: SeasonInput): SeasonBuild {
  const { config, year, events, calendar, ranks, previousTieIds } = input
  const audit: string[] = []

  const leagueEvents: ClubEvent[] = []
  const knockoutEvents = new Map<string, ClubEvent[]>()
  for (const ev of events) {
    const round = roundIdForEvent(config, ev, calendar)
    if (round.status === 'league') {
      leagueEvents.push(ev)
    } else if (round.status === 'knockout') {
      const list = knockoutEvents.get(round.roundId) ?? []
      list.push(ev)
      knockoutEvents.set(round.roundId, list)
    } else {
      audit.push(`event ${ev.espnEventId} (${ev.date}) has no known round: ${round.label}`)
    }
  }

  // --- the table ---
  const teamIds = [...new Set([...input.tableTeams, ...leagueEvents.flatMap((e) => [e.homeTeam, e.awayTeam])])].sort()

  const leagueFixtures = leagueEvents
    .map((ev) => ({ ev, id: `${config.id}-${ev.homeTeam}-${ev.awayTeam}` }))
    .sort((a, b) => a.ev.kickoff.localeCompare(b.ev.kickoff) || a.id.localeCompare(b.id))

  const seenIds = new Set<string>()
  const uniqueFixtures = leagueFixtures.filter(({ id, ev }) => {
    if (seenIds.has(id)) {
      audit.push(`duplicate fixture id ${id} (ESPN event ${ev.espnEventId}) — dropped`)
      return false
    }
    seenIds.add(id)
    return true
  })

  const matchdays = assignMatchdays(
    uniqueFixtures.map(({ id, ev }) => ({ id, kickoff: ev.kickoff, home: ev.homeTeam, away: ev.awayTeam })),
  )

  const groupMatches: GroupMatch[] = uniqueFixtures.map(({ id, ev }) => {
    const m: GroupMatch = {
      id,
      group: LEAGUE_GROUP,
      matchday: matchdays.get(id) ?? 1,
      date: ev.date,
      kickoff: ev.kickoff,
      home: ev.homeTeam,
      away: ev.awayTeam,
    }
    if (ev.liveStatus) m.liveStatus = ev.liveStatus
    if (ev.score) m.score = ev.score
    if (ev.goals) m.goals = ev.goals
    return m
  })

  // --- the bracket ---
  const tiesByRound = new Map<string, DerivedTie[]>()
  const singlesByRound = new Map<string, ClubEvent[]>()

  for (const round of config.knockoutRounds) {
    const roundEvents = knockoutEvents.get(round.id) ?? []
    if (roundEvents.length === 0) continue
    if (!round.twoLegged) {
      singlesByRound.set(round.id, roundEvents)
      continue
    }
    const byPair = new Map<string, ClubEvent[]>()
    for (const ev of roundEvents) {
      const key = pairKey(ev.homeTeam, ev.awayTeam)
      byPair.set(key, [...(byPair.get(key) ?? []), ev])
    }
    const ids = assignTieIds(
      config.id,
      round.id,
      [...byPair].map(([key, evs]) => ({
        key,
        kickoff: evs.map((e) => e.kickoff).sort()[0],
      })),
      previousTieIds,
    )
    const derived: DerivedTie[] = []
    for (const [key, evs] of byPair) {
      // One leg published so far is normal a week before the second; the tie
      // only exists once both are known, so its id stays reserved and it
      // appears next run.
      if (evs.length !== 2) {
        audit.push(`${round.id} tie ${key} has ${evs.length} leg(s) — held until both are published`)
        continue
      }
      const tie = buildTie(ids.get(key)!, evs)
      if (!tie) {
        audit.push(`${round.id} tie ${key} could not be assembled — dropped`)
        continue
      }
      derived.push(tie)
    }
    if (derived.length > 0) tiesByRound.set(round.id, derived)
  }

  const roundIndex = new Map(config.knockoutRounds.map((r, i) => [r.id, i]))

  /**
   * Where a team in `roundId` came from. The round before it is the only place
   * it can have come from, so a team in exactly one of those ties necessarily
   * won it — that's an entailment, not a guess, and it keeps the bracket intact
   * even if ESPN is slow to set the series `winner` flag. A team that skipped
   * the previous round (the Champions League's top eight enter at the round of
   * 16) is placed by its league position instead.
   */
  const slotRefFor = (team: TeamId, roundId: string): KnockoutMatch['home'] | null => {
    const index = roundIndex.get(roundId) ?? 0
    const previousRound = config.knockoutRounds[index - 1]
    if (previousRound) {
      const candidates = (tiesByRound.get(previousRound.id) ?? []).filter(
        (d) => d.tie.homeTeam === team || d.tie.awayTeam === team,
      )
      if (candidates.length === 1) return { type: 'match-winner', match: candidates[0].tie.id }
      if (candidates.length > 1) return null
    }
    const rank = ranks.get(team)
    if (rank !== undefined && config.advancingRanks.includes(rank)) {
      return { type: 'group-rank', group: LEAGUE_GROUP, rank }
    }
    return null
  }

  const knockoutRounds: KnockoutRound[] = []
  const ties: Tie[] = []

  for (const round of config.knockoutRounds) {
    const matches: KnockoutMatch[] = []

    for (const derived of tiesByRound.get(round.id) ?? []) {
      const homeRef = slotRefFor(derived.tie.homeTeam!, round.id)
      const awayRef = slotRefFor(derived.tie.awayTeam!, round.id)
      if (!homeRef || !awayRef) {
        audit.push(`tie ${derived.tie.id}: could not place both sides in the bracket — dropped`)
        continue
      }
      for (const leg of derived.legs) {
        const flipped = leg.homeTeam !== derived.tie.homeTeam
        leg.home = flipped ? awayRef : homeRef
        leg.away = flipped ? homeRef : awayRef
        matches.push(leg)
      }
      ties.push(derived.tie)
    }

    for (const ev of singlesByRound.get(round.id) ?? []) {
      const homeRef = slotRefFor(ev.homeTeam, round.id)
      const awayRef = slotRefFor(ev.awayTeam, round.id)
      if (!homeRef || !awayRef) {
        audit.push(`${round.id} ${ev.espnEventId}: could not place both sides in the bracket — dropped`)
        continue
      }
      const m: KnockoutMatch = {
        id: `${config.id}-${round.id}`,
        date: ev.date,
        kickoff: ev.kickoff,
        home: homeRef,
        away: awayRef,
        homeTeam: ev.homeTeam,
        awayTeam: ev.awayTeam,
      }
      if (ev.liveStatus) m.liveStatus = ev.liveStatus
      if (ev.score) m.score = ev.score
      if (ev.goals) m.goals = ev.goals
      if (ev.afterExtraTime) m.afterExtraTime = true
      if (ev.penalties) m.penalties = ev.penalties
      matches.push(m)
    }

    if (matches.length === 0) continue
    matches.sort((a, b) => (a.kickoff ?? '').localeCompare(b.kickoff ?? '') || a.id.localeCompare(b.id))
    knockoutRounds.push({ id: round.id, name: round.name, matches })
  }

  const tournament: Tournament = {
    id: `${config.id}-${year}`,
    name: config.name,
    year,
    advancingRanks: config.advancingRanks,
    tableLabel: config.tableLabel,
    teams: Object.fromEntries(teamIds.map((id) => [id, clubs[id]])),
    groups: [{ id: LEAGUE_GROUP, teams: teamIds }],
    groupMatches,
    knockoutRounds,
  }
  if (config.tiebreakers) tournament.tiebreakers = config.tiebreakers
  if (ties.length > 0) tournament.ties = ties

  return { tournament, audit }
}

// ---- serialization ---------------------------------------------------------

/** Ids, slugs and ISO dates only — everything here is ASCII by construction. */
const q = (s: string) => `'${s}'`
/** Anything that came from a human: player names carry apostrophes and accents. */
const j = (s: string) => JSON.stringify(s)
const scoreTs = (s: Score) => `{ home: ${s.home}, away: ${s.away} }`

function goalsTs(goals: Goal[]): string {
  const items = goals.map((g) => {
    const parts = [`team: ${q(g.team)}`, `player: ${j(g.player)}`, `minute: ${j(g.minute)}`]
    if (g.penalty) parts.push('penalty: true')
    if (g.ownGoal) parts.push('ownGoal: true')
    return `{ ${parts.join(', ')} }`
  })
  return `[${items.join(', ')}]`
}

function slotTs(slot: KnockoutMatch['home']): string {
  switch (slot.type) {
    case 'group-rank':
      return `{ type: 'group-rank', group: ${q(slot.group)}, rank: ${slot.rank} }`
    case 'best-third':
      return `{ type: 'best-third', groups: [${slot.groups.map(q).join(', ')}] }`
    default:
      return `{ type: ${q(slot.type)}, match: ${q(slot.match)} }`
  }
}

function liveStatusTs(status: MatchLiveStatus): string {
  return `{ kind: ${q(status.kind)} }`
}

function groupMatchTs(m: GroupMatch): string {
  const parts = [
    `id: ${q(m.id)}`,
    `group: ${q(m.group)}`,
    `matchday: ${m.matchday}`,
    `date: ${q(m.date)}`,
  ]
  if (m.kickoff) parts.push(`kickoff: ${q(m.kickoff)}`)
  parts.push(`home: ${q(m.home)}`, `away: ${q(m.away)}`)
  if (m.liveStatus) parts.push(`liveStatus: ${liveStatusTs(m.liveStatus)}`)
  if (m.score) parts.push(`score: ${scoreTs(m.score)}`)
  if (m.goals) parts.push(`goals: ${goalsTs(m.goals)}`)
  return `{ ${parts.join(', ')} }`
}

function knockoutMatchTs(m: KnockoutMatch): string {
  const parts = [`id: ${q(m.id)}`]
  if (m.tie) parts.push(`tie: { id: ${q(m.tie.id)}, leg: ${m.tie.leg} }`)
  parts.push(`date: ${q(m.date)}`)
  if (m.kickoff) parts.push(`kickoff: ${q(m.kickoff)}`)
  parts.push(`home: ${slotTs(m.home)}`, `away: ${slotTs(m.away)}`)
  if (m.homeTeam) parts.push(`homeTeam: ${q(m.homeTeam)}`)
  if (m.awayTeam) parts.push(`awayTeam: ${q(m.awayTeam)}`)
  if (m.liveStatus) parts.push(`liveStatus: ${liveStatusTs(m.liveStatus)}`)
  if (m.score) parts.push(`score: ${scoreTs(m.score)}`)
  if (m.afterExtraTime) parts.push('afterExtraTime: true')
  if (m.penalties) parts.push(`penalties: ${scoreTs(m.penalties)}`)
  if (m.goals) parts.push(`goals: ${goalsTs(m.goals)}`)
  return `{ ${parts.join(', ')} }`
}

function tieTs(tie: Tie): string {
  const parts = [`id: ${q(tie.id)}`, `legs: [${tie.legs.map(q).join(', ')}]`]
  if (tie.homeTeam) parts.push(`homeTeam: ${q(tie.homeTeam)}`)
  if (tie.awayTeam) parts.push(`awayTeam: ${q(tie.awayTeam)}`)
  if (tie.aggregate) parts.push(`aggregate: ${scoreTs(tie.aggregate)}`)
  if (tie.penalties) parts.push(`penalties: ${scoreTs(tie.penalties)}`)
  if (tie.winner) parts.push(`winner: ${q(tie.winner)}`)
  return `{ ${parts.join(', ')} }`
}

export const seasonExportName = (competitionId: string, year: number) => `${competitionId}_${year}`
export const videosExportName = (competitionId: string, year: number) => `${competitionId}_${year}_videos`
export const seasonModulePath = (competitionId: string, year: number) =>
  `src/data/club/${competitionId}-${year}.ts`
export const videosModulePath = (competitionId: string, year: number) =>
  `src/data/club/${competitionId}-${year}-videos.ts`

export function serializeSeason(t: Tournament, config: ClubCompetitionConfig, year: number): string {
  const seasonName = seasonExportName(config.id, year)
  const videosName = videosExportName(config.id, year)
  const teamIds = t.groups[0]?.teams ?? []

  const lines: string[] = [
    '// Generated — do not hand-edit',
    '/**',
    ` * ${t.name} ${year}-${String(year + 1).slice(2)}, ingested from ESPN.`,
    ' *',
    ' * GENERATED by scripts/espn-club.ts — rewritten whole on every run, so any',
    ' * hand edit is lost silently. Curated highlights live in the sibling',
    ` * ${config.id}-${year}-videos.ts, which the curator owns end-to-end and this`,
    ' * file only reads; that split is why regenerating fixtures can never drop a',
    ' * cut. Teams come from the shared registry in ./clubs, so a club playing in',
    ' * two competitions is one team with one id, one crest and one palette.',
    ' */',
    "import type { TeamId, Tournament } from '../types'",
    "import { clubs } from './clubs'",
    `import { ${videosName} } from './${config.id}-${year}-videos'`,
    "import { withClubVideos } from './with-videos'",
    '',
    `const teamIds: TeamId[] = [${teamIds.map(q).join(', ')}]`,
    '',
    'const base: Tournament = {',
    `  id: ${q(t.id)},`,
    `  name: ${j(t.name)},`,
    `  year: ${t.year},`,
    `  advancingRanks: [${t.advancingRanks.join(', ')}],`,
  ]
  if (t.tableLabel) lines.push(`  tableLabel: ${j(t.tableLabel)},`)
  if (t.tiebreakers) lines.push(`  tiebreakers: [${t.tiebreakers.map(q).join(', ')}],`)
  lines.push(
    '  teams: Object.fromEntries(teamIds.map((id) => [id, clubs[id]] as const)),',
    `  groups: [{ id: ${q(t.groups[0]?.id ?? LEAGUE_GROUP)}, teams: [...teamIds] }],`,
  )

  if (t.groupMatches.length === 0) {
    lines.push('  groupMatches: [],')
  } else {
    lines.push('  groupMatches: [')
    for (const m of t.groupMatches) lines.push(`    ${groupMatchTs(m)},`)
    lines.push('  ],')
  }

  if (t.knockoutRounds.length === 0) {
    lines.push('  knockoutRounds: [],')
  } else {
    lines.push('  knockoutRounds: [')
    for (const round of t.knockoutRounds) {
      lines.push(`    {`, `      id: ${q(round.id)},`, `      name: ${j(round.name)},`, '      matches: [')
      for (const m of round.matches) lines.push(`        ${knockoutMatchTs(m)},`)
      lines.push('      ],', '    },')
    }
    lines.push('  ],')
  }

  if (t.ties?.length) {
    lines.push('  ties: [')
    for (const tie of t.ties) lines.push(`    ${tieTs(tie)},`)
    lines.push('  ],')
  }

  lines.push('}', '', `export const ${seasonName}: Tournament = withClubVideos(base, ${videosName})`, '')
  return lines.join('\n')
}

// ---- ESPN client -----------------------------------------------------------

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN ${res.status} for ${url}`)
  return res.json()
}

/**
 * The whole season in one call. ESPN's scoreboard accepts a date range and
 * returns every fixture in it, played and unplayed, with the same goal details
 * a single-day query gives — so there is no reason to walk the calendar day by
 * day, and no window for a partially-ingested season.
 */
export async function fetchSeasonEvents(slug: string, year: number): Promise<ClubEspnEvent[]> {
  const from = `${year}0701`
  const to = `${year + 1}0701`
  const data = (await getJson(`${SITE_API}/${slug}/scoreboard?dates=${from}-${to}&limit=1000`)) as {
    events?: ClubEspnEvent[]
  }
  return data.events ?? []
}

function readCalendar(raw: unknown): EspnCalendarEntry[] {
  if (!Array.isArray(raw)) return []
  const out: EspnCalendarEntry[] = []
  for (const block of raw) {
    const entries = (block as { entries?: unknown } | null)?.entries
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const e = entry as { label?: unknown; startDate?: unknown; endDate?: unknown }
      if (typeof e.label === 'string' && typeof e.startDate === 'string' && typeof e.endDate === 'string') {
        out.push({ label: e.label, startDate: e.startDate, endDate: e.endDate })
      }
    }
  }
  return out
}

/**
 * The season's round calendar. Only competitions with knockouts need it — it is
 * the one signal that identifies a single-leg final, which carries neither a
 * `leg` nor a `series`. Ranged queries don't return a calendar, so this asks
 * for a single day inside the season we want; asking for a date outside it
 * would hand back the *previous* season's rounds, which is why the year is
 * checked before the calendar is trusted.
 */
export async function fetchCalendar(slug: string, year: number): Promise<EspnCalendarEntry[]> {
  const data = (await getJson(`${SITE_API}/${slug}/scoreboard?dates=${year}0901`)) as {
    leagues?: { season?: { year?: number }; calendar?: unknown }[]
  }
  const league = data.leagues?.[0]
  if (!league || league.season?.year !== year) return []
  return readCalendar(league.calendar)
}

export interface ClubTable {
  teams: TeamId[]
  ranks: Map<TeamId, number>
  /** ESPN teams the registry doesn't know, as `id (name)`. */
  unknown: string[]
}

export async function fetchTable(slug: string, year: number): Promise<ClubTable> {
  const data = (await getJson(`${CORE_API}/${slug}/standings`)) as {
    season?: { year?: number }
    standings?: unknown
    children?: { standings?: unknown }[]
  }
  const raw = data.standings ?? data.children?.[0]?.standings
  const entries = (raw as { entries?: unknown } | undefined)?.entries
  const table: ClubTable = { teams: [], ranks: new Map(), unknown: [] }
  if (data.season?.year !== undefined && data.season.year !== year) return table
  if (!Array.isArray(entries)) return table

  for (const entry of entries) {
    const e = entry as {
      team?: { id?: string; displayName?: string }
      stats?: { name?: string; value?: number }[]
    }
    const espnId = e.team?.id
    if (!espnId) continue
    const id = clubIdByEspnId(espnId)
    if (!id) {
      table.unknown.push(`${espnId} (${e.team?.displayName ?? '?'})`)
      continue
    }
    table.teams.push(id)
    const rank = e.stats?.find((s) => s.name === 'rank')?.value
    if (typeof rank === 'number') table.ranks.set(id, rank)
  }
  return table
}

// ---- previous generation ---------------------------------------------------

/**
 * `${roundId}|${pairKey}` → tie id from the last generation, so tie numbering
 * survives a regeneration. Missing or unreadable output is fine: on a first run
 * there is nothing to preserve.
 */
export async function loadPreviousTieIds(competitionId: string, year: number): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  let previous: Tournament | undefined
  try {
    const mod = (await import(`../src/data/club/${competitionId}-${year}.ts`)) as Record<string, unknown>
    previous = Object.values(mod).find(
      (v): v is Tournament => Boolean(v) && typeof v === 'object' && 'groupMatches' in (v as object),
    )
  } catch {
    return out
  }
  if (!previous?.ties) return out
  const byId = new Map(previous.ties.map((t) => [t.id, t]))
  for (const round of previous.knockoutRounds) {
    for (const m of round.matches) {
      const tie = m.tie ? byId.get(m.tie.id) : undefined
      if (!tie?.homeTeam || !tie.awayTeam) continue
      out.set(`${round.id}|${pairKey(tie.homeTeam, tie.awayTeam)}`, tie.id)
    }
  }
  return out
}

// ---- CLI -------------------------------------------------------------------

const dryRun = process.argv.includes('--dry-run')
const registryMode = process.argv.includes('--registry')
const onlyIndex = process.argv.indexOf('--competition')
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null

async function runRegistry() {
  const missing = new Map<string, string>()
  for (const config of Object.values(CLUB_COMPETITIONS)) {
    const table = await fetchTable(config.espnSlug, SEASON_YEAR)
    for (const entry of table.unknown) {
      const m = entry.match(/^(\S+) \((.*)\)$/)
      if (m) missing.set(m[1], m[2])
    }
    for (const ev of await fetchSeasonEvents(config.espnSlug, SEASON_YEAR)) {
      const result = parseClubEvent(ev)
      if (result.status !== 'unknown-club') continue
      for (const entry of result.espnIds) {
        const m = entry.match(/^(\S+) \((.*)\)$/)
        if (m) missing.set(m[1], m[2])
      }
    }
  }
  if (missing.size === 0) {
    console.log('Registry is complete — every club ESPN lists is in src/data/club/clubs.ts.')
    return
  }
  console.log(`${missing.size} club(s) missing from src/data/club/clubs.ts. Pick slugs by hand:\n`)
  for (const [espnId, name] of [...missing].sort((a, b) => a[1].localeCompare(b[1]))) {
    const slug = name.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-')
    console.log(`  ${slug}: { id: '${slug}', name: ${j(name)}, shortName: '???', espnId: '${espnId}' },`)
  }
}

async function runIngest() {
  const configs = only ? [CLUB_COMPETITIONS[only]] : Object.values(CLUB_COMPETITIONS)
  if (configs.some((c) => !c)) throw new Error(`unknown competition '${only}'`)

  for (const config of configs) {
    console.log(`\n${config.name} (${config.espnSlug})`)
    const [raw, calendar, table, previousTieIds] = await Promise.all([
      fetchSeasonEvents(config.espnSlug, SEASON_YEAR),
      config.knockoutRounds.length > 0 ? fetchCalendar(config.espnSlug, SEASON_YEAR) : Promise.resolve([]),
      fetchTable(config.espnSlug, SEASON_YEAR),
      loadPreviousTieIds(config.id, SEASON_YEAR),
    ])

    const events: ClubEvent[] = []
    const problems: string[] = []
    const unknownClubs = new Set(table.unknown)
    for (const ev of raw) {
      const result = parseClubEvent(ev)
      if (result.status === 'ok') events.push(result.event)
      else if (result.status === 'unknown-club') for (const c of result.espnIds) unknownClubs.add(c)
      else problems.push(`event ${ev.id}: could not be parsed`)
    }

    const { tournament, audit } = buildSeason({
      config,
      year: SEASON_YEAR,
      events,
      calendar,
      tableTeams: table.teams,
      ranks: table.ranks,
      previousTieIds,
    })

    const knockoutCount = tournament.knockoutRounds.reduce((n, r) => n + r.matches.length, 0)
    console.log(
      `  ${Object.keys(tournament.teams).length} teams, ${tournament.groupMatches.length} league matches, ` +
        `${knockoutCount} knockout legs, ${tournament.ties?.length ?? 0} ties`,
    )
    for (const c of unknownClubs) {
      problems.push(`club ${c} is not in src/data/club/clubs.ts — its fixtures were dropped`)
    }
    for (const line of [...problems, ...audit]) console.log(`  ! ${line}`)
    if (unknownClubs.size > 0) console.log('  → run with --registry for paste-ready entries')

    const path = seasonModulePath(config.id, SEASON_YEAR)
    if (dryRun) {
      console.log(`  (dry-run — ${path} not written)`)
      continue
    }
    writeFileSync(path, serializeSeason(tournament, config, SEASON_YEAR))
    console.log(`  wrote ${path}`)
  }
}

if (import.meta.main) {
  if (registryMode) await runRegistry()
  else await runIngest()
}
