import type { KnockoutMatch, SlotRef, Tournament } from '../data/types'
import { matchWinner } from '../data/types'
import { resolveSlot, slotLabel, slotUnlocked } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import { ChampionMoment } from './Champion'
import type { ModalTarget } from './MatchModal'
import { matchState } from './status'
import { formatDate, formatKickoffShort } from './format'

/**
 * World-cup bracket layout: two halves feeding inward to the final at the
 * center, column order computed from the slot refs so each match always sits
 * beside the games that feed it. Connectors are state-aware — when a match
 * is marked, its outgoing line turns green, so winners visibly "flow"
 * through the bracket.
 */
interface Layout {
  leftCols: KnockoutMatch[][]
  rightCols: KnockoutMatch[][]
  roundNames: string[]
  final: KnockoutMatch
  thirdPlace: KnockoutMatch | null
  feeders: Map<string, KnockoutMatch[]>
}

function buildLayout(t: Tournament): Layout | null {
  const mainRounds = t.knockoutRounds.filter((r) => r.id !== 'third-place')
  if (mainRounds.length < 2) return null
  const finalRound = mainRounds[mainRounds.length - 1]
  if (finalRound.matches.length !== 1) return null
  const final = finalRound.matches[0]

  const byId = new Map<string, KnockoutMatch>()
  for (const r of mainRounds) for (const m of r.matches) byId.set(m.id, m)

  const feeders = new Map<string, KnockoutMatch[]>()
  const feedersOf = (m: KnockoutMatch): KnockoutMatch[] => {
    if (!feeders.has(m.id)) {
      const out: KnockoutMatch[] = []
      for (const slot of [m.home, m.away]) {
        if (slot.type === 'match-winner') {
          const f = byId.get(slot.match)
          if (f) out.push(f)
        }
      }
      feeders.set(m.id, out)
    }
    return feeders.get(m.id)!
  }

  const half = (root: KnockoutMatch | undefined): KnockoutMatch[][] => {
    if (!root) return []
    const cols: KnockoutMatch[][] = [[root]]
    for (;;) {
      const next = cols[0].flatMap(feedersOf)
      if (next.length === 0) break
      cols.unshift(next)
    }
    return cols
  }

  const [homeFeeder, awayFeeder] = [final.home, final.away].map((slot) =>
    slot.type === 'match-winner' ? byId.get(slot.match) : undefined,
  )
  if (!homeFeeder || !awayFeeder) return null

  const leftCols = half(homeFeeder)
  const rightCols = half(awayFeeder)
  if (leftCols.length !== rightCols.length) return null

  const roundNames = mainRounds.slice(0, mainRounds.length - 1).map((r) => r.name)
  if (roundNames.length !== leftCols.length) return null

  const thirdPlace = t.knockoutRounds.find((r) => r.id === 'third-place')?.matches[0] ?? null
  return { leftCols, rightCols, roundNames, final, thirdPlace, feeders }
}

function SlotRow({
  t,
  m,
  side,
  progress,
}: {
  t: Tournament
  m: KnockoutMatch
  side: 'home' | 'away'
  progress: Progress
}) {
  const mark = progress.marks[m.id]
  const teamId = resolveSlot(t, m, side, progress.marks, progress.revealed)
  const slot = side === 'home' ? m.home : m.away

  if (teamId === null) {
    return (
      <div className="ko-row">
        <span className="ko-placeholder">{slotLabel(t, slot)}</span>
      </div>
    )
  }

  const team = t.teams[teamId]
  const score = m.score
  const myGoals = score ? (side === 'home' ? score.home : score.away) : null
  const myPens = m.penalties ? (side === 'home' ? m.penalties.home : m.penalties.away) : null
  const theirPens = m.penalties ? (side === 'home' ? m.penalties.away : m.penalties.home) : null
  const theirGoals = score ? (side === 'home' ? score.away : score.home) : null
  const won =
    mark && score
      ? myPens !== null && theirPens !== null
        ? myPens > theirPens
        : myGoals! > theirGoals!
      : false

  return (
    <div className={`ko-row ${won ? 'winner' : ''}`}>
      <span className="ko-team">
        <span className="flag">{team.flag}</span> {team.name}
      </span>
      {mark && score && (
        <span className="ko-score">
          {myGoals}
          {myPens !== null ? <span className="pens">({myPens})</span> : null}
        </span>
      )}
    </div>
  )
}

