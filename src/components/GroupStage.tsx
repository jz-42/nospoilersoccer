import { useState } from 'react'
import type { Group, TeamId, Tournament } from '../data/types'
import { groupStandings } from '../data/standings'
import { positionOutcome } from '../data/qualification'
import { groupComplete } from '../logic/spoilers'
import { tableZones, zoneAt } from '../data/table-zones'
import type { TableZone } from '../data/table-zones'
import { hasGroups } from '../navigation'
import type { Progress } from '../state/progress'
import { Flag } from './Flag'
import type { ModalTarget } from './MatchModal'
import { MatchTile } from './MatchTile'
import { formatDate } from './format'
import { groupMatchesByLocalDate } from './schedule'

export function sectionGroups(t: Tournament, sectionId: string): Group[] {
  const section = t.groupSections?.find((candidate) => candidate.id === sectionId)
  if (!section) return []
  const ids = new Set(section.groupIds)
  return t.groups.filter((group) => ids.has(group.id))
}

export function groupDisplayName(group: Group): string {
  return group.label ?? `Group ${group.id}`
}

const outcomeTone = {
  qualify: 'qualify',
  promote: 'qualify',
  playoff: 'playoff',
  stay: null,
  relegate: 'drop',
} as const

/**
 * A World Cup group is four teams in a narrow card, so it shows only what
 * separates them: played, goal difference, points. A league table is one wide
 * column for the whole season, where W/D/L is what people actually read a
 * table for — and there is room for it. Same component, same maths; the extra
 * columns appear only when the competition is a single table.
 */
function Standings({
  t,
  group,
  progress,
  zones,
}: {
  t: Tournament
  group: Group
  progress: Progress
  zones: TableZone[]
}) {
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
          const advances = !t.groupSections && complete && t.advancingRanks.includes(i + 1)
          const zone = zoneAt(zones, i + 1)
          const outcome = t.groupSections && complete
            ? positionOutcome(t, group.id, i + 1, (id) => progress.marks[id] !== undefined)
            : null
          const tone = outcome ? outcomeTone[outcome.kind] : null
          return (
            <tr
              key={row.team}
              className={`${advances ? 'advances' : ''} ${zone ? `zone-${zone.kind}` : ''} ${tone ? `zone-${tone}` : ''}`.trim()}
            >
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

  /*
   * Bands only once every team has a result to its name. This table is built
   * from the matches you've opened, so a team you haven't reached yet sits on
   * nought and sorts alphabetically — reveal one match and Bournemouth is
   * fourth, Tottenham nineteenth, both on the letter they start with. A
   * Champions League bar drawn there is inventing a standing. Once nobody is
   * left at zero the order is a real, if partial, ranking, and the note under
   * the table says how partial.
   */
  const played = new Set<TeamId>()
  for (const m of matches) {
    if (progress.marks[m.id] !== undefined) {
      played.add(m.home)
      played.add(m.away)
    }
  }
  const zones = single && group.teams.every((id) => played.has(id)) ? tableZones(t) : []
  const outcomes = t.groupSections && groupComplete(t, group.id, progress.marks)
    ? group.teams.map((_, index) => positionOutcome(
        t,
        group.id,
        index + 1,
        (id) => progress.marks[id] !== undefined,
      )).filter((outcome) => outcome && outcomeTone[outcome.kind] !== null)
    : []
  const legend = [...new Map(outcomes.map((outcome) => [
    `${outcome!.kind}:${outcome!.label}`,
    outcome!,
  ])).values()]

  return (
    <section className="group-card">
      {/* A single-table competition's heading is the tab you clicked to get
          here — "Table" above the Table tab. Its slot goes to the thing the
          table can't say for itself: how much of the season it knows about. */}
      {!single && (
        <header className="group-card-header">
          <h3>{groupDisplayName(group)}</h3>
          {/* "4/6" is a readable goal for a World Cup group. "30/380" for a
              league season is just a number ticking in the corner of a table
              nobody is trying to clear — same call as the header meter. */}
          <span className={`group-progress ${seen === matches.length ? 'done' : ''}`}>
            {seen}/{matches.length}
          </span>
        </header>
      )}
      <Standings t={t} group={group} progress={progress} zones={zones} />
      {legend.length > 0 && (
        <ul className="table-legend group-outcome-legend">
          {legend.map((outcome) => (
            <li
              key={`${outcome.kind}:${outcome.label}`}
              className={`table-legend-item zone-${outcomeTone[outcome.kind]}`}
            >
              {outcome.label}
            </li>
          ))}
        </ul>
      )}
      {single && (
        <footer className="table-footer">
          {zones.length > 0 && (
            <ul className="table-legend">
              {zones.map((z) => (
                <li key={z.kind} className={`table-legend-item zone-${z.kind}`}>
                  {z.label}
                </li>
              ))}
            </ul>
          )}
          <p className="table-note">
            {seen === 0
              ? 'This table fills in as you reveal results.'
              : `Built from the ${seen} of ${matches.length} results you've revealed.`}
          </p>
        </footer>
      )}
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
  const [sectionId, setSectionId] = useState(() => t.groupSections?.[0]?.id)
  // One table shouldn't sit in a 380px column with dead space beside it, and
  // twelve shouldn't stretch to the full page. Same grid, different track.
  if (t.groupSections && sectionId) {
    const visibleGroups = sectionGroups(t, sectionId)
    return (
      <div className="group-stage">
        <div className="group-sections" role="tablist" aria-label="Nations League divisions">
          {t.groupSections.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={section.id === sectionId}
              className={`group-section-tab ${section.id === sectionId ? 'active' : ''}`}
              onClick={() => setSectionId(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
        <div className="group-grid">
          {visibleGroups.map((group) => (
            <GroupCard key={group.id} t={t} group={group} progress={progress} onOpen={onOpen} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={`group-grid ${hasGroups(t) ? '' : 'group-grid-single'}`}>
      {t.groups.map((g) => (
        <GroupCard key={g.id} t={t} group={g} progress={progress} onOpen={onOpen} />
      ))}
    </div>
  )
}
