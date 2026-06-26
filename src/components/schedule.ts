import type { GroupMatch, KnockoutMatch } from '../data/types'
import { localDateKey } from '../time/local'

type ScheduledMatch = Pick<GroupMatch | KnockoutMatch, 'date' | 'kickoff'>

/** Visitor-local calendar date, with stored schedule date as a legacy fallback. */
export function matchLocalDate(match: ScheduledMatch, timeZone?: string): string {
  return match.kickoff ? localDateKey(match.kickoff, timeZone) : match.date
}

/** Group and sort matches by their visitor-local calendar date. */
export function groupMatchesByLocalDate<T extends GroupMatch | KnockoutMatch>(
  matches: readonly T[],
  timeZone?: string,
): { date: string; matches: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const match of matches) {
    const date = matchLocalDate(match, timeZone)
    const group = groups.get(date)
    if (group) group.push(match)
    else groups.set(date, [match])
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayMatches]) => ({
      date,
      matches: dayMatches.sort((a, b) =>
        (a.kickoff ?? a.date).localeCompare(b.kickoff ?? b.date),
      ),
    }))
}
