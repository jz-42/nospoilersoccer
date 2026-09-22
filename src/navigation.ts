import { matchLocalDate } from './components/schedule'
import type { Tournament } from './data/types'
import { localDateKey } from './time/local'

export type View = 'day' | 'groups' | 'bracket'

/** The two league-phase windows in which Nations League is the top competition. */
export function isNationsLeaguePriorityWindow(now: Date = new Date()): boolean {
  const date = localDateKey(now)
  return (date >= '2026-09-24' && date <= '2026-10-06')
    || (date >= '2026-11-12' && date <= '2026-11-17')
}

function tournamentMatches(t: Tournament) {
  return [
    ...t.groupMatches,
    ...t.knockoutRounds.flatMap((round) => round.matches),
  ]
}

export function tournamentMatchDates(t: Tournament, timeZone?: string): string[] {
  return [
    ...new Set(tournamentMatches(t).map((match) => matchLocalDate(match, timeZone))),
  ].sort()
}

export function isTournamentArchived(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): boolean {
  const finalDate = tournamentMatchDates(t, timeZone).at(-1)
  return finalDate !== undefined && localDateKey(now, timeZone) > finalDate
}

/**
 * Shape is derived from the data, never configured: a competition played in one
 * table has a single group, and one without a bracket has no knockout rounds.
 * A config flag could contradict the data; a derivation cannot.
 */
export function hasKnockouts(t: Tournament): boolean {
  return t.knockoutRounds.length > 0
}

export function hasGroups(t: Tournament): boolean {
  return t.groups.length > 1
}

/** 'Group stage' for a cup, 'Table' or 'League phase' for a single-table competition. */
export function tableTabLabel(t: Tournament): string {
  return t.tableLabel ?? 'Group stage'
}

/** A single-table competition's round name: 'Matchweek' or 'Matchday'. */
export function roundLabel(t: Tournament): string {
  return t.roundLabel ?? 'Matchday'
}

/** The tabs this competition can show, in display order. */
export function availableViews(t: Tournament): View[] {
  return ['day', 'groups', ...(hasKnockouts(t) ? (['bracket'] as const) : [])]
}

/**
 * Always the day rail. Every competition opens the same way, on the same tab,
 * so switching between them does not also switch what you are looking at.
 *
 * A finished competition used to open on its result — the bracket, or the
 * final table. That is the one thing a no-spoiler app must not do: it is the
 * standings, and the standings are the ending. `dayRailInitialDate` puts an
 * archived competition at its *first* matchday instead, which is where someone
 * catching up actually wants to start.
 */
export function defaultTournamentView(): View {
  return 'day'
}

/**
 * One name for the day rail, in every competition. The tab names a *view*, not
 * a date — the rail's own anchor chip says which day you are standing on.
 */
export function dayTabLabel(): 'Today' {
  return 'Today'
}

export function dayRailInitialDate(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): string {
  if (!isTournamentArchived(t, now, timeZone)) return localDateKey(now, timeZone)
  // Finished competition: open at the beginning, not the end. Landing on the
  // final day of a tournament you have not watched is a spoiler in itself.
  return tournamentMatchDates(t, timeZone)[0] ?? localDateKey(now, timeZone)
}
