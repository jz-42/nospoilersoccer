import type { KnockoutMatch, Tournament } from '../data/types'
import { isPlayed, knockoutReady, resolveSlot, slotLabel } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { formatDate } from './format'

/**
 * Lay the knockout tree out world-cup style: two halves feeding inward to the
 * final at the center. Column order is computed from the slot refs, so each
 * match always sits beside the games that feed it.
 */
interface Layout {
  /** Outermost round first; one list per round, top-to-bottom order. */
  leftCols: KnockoutMatch[][]
  rightCols: KnockoutMatch[][]
  roundNames: string[] // names for cols, outermost first (e.g. R16, QF, SF)
  final: KnockoutMatch
  thirdPlace: KnockoutMatch | null
}

function buildLayout(t: Tournament): Layout | null {
  const mainRounds = t.knockoutRounds.filter((r) => r.id !== 'third-place')
  if (mainRounds.length < 2) return null
  const finalRound = mainRounds[mainRounds.length - 1]
  if (finalRound.matches.length !== 1) return null
  const final = finalRound.matches[0]

  const byId = new Map<string, KnockoutMatch>()
  for (const r of mainRounds) for (const m of r.matches) byId.set(m.id, m)

  const feeders = (m: KnockoutMatch): KnockoutMatch[] => {
    const out: KnockoutMatch[] = []
    for (const slot of [m.home, m.away]) {
      if (slot.type === 'match-winner') {
        const f = byId.get(slot.match)
        if (f) out.push(f)
      }
    }
    return out
  }

  // From one semi-final, walk outward collecting each round's matches in
  // bracket order (a match's home feeder sits above its away feeder).
  const half = (root: KnockoutMatch | undefined): KnockoutMatch[][] => {
    if (!root) return []
    const cols: KnockoutMatch[][] = [[root]]
    for (;;) {
      const next = cols[0].flatMap(feeders)
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
  return { leftCols, rightCols, roundNames, final, thirdPlace }
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
}: {
  t: Tournament
  m: KnockoutMatch
  roundName: string
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const mark = progress.marks[m.id]
  const ready = knockoutReady(t, m, progress.marks, progress.revealed)
  const locked = !ready && !mark
  const state = mark ? 'done' : ready ? (isPlayed(m) ? 'ready' : 'future') : 'locked'

  return (
    <button
      type="button"
      className={`ko-card ko-${state}`}
      onClick={() => onOpen({ kind: 'knockout', match: m, roundName })}
    >
      <div className="ko-meta">
        <span>{formatDate(m.date)}</span>
        {!mark && ready && (m.videos?.length ?? 0) > 0 && <span className="ko-play">▶</span>}
        {locked && <span className="ko-lock">🔒</span>}
        {mark && <span className="ko-check">✓</span>}
      </div>
      <SlotRow t={t} m={m} side="home" progress={progress} />
      <SlotRow t={t} m={m} side="away" progress={progress} />
    </button>
  )
}

function Column({
  t,
  matches,
  side,
  isFirst,
  roundName,
  progress,
  onOpen,
}: {
  t: Tournament
  matches: KnockoutMatch[]
  side: 'left' | 'right'
  isFirst: boolean
  roundName: string
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  // Pair up matches: each pair feeds one match in the next column inward.
  const groups: KnockoutMatch[][] = []
  if (matches.length === 1) groups.push(matches)
  else for (let i = 0; i < matches.length; i += 2) groups.push(matches.slice(i, i + 2))

  return (
    <div className={`b-col side-${side}`}>
      <div className="b-round-name">{roundName}</div>
      <div className="b-col-body">
        {groups.map((pair) => (
          <div key={pair[0].id} className={pair.length === 2 ? 'b-pair' : 'b-single'}>
            {pair.map((m) => (
              <div key={m.id} className={`b-slot has-out ${isFirst ? '' : 'has-in'}`}>
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
    // Fallback: simple left-to-right columns (covers unusual configs).
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

  const { leftCols, rightCols, roundNames, final, thirdPlace } = layout
  const finalRoundName = t.knockoutRounds.find((r) => r.id !== 'third-place' && r.matches.includes(final))?.name ?? 'Final'

  return (
    <div className={`bracket ${leftCols.length > 3 ? 'bracket-deep' : ''}`}>
      {leftCols.map((col, i) => (
        <Column
          key={`l${i}`}
          t={t}
          matches={col}
          side="left"
          isFirst={i === 0}
          roundName={roundNames[i]}
          progress={progress}
          onOpen={onOpen}
        />
      ))}

      <div className="b-col b-center">
        <div className="b-round-name">{finalRoundName}</div>
        <div className="b-col-body">
          <div className="b-single">
            <div className="b-slot has-in-left has-in-right">
              <div className="b-final">
                <KnockoutCard
                  t={t}
                  m={final}
                  roundName={finalRoundName}
                  progress={progress}
                  onOpen={onOpen}
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
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}
