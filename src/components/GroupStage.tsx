import type { Group, GroupMatch, Tournament } from '../data/types'
import { groupStandings } from '../data/standings'
import { groupComplete, isPlayed } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { Rail } from './Rail'
import { formatDate } from './format'

function MatchRow({
  t,
  m,
  progress,
  onOpen,
}: {
  t: Tournament
  m: GroupMatch
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const mark = progress.marks[m.id]
  const home = t.teams[m.home]
  const away = t.teams[m.away]
  const played = isPlayed(m)
  const homeWon = mark && m.score && m.score.home > m.score.away
  const awayWon = mark && m.score && m.score.away > m.score.home

  return (
    <button
      type="button"
      className={`match-row ${mark ? 'is-marked' : ''}`}
      onClick={() => onOpen({ kind: 'group', match: m })}
    >
      <span className={`team team-home ${homeWon ? 'winner' : ''}`}>
        {home.name} <span className="flag">{home.flag}</span>
      </span>
      <span
        className={`match-chip ${
          mark ? 'chip-score' : played ? (m.videos?.length ? 'chip-play' : 'chip-vs') : 'chip-future'
        }`}
      >
        {mark && m.score ? `${m.score.home}–${m.score.away}` : played ? (m.videos?.length ? '▶' : 'vs') : '—'}
      </span>
      <span className={`team team-away ${awayWon ? 'winner' : ''}`}>
        <span className="flag">{away.flag}</span> {away.name}
      </span>
    </button>
  )
}

function Standings({ t, group, progress }: { t: Tournament; group: Group; progress: Progress }) {
  const live = groupStandings(t, group.id, (id) => progress.marks[id] !== undefined)
  const complete = groupComplete(t, group.id, progress.marks)

  return (
    <table className="standings">
      <thead>
        <tr>
          <th className="pos" aria-label="Position"></th>
          <th className="name">Team</th>
          <th>P</th>
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
                <span className="flag">{team.flag}</span> {team.name}
              </td>
              <td>{row.played}</td>
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
  const dates = [...new Set(matches.map((m) => m.date))].sort()

  return (
    <section className="group-card">
      <header className="group-card-header">
        <h3>Group {group.id}</h3>
        <span className={`group-progress ${seen === matches.length ? 'done' : ''}`}>
          {seen}/{matches.length}
        </span>
      </header>
      <Standings t={t} group={group} progress={progress} />
      <div className="group-matches">
        {dates.map((date) => (
          <div key={date} className="match-day">
            <div className="date-caption">{formatDate(date)}</div>
            {matches
              .filter((m) => m.date === date)
              .map((m) => (
                <MatchRow key={m.id} t={t} m={m} progress={progress} onOpen={onOpen} />
              ))}
          </div>
        ))}
      </div>
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
  return (
    <>
      <Rail t={t} progress={progress} onOpen={onOpen} />
      <div className="group-grid">
        {t.groups.map((g) => (
          <GroupCard key={g.id} t={t} group={g} progress={progress} onOpen={onOpen} />
        ))}
      </div>
    </>
  )
}
