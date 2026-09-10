import type { Group, Tournament } from '../data/types'
import { groupStandings } from '../data/standings'
import { groupComplete } from '../logic/spoilers'
import { hasGroups, tableTabLabel } from '../navigation'
import type { Progress } from '../state/progress'
import { Flag } from './Flag'
import type { ModalTarget } from './MatchModal'
import { MatchTile } from './MatchTile'
import { formatDate } from './format'
import { groupMatchesByLocalDate } from './schedule'

/**
 * A World Cup group is four teams in a narrow card, so it shows only what
 * separates them: played, goal difference, points. A league table is one wide
 * column for the whole season, where W/D/L is what people actually read a
 * table for — and there is room for it. Same component, same maths; the extra
 * columns appear only when the competition is a single table.
 */
function Standings({ t, group, progress }: { t: Tournament; group: Group; progress: Progress }) {
  const live = groupStandings(t, group.id, (id) => progress.marks[id] !== undefined)
  const complete = groupComplete(t, group.id, progress.marks)
  const full = !hasGroups(t)

  return (
    <table className="standings">
      <thead>
        <tr>
          <th className="pos" aria-label="Position"></th>
          <th className="name">Team</th>
          <th>P</th>
          {full && (
            <>
              <th>W</th>
              <th>D</th>
              <th>L</th>
            </>
          )}
          <th>GD</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {live.map((row, i) => {
          const team = t.teams[row.team]
          const advances = complete && t.advancingRanks.includes(i + 1)
          return (
            <tr key={row.team} className={advances ? 'advances' : ''}>
              <td className="pos">{i + 1}</td>
              <td className="name">
                <Flag team={team} className="flag" /> {team.name}
              </td>
              <td>{row.played}</td>
              {full && (
                <>
                  <td>{row.won}</td>
                  <td>{row.drawn}</td>
                  <td>{row.lost}</td>
                </>
              )}
              <td>{row.goalsFor - row.goalsAgainst > 0 ? '+' : ''}{row.goalsFor - row.goalsAgainst}</td>
              <td className="pts">{row.points}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function GroupCard({
  t,
  group,
  progress,
  onOpen,
}: {
  t: Tournament
  group: Group
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const matches = t.groupMatches.filter((m) => m.group === group.id)
  const seen = matches.filter((m) => progress.marks[m.id] !== undefined).length
  const single = !hasGroups(t)
  // A World Cup group is six matches, so listing them under its table is the
  // whole group at a glance. A league season is 380 — the same list becomes a
  // 26,000px scroll that nobody reads, and browsing by date is what the Today
  // rail already does well. So a single-table competition shows the table and
  // stops there.
  const matchDays = single ? [] : groupMatchesByLocalDate(matches)

  return (
    <section className="group-card">
      <header className="group-card-header">
        <h3>{single ? tableTabLabel(t) : `Group ${group.id}`}</h3>
        <span className={`group-progress ${seen === matches.length ? 'done' : ''}`}>
          {seen}/{matches.length}
        </span>
      </header>
      <Standings t={t} group={group} progress={progress} />
      {matchDays.length > 0 && (
        <div className="group-matches">
          {matchDays.map(({ date, matches: dayMatches }) => (
            <div key={date} className="match-day">
              <div className="date-caption">{formatDate(date)}</div>
              {dayMatches.map((m) => (
                <MatchTile key={m.id} t={t} m={m} progress={progress} onOpen={onOpen} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function GroupStage({
  t,
  progress,
  onOpen,
}: {
  t: Tournament
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  // One table shouldn't sit in a 380px column with dead space beside it, and
  // twelve shouldn't stretch to the full page. Same grid, different track.
  return (
    <div className={`group-grid ${hasGroups(t) ? '' : 'group-grid-single'}`}>
      {t.groups.map((g) => (
        <GroupCard key={g.id} t={t} group={g} progress={progress} onOpen={onOpen} />
      ))}
    </div>
  )
}