function KnockoutCard({
  t,
  m,
  roundName,
  progress,
  onOpen,
  champion,
}: {
  t: Tournament
  m: KnockoutMatch
  roundName: string
  progress: Progress
  onOpen: (target: ModalTarget) => void
  champion?: boolean
}) {
  const state = matchState(t, { kind: 'knockout', match: m, roundName }, progress)
  const pinned = progress.pins.has(m.id)
  const homeR = resolveSlot(t, m, 'home', progress.marks, progress.revealed)
  const awayR = resolveSlot(t, m, 'away', progress.marks, progress.revealed)
  const fav =
    progress.favAuto &&
    ((homeR !== null && progress.favorites.includes(homeR)) ||
      (awayR !== null && progress.favorites.includes(awayR)))

  const status =
    state === 'watch' ? (
      <span className="ko-pill pill-watch">
        <svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
        Watch
      </span>
    ) : state === 'ft' ? (
      <span className="ko-pill pill-ft">FT</span>
    ) : state === 'seen' ? (
      <span className="ko-pill pill-seen">✓</span>
    ) : state === 'locked' ? (
      <span className="ko-pill pill-locked" title="Finish the games that decide this matchup">
        <svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor" aria-hidden="true">
          <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" />
        </svg>
      </span>
    ) : (
      <span className="ko-pill pill-upcoming">{formatKickoffShort(m.kickoff) ?? ''}</span>
    )

  return (
    <button
      type="button"
      className={`ko-card state-${state} ${champion ? 'ko-champ' : ''} ${
        pinned ? 'is-pinned' : fav ? 'is-fav' : ''
      }`}
      onClick={() => onOpen({ kind: 'knockout', match: m, roundName })}
    >
      <div className="ko-meta">
        <span>{formatDate(m.date)}</span>
        {status}
      </div>
      <SlotRow t={t} m={m} side="home" progress={progress} />
      <SlotRow t={t} m={m} side="away" progress={progress} />
    </button>
  )
}

/** Short origin tag for an outermost slot, e.g. "1A", "2B", "3rd". */
function chipLabel(slot: SlotRef): string | null {
  if (slot.type === 'group-rank') return `${slot.rank}${slot.group}`
  if (slot.type === 'best-third') return '3rd'
  return null
}

function chipTitle(t: Tournament, slot: SlotRef): string {
  return slotLabel(t, slot)
}

