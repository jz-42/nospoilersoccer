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

export function defaultTournamentView(
  t: Tournament,
  now: Date = new Date(),
  timeZone?: string,
): View {
  return isTournamentArchived(t, now, timeZone) ? 'bracket' : 'day'
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
