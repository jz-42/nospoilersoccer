import { matchLocalDate } from './components/schedule'
import type { Tournament } from './data/types'
import { localDateKey } from './time/local'

export type View = 'day' | 'groups' | 'bracket'

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

/** The tabs this competition can show, in display order. */
export function availableViews(t: Tournament): View[] {
  return ['day', 'groups', ...(hasKnockouts(t) ? (['bracket'] as const) : [])]
}

export function defaultTournamentView(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): View {
  if (!isTournamentArchived(t, now, timeZone)) return 'day'
  // A finished competition opens on its result: the bracket if it has one,
  // otherwise the final table.
  return hasKnockouts(t) ? 'bracket' : 'groups'
}

export function dayTabLabel(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): 'Today' | 'Day' {
  return isTournamentArchived(t, now, timeZone) ? 'Day' : 'Today'
}

export function dayRailInitialDate(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): string {
  if (!isTournamentArchived(t, now, timeZone)) return localDateKey(now, timeZone)
  return tournamentMatchDates(t, timeZone).at(-1) ?? localDateKey(now, timeZone)
}