/** Narrow column of group-origin chips feeding the outermost round. */
function FeedColumn({
  t,
  matches,
  side,
  progress,
}: {
  t: Tournament
  matches: KnockoutMatch[]
  side: 'left' | 'right'
  progress: Progress
}) {
  const groups: KnockoutMatch[][] = []
  for (let i = 0; i < matches.length; i += 2) groups.push(matches.slice(i, i + 2))

  return (
    <div className={`b-col b-col-feeds side-${side}`} aria-hidden="true">
      <div className="b-round-name">&nbsp;</div>
      <div className="b-col-body">
        {groups.map((pair) => (
          <div key={pair[0].id} className="b-pair b-pair-feeds">
            {pair.map((m) => (
              <div key={m.id} className="b-slot">
                <div className="feed-chips">
                  {[m.home, m.away].map((slot, i) => {
                    const label = chipLabel(slot)
                    if (!label) return null
                    const flowing = slotUnlocked(t, slot, progress.marks)
                    return (
                      <span
                        key={i}
                        className={`feed-chip ${flowing ? 'flow' : ''}`}
                        title={chipTitle(t, slot)}
                      >
                        {label}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Column({
  t,
  matches,
  side,
  isFirst,
  roundName,
  progress,
  feeders,
  onOpen,
}: {
  t: Tournament
  matches: KnockoutMatch[]
  side: 'left' | 'right'
  isFirst: boolean
  roundName: string
  progress: Progress
  feeders: Map<string, KnockoutMatch[]>
  onOpen: (target: ModalTarget) => void
}) {
  const groups: KnockoutMatch[][] = []
  if (matches.length === 1) groups.push(matches)
  else for (let i = 0; i < matches.length; i += 2) groups.push(matches.slice(i, i + 2))

  const inFlow = (m: KnockoutMatch) => {
    const f = feeders.get(m.id) ?? []
    return f.length > 0 && f.every((x) => progress.marks[x.id] !== undefined)
  }

  return (
    <div className={`b-col side-${side}`}>
      <div className="b-round-name">{roundName}</div>
      <div className="b-col-body">
        {groups.map((pair) => (
          <div
            key={pair[0].id}
            className={`${pair.length === 2 ? 'b-pair' : 'b-single'} ${
              progress.marks[pair[0].id] ? 'flow-top' : ''
            } ${pair[1] && progress.marks[pair[1].id] ? 'flow-bottom' : ''}`}
          >
            {pair.map((m) => (
              <div
                key={m.id}
                className={`b-slot has-out ${isFirst ? '' : 'has-in'} ${
                  progress.marks[m.id] ? 'flow-out' : ''
                } ${inFlow(m) ? 'flow-in' : ''}`}
              >
                <KnockoutCard
                  t={t}
                  m={m}
                  roundName={roundName}
                  progress={progress}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Bracket({
  t,
  progress,
  onOpen,
}: {
  t: Tournament
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const layout = buildLayout(t)

  if (!layout) {
    return (
      <div className="bracket bracket-simple">
        {t.knockoutRounds.map((round) => (
          <div key={round.id} className="b-col">
            <div className="b-round-name">{round.name}</div>
            <div className="b-col-body">
              {round.matches.map((m) => (
                <div key={m.id} className="b-slot">
                  <KnockoutCard
                    t={t}
                    m={m}
                    roundName={round.name}
                    progress={progress}
                    onOpen={onOpen}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const { leftCols, rightCols, roundNames, final, thirdPlace, feeders } = layout
  const finalRoundName =
    t.knockoutRounds.find((r) => r.id !== 'third-place' && r.matches.includes(final))?.name ?? 'Final'
  const championId = progress.marks[final.id] ? matchWinner(final) : null
  const champion = championId ? t.teams[championId] : null

  const finalInLeft = (feeders.get(final.id) ?? [])[0]
  const finalInRight = (feeders.get(final.id) ?? [])[1]

  return (
    <div className={`bracket ${leftCols.length > 3 ? 'bracket-deep' : ''}`}>
      <FeedColumn t={t} matches={leftCols[0]} side="left" progress={progress} />
      {leftCols.map((col, i) => (
        <Column
          key={`l${i}`}
          t={t}
          matches={col}
          side="left"
          isFirst={i === 0}
          roundName={roundNames[i]}
          progress={progress}
          feeders={feeders}
          onOpen={onOpen}
        />
      ))}

      <div className="b-col b-center">
        <div className="b-round-name">{finalRoundName}</div>
        <div className="b-col-body">
          {champion && (
            <div className="b-champ">
              <ChampionMoment t={t} team={champion} />
            </div>
          )}
          <div className="b-single">
            <div
              className={`b-slot has-in-left has-in-right ${
                finalInLeft && progress.marks[finalInLeft.id] ? 'flow-in-left' : ''
              } ${finalInRight && progress.marks[finalInRight.id] ? 'flow-in-right' : ''}`}
            >
              <div className="b-final">
                <KnockoutCard
                  t={t}
                  m={final}
                  roundName={finalRoundName}
                  progress={progress}
                  onOpen={onOpen}
                  champion={champion !== null}
                />
              </div>
            </div>
          </div>
          {thirdPlace && (
            <div className="b-third">
              <div className="b-round-name">Third place</div>
              <KnockoutCard
                t={t}
                m={thirdPlace}
                roundName="Third-place play-off"
                progress={progress}
                onOpen={onOpen}
              />
            </div>
          )}
        </div>
      </div>

      {[...rightCols].reverse().map((col, i) => (
        <Column
          key={`r${i}`}
          t={t}
          matches={col}
          side="right"
          isFirst={i === rightCols.length - 1}
          roundName={[...roundNames].reverse()[i]}
          progress={progress}
          feeders={feeders}
          onOpen={onOpen}
        />
      ))}
      <FeedColumn t={t} matches={rightCols[0]} side="right" progress={progress} />
    </div>
  )
}
