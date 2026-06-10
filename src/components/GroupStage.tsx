import type { Group, GroupMatch, Tournament } from '../data/types'
import { groupStandings } from '../data/standings'
import { groupComplete } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import { MarkBadge, MarkButtons } from './MatchControls'

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function MatchRow({ t, m, progress }: { t: Tournament; m: GroupMatch; progress: Progress }) {
  const mark = progress.marks[m.id]
  const home = t.teams[m.home]
  const away = t.teams[m.away]
  const homeWon = m.score.home > m.score.away
  const awayWon = m.score.away > m.score.home

  return (
    <div className="match-row">
      <span className={`team team-home ${mark && homeWon ? 'winner' : ''}`}>
        {home.name} <span className="flag">{home.flag}</span>
      </span>
      <span className="match-center">
        {mark ? (
          <span className="score">
            {m.score.home}–{m.score.away}
          </span>
        ) : (
          <MarkButtons onMark={(x) => progress.setMark(m.id, x)} />
        )}
        <span className="match-date">{formatDate(m.date)}</span>
      </span>
      <span className={`team team-away ${mark && awayWon ? 'winner' : ''}`}>
        <span className="flag">{away.flag}</span> {away.name}
      </span>
      {mark && (
        <span className="match-mark">
          <MarkBadge mark={mark} onUndo={() => progress.unmark(m.id)} />
        </span>
      )}
    </div>
  )
}

function Standings({ t, group }: { t: Tournament; group: Group }) {
  const rows = groupStandings(t, group.id)
  return (
    <table className="standings">
      <thead>
        <tr>
          <th className="pos">#</th>
          <th className="name">Team</th>
          <th>P</th>
          <th>GD</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const team = t.teams[row.team]
          const advances = t.advancingRanks.includes(i + 1)
          return (
            <tr key={row.team} className={advances ? 'advances' : ''}>
              <td className="pos">{i + 1}</td>
              <td className="name">
                <span className="flag">{team.flag}</span> {team.name}
              </td>
              <td>{row.played}</td>
              <td>{row.goalsFor - row.goalsAgainst}</td>
              <td className="pts">{row.points}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function GroupCard({ t, group, progress }: { t: Tournament; group: Group; progress: Progress }) {
  const matches = t.groupMatches.filter((m) => m.group === group.id)
  const complete = groupComplete(t, group.id, progress.marks)
  const remaining = matches.filter((m) => progress.marks[m.id] === undefined).length
  const matchdays = [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b)

  return (
    <section className="group-card">
      <h3>Group {group.id}</h3>
      {complete ? (
        <Standings t={t} group={group} />
      ) : (
        <div className="standings-locked">
          🔒 Standings reveal when every match is marked — {remaining} to go
        </div>
      )}
      <div className="group-matches">
        {matchdays.map((md) => (
          <div key={md}>
            <div className="matchday-caption">Matchday {md}</div>
            {matches
              .filter((m) => m.matchday === md)
              .map((m) => (
                <MatchRow key={m.id} t={t} m={m} progress={progress} />
              ))}
          </div>
        ))}
      </div>
    </section>
  )
}

export function GroupStage({ t, progress }: { t: Tournament; progress: Progress }) {
  return (
    <div className="group-grid">
      {t.groups.map((g) => (
        <GroupCard key={g.id} t={t} group={g} progress={progress} />
      ))}
    </div>
  )
}
