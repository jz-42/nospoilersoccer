import { useEffect, useRef, useState } from 'react'
import type { Group, KnockoutMatch, Tournament } from '../data/types'
import { matchWinner } from '../data/types'
import { groupStandings } from '../data/standings'
import type { StandingRow } from '../data/standings'
import { bestThirdSlotGroups, groupComplete, resolveSlot, slotLabel } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import { ChampionMoment } from './Champion'
import { FlowLayer } from './FlowLayer'
import type { FeedLink } from './FlowLayer'
import type { ModalTarget } from './MatchModal'
import { matchState } from './status'
import { formatMatchDate } from './format'
import { KickoffTime } from './KickoffTime'

/**
 * World-cup bracket layout: two halves feeding inward to the final at the
 * center, column order computed from the slot refs so each match always sits
 * beside the games that feed it. Connectors are state-aware — when a match
 * is marked, its outgoing line turns green, so winners visibly "flow"
 * through the bracket.
 *
 * The outermost round (R32) is fed by live group leaderboards flanking each
 * side. A measured SVG overlay (FlowLayer) draws the feed: each group's
 * winner row links to its R32 slot always-on, while the crossing legs
 * (runner-ups, best-third candidates) light up on hover.
 */
/** Highlight colour for an active row/slot — matches its flow line's meaning. */
type HiTone = 'green' | 'yellow' | 'red'

/** Blank tone map for the bracket-only view, where the feeds are switched off. */
const EMPTY_TONE: ReadonlyMap<string, HiTone> = new Map()

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

  // The final isn't visited by half(), so record its feeders (the two
  // semi-finals) explicitly — the third-place lines and the final's flow-in
  // markers both read them back.
  feeders.set(final.id, [homeFeeder, awayFeeder])

  const thirdPlace = t.knockoutRounds.find((r) => r.id === 'third-place')?.matches[0] ?? null
  return { leftCols, rightCols, roundNames, final, thirdPlace, feeders }
}

function SlotRow({
  t,
  m,
  side,
  progress,
  feedKey,
  tone,
}: {
  t: Tournament
  m: KnockoutMatch
  side: 'home' | 'away'
  progress: Progress
  feedKey?: string
  tone?: HiTone
}) {
  const mark = progress.marks[m.id]
  const teamId = resolveSlot(t, m, side, progress.marks, progress.revealed)
  const slot = side === 'home' ? m.home : m.away

  // The slot is a pure line target (data-feed-tgt) — the paths are driven from
  // the standings, so the slot only lights up when a feeding row glows it.
  const rowProps = feedKey ? { 'data-feed-tgt': feedKey } : {}
  const activeCls = tone ? `feed-active feed-${tone}` : ''

  if (teamId === null) {
    return (
      <div className={`ko-row ${activeCls}`} {...rowProps}>
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
    <div className={`ko-row ${won ? 'winner' : ''} ${activeCls}`} {...rowProps}>
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
  feedKeys,
  activeTone,
}: {
  t: Tournament
  m: KnockoutMatch
  roundName: string
  progress: Progress
  onOpen: (target: ModalTarget) => void
  champion?: boolean
  feedKeys?: { home: string; away: string }
  activeTone?: ReadonlyMap<string, HiTone>
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
      <span className="ko-pill pill-upcoming">
        <KickoffTime kickoff={m.kickoff} />
      </span>
    )

  return (
    <button
      type="button"
      className={`ko-card state-${state} ${champion ? 'ko-champ' : ''} ${
        pinned ? 'is-pinned' : fav ? 'is-fav' : ''
      }`}
      onClick={(e) => {
        // Keep any pinned paths when opening a match (the board's clear-on-click
        // only fires for clicks that reach the background).
        e.stopPropagation()
        onOpen({ kind: 'knockout', match: m, roundName })
      }}
    >
      <div className="ko-meta">
        <span>
          {(pinned || fav) && (
            <span className="ko-saved" aria-label="Saved" title="Saved">
              ★
            </span>
          )}
          {formatMatchDate(m.date, m.kickoff)}
        </span>
        {status}
      </div>
      <SlotRow
        t={t}
        m={m}
        side="home"
        progress={progress}
        feedKey={feedKeys?.home}
        tone={feedKeys ? activeTone?.get(feedKeys.home) : undefined}
      />
      <SlotRow
        t={t}
        m={m}
        side="away"
        progress={progress}
        feedKey={feedKeys?.away}
        tone={feedKeys ? activeTone?.get(feedKeys.away) : undefined}
      />
    </button>
  )
}

/** A live group leaderboard in the flank; rows 1–2 are feed sources. */
function FeedStandings({
  t,
  group,
  progress,
  activeTone,
  pinned,
  onFocus,
  onToggle,
}: {
  t: Tournament
  group: Group
  progress: Progress
  activeTone: ReadonlyMap<string, HiTone>
  pinned: ReadonlySet<string>
  onFocus: (key: string | null) => void
  onToggle: (key: string) => void
}) {
  const live = groupStandings(t, group.id, (id) => progress.marks[id] !== undefined)
  const complete = groupComplete(t, group.id, progress.marks)

  return (
    <div className="feed-table">
      <div className="feed-table-name">Group {group.id}</div>
      <table className="standings">
        <tbody>
          {live.map((row, i) => {
            const rank = i + 1
            const team = t.teams[row.team]
            const advances = complete && t.advancingRanks.includes(rank)
            // Where the format has a best-third race (2026) every row is a path
            // source: 1st/2nd green → bracket, 3rd yellow → table, 4th red → out.
            // Otherwise (2022) only the qualifying top two trace a path.
            const srcKey =
              rank <= 2 || (rank <= 4 && !!t.bestThirdCount)
                ? `src-${group.id}-${rank}`
                : undefined
            const tone = srcKey ? activeTone.get(srcKey) : undefined
            // The whole row is the hit target, so it's easy to land on and easy
            // to click off again.
            const hit = srcKey
              ? {
                  onMouseEnter: () => onFocus(srcKey),
                  onMouseLeave: () => onFocus(null),
                  onClick: (e: React.MouseEvent) => {
                    e.stopPropagation()
                    onToggle(srcKey)
                  },
                }
              : {}
            return (
              <tr
                key={row.team}
                data-feed-src={srcKey}
                className={`${advances ? 'advances' : ''} ${srcKey ? 'feed-hit' : ''} ${
                  tone ? `feed-active feed-${tone}` : ''
                } ${srcKey && pinned.has(srcKey) ? 'is-pinned' : ''}`}
                {...hit}
              >
                <td className="pos">{rank}</td>
                <td className="name">
                  <span className="flag">{team.flag}</span> {team.name}
                </td>
                <td className="pts">{row.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Cross-group ranking of third-placed teams, your live results only. */
function liveBestThirds(
  t: Tournament,
  marks: Progress['marks'],
): { group: string; row: StandingRow }[] {
  const include = (id: string) => marks[id] !== undefined
  const rows: { group: string; row: StandingRow }[] = []
  for (const g of t.groups) {
    const s = groupStandings(t, g.id, include)
    if (s[2]) rows.push({ group: g.id, row: s[2] })
  }
  const gd = (r: StandingRow) => r.goalsFor - r.goalsAgainst
  rows.sort(
    (a, b) =>
      b.row.points - a.row.points || gd(b.row) - gd(a.row) || b.row.goalsFor - a.row.goalsFor,
  )
  return rows
}

function BestThirdTable({
  t,
  progress,
  count,
  activeTone,
  pinned,
  onFocus,
  onToggle,
}: {
  t: Tournament
  progress: Progress
  count: number
  activeTone: ReadonlyMap<string, HiTone>
  pinned: ReadonlySet<string>
  onFocus: (key: string | null) => void
  onToggle: (key: string) => void
}) {
  const rows = liveBestThirds(t, progress.marks)
  // 8 of the 12 thirds go through. We show that cut as a live projection from
  // the start — the line, the qualifying eight above it, the four below — and it
  // re-sorts as results land (it's only certain once every group is in).

  const body: React.ReactNode[] = []
  rows.forEach((r, i) => {
    if (i === count)
      body.push(
        <tr key="cutoff" className="bt-cutoff">
          <td colSpan={3} />
        </tr>,
      )
    const team = t.teams[r.row.team]
    const eliminated = i >= count
    const srcKey = `bt-${r.group}`
    const tone = activeTone.get(srcKey)
    // No permanent green for the qualifiers — like the group top-two, they only
    // glow on hover (green → their slot). The cut line and the dimmed bottom four
    // carry the projection at a glance.
    body.push(
      <tr
        key={r.group}
        data-feed-src={srcKey}
        data-feed-tgt={srcKey}
        className={`feed-hit ${eliminated ? 'eliminated' : ''} ${
          tone ? `feed-active feed-${tone}` : ''
        } ${pinned.has(srcKey) ? 'is-pinned' : ''}`}
        onMouseEnter={() => onFocus(srcKey)}
        onMouseLeave={() => onFocus(null)}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(srcKey)
        }}
      >
        <td className="pos grp">{r.group}</td>
        <td className="name">
          <span className="flag">{team.flag}</span> {team.name}
        </td>
        <td className="pts">{r.row.points}</td>
      </tr>,
    )
  })

  return (
    <div className="feed-table feed-table-thirds">
      <div className="feed-table-name">Best 3rd-placed</div>
      <table className="standings">
        <tbody>{body}</tbody>
      </table>
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
  isR32,
  feeds,
  activeTone,
}: {
  t: Tournament
  matches: KnockoutMatch[]
  side: 'left' | 'right'
  isFirst: boolean
  roundName: string
  progress: Progress
  feeders: Map<string, KnockoutMatch[]>
  onOpen: (target: ModalTarget) => void
  isR32: boolean
  feeds: boolean
  activeTone: ReadonlyMap<string, HiTone>
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
                  feedKeys={
                    feeds && isR32 ? { home: `tgt-${m.id}-home`, away: `tgt-${m.id}-away` } : undefined
                  }
                  activeTone={activeTone}
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
  const boardRef = useRef<HTMLDivElement>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set())
  // Off by default: the bracket fills the screen on its own. Turning it on
  // brings back the group-standings flanks, best-third table and feed lines.
  const [detailed, setDetailed] = useState(false)
  const togglePin = (key: string) =>
    setPinned((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const clearPins = () => setPinned((prev) => (prev.size ? new Set() : prev))

  // Escape drops every kept path — the quickest way to undo a click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearPins()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  // Each group's table is placed on the side its *winner* feeds into, ordered
  // top-to-bottom to match its R32 match — so winner lines stay short and flat.
  const winnerSide = new Map<string, 'left' | 'right'>()
  const orderGroups = (col: KnockoutMatch[], side: 'left' | 'right'): string[] => {
    const arr: string[] = []
    for (const m of col)
      for (const slot of [m.home, m.away])
        if (slot.type === 'group-rank' && slot.rank === 1) {
          winnerSide.set(slot.group, side)
          arr.push(slot.group)
        }
    return arr
  }
  const leftGroups = orderGroups(leftCols[0], 'left')
  const rightGroups = orderGroups(rightCols[0], 'right')
  const groupById = (id: string) => t.groups.find((g) => g.id === id)

  const r32Matches = [...leftCols[0], ...rightCols[0]]
  const bestThirdCount = t.bestThirdCount ?? 0
  const links: FeedLink[] = []

  // Live best-third projection: the top `bestThirdCount` thirds are through, the
  // rest are out. It decides green-vs-red for the best-third paths and the cut.
  const thirdsRanked = bestThirdCount > 0 ? liveBestThirds(t, progress.marks) : []
  const advancingThirds = new Set(thirdsRanked.slice(0, bestThirdCount).map((r) => r.group))
  const eliminatedThirds = new Set(thirdsRanked.slice(bestThirdCount).map((r) => r.group))

  // Every path is sourced from a standings/table row and shows where that team
  // heads next: 1st/2nd → R32 (green, through), 3rd → the best-third table
  // (yellow, a maybe), 4th → out (red). In the table a third then resolves to a
  // single green slot if projected through, or red (→ out) if not.
  const projectedBestThirdSlots = bestThirdSlotGroups(t, progress.marks)
  const thirdSlotOf = new Map<string, string>()
  for (const [slotKey, group] of projectedBestThirdSlots) {
    thirdSlotOf.set(group, `tgt-${slotKey}`)
  }
  for (const m of r32Matches) {
    for (const sideKey of ['home', 'away'] as const) {
      const slot = sideKey === 'home' ? m.home : m.away
      const tgtKey = `tgt-${m.id}-${sideKey}`
      if (slot.type === 'group-rank') {
        links.push({
          id: `r-${m.id}-${sideKey}`,
          srcKey: `src-${slot.group}-${slot.rank}`,
          tgtKey,
          show: slot.rank === 1 ? 'always' : 'focus',
          tone: 'green',
          on: groupComplete(t, slot.group, progress.marks),
        })
      }
    }
  }

  if (bestThirdCount > 0) {
    for (const g of t.groups) {
      // 3rd → the best-third table (yellow: in the race, undecided here).
      links.push({
        id: `cand-${g.id}`,
        srcKey: `src-${g.id}-3`,
        tgtKey: `bt-${g.id}`,
        show: 'focus',
        tone: 'yellow',
        on: false,
      })
      // 4th → out (red: can't reach the best-third race at all).
      links.push({
        id: `out4-${g.id}`,
        srcKey: `src-${g.id}-4`,
        tgtKey: 'out',
        show: 'focus',
        tone: 'red',
        on: false,
      })
    }
    // Each advancing third → its single assigned R32 slot (green, through).
    for (const g of advancingThirds) {
      const slotKey = thirdSlotOf.get(g)
      if (slotKey)
        links.push({
          id: `bt3-${g}`,
          srcKey: `bt-${g}`,
          tgtKey: slotKey,
          show: 'focus',
          tone: 'green',
          on: false,
        })
    }
    // Eliminated thirds → out (red), routed out to the side, not over the table.
    for (const g of eliminatedThirds)
      links.push({
        id: `out3-${g}`,
        srcKey: `bt-${g}`,
        tgtKey: 'out',
        show: 'focus',
        tone: 'red',
        on: false,
        exit: 'left',
      })
  }

  // Active = pinned (sticky) + hovered. A path lights from its source only, and
  // both of its ends take the tone so the destination glows to match.
  const TONE_RANK: Record<HiTone, number> = { green: 0, yellow: 1, red: 2 }
  const bump = (map: Map<string, HiTone>, key: string, tone: HiTone) => {
    const cur = map.get(key)
    if (!cur || TONE_RANK[tone] > TONE_RANK[cur]) map.set(key, tone)
  }
  const activeKeys = new Set(pinned)
  if (hoverKey) activeKeys.add(hoverKey)
  const activeTone = new Map<string, HiTone>()
  for (const l of links)
    if (activeKeys.has(l.srcKey) && l.tone !== 'grey') {
      bump(activeTone, l.srcKey, l.tone)
      bump(activeTone, l.tgtKey, l.tone)
    }

  const marksSig =
    Object.keys(progress.marks).sort().join(',') +
    '|' +
    [...progress.revealed].sort().join(',') +
    '|' +
    [...activeKeys].sort().join(',')

  // Bracket-only mode keeps the feeds inert (the flanks/table/airplane don't
  // render and tones are blanked), so the bare bracket reads on its own.
  const flowTone = detailed ? activeTone : EMPTY_TONE
  const outActive = detailed && activeTone.get('out') === 'red'

  return (
    // A click that reaches the background (not a card or a row, which both stop
    // propagation) clears every kept path — click anywhere empty to undo.
    <div className="ko-board" ref={boardRef} onClick={clearPins}>
      <div className="ko-main">
        {detailed && (
          <div className="ko-flank side-left" aria-label="Group standings feeding the left half">
            {leftGroups.map((g) => {
              const grp = groupById(g)
              return (
                grp && (
                  <FeedStandings
                    key={g}
                    t={t}
                    group={grp}
                    progress={progress}
                    activeTone={activeTone}
                    pinned={pinned}
                    onFocus={setHoverKey}
                    onToggle={togglePin}
                  />
                )
              )
            })}
          </div>
        )}

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
              feeders={feeders}
              onOpen={onOpen}
              isR32={i === 0}
              feeds={detailed}
              activeTone={flowTone}
            />
          ))}

          <div className="b-col b-center">
            <div className="b-round-name">{finalRoundName}</div>
            <div className="b-col-body">
              {/* Centered under the "Final" header — absolute, so it sits
                  below the titles row without taking flow space. The Final
                  card stays vertically centred between the two semis. */}
              <div className={`ko-detail ${detailed ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="ko-detail-toggle"
                  aria-pressed={detailed}
                  aria-expanded={detailed}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDetailed((v) => !v)
                  }}
                >
                  <svg
                    className="ko-detail-chev"
                    viewBox="0 0 24 24"
                    width="11"
                    height="11"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                  {detailed ? 'Hide detail' : 'Show more detail'}
                </button>
                {detailed && (
                  <div className="ko-legend" aria-hidden="true">
                    <span className="lg-head">Key</span>
                    <span className="lg-tip">
                      Hover a team to trace its path.
                      <br />
                      Click to keep it on.
                    </span>
                    <span className="lg-rows">
                      <span className="lg-row">
                        <i className="lg-dot lg-green" />
                        through
                      </span>
                      <span className="lg-row">
                        <i className="lg-dot lg-gold" />
                        maybe
                      </span>
                      <span className="lg-row">
                        <i className="lg-dot lg-red" />
                        out
                      </span>
                    </span>
                  </div>
                )}
              </div>
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
              isR32={i === rightCols.length - 1}
              feeds={detailed}
              activeTone={flowTone}
            />
          ))}
        </div>

        {detailed && (
          <div className="ko-flank side-right" aria-label="Group standings feeding the right half">
            {rightGroups.map((g) => {
              const grp = groupById(g)
              return (
                grp && (
                  <FeedStandings
                    key={g}
                    t={t}
                    group={grp}
                    progress={progress}
                    activeTone={activeTone}
                    pinned={pinned}
                    onFocus={setHoverKey}
                    onToggle={togglePin}
                  />
                )
              )
            })}
          </div>
        )}
      </div>

      {detailed && bestThirdCount > 0 && (
        <div className="ko-thirds">
          {/* The airplane is where the eliminated paths land — 4th-placed teams
              and the thirds below the cut both trace a red line here. */}
          <div
            className={`ko-out ${outActive ? 'is-active' : ''}`}
            data-feed-tgt="out"
            aria-hidden="true"
            title="Eliminated"
          >
            <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
          </div>
          <BestThirdTable
            t={t}
            progress={progress}
            count={bestThirdCount}
            activeTone={activeTone}
            pinned={pinned}
            onFocus={setHoverKey}
            onToggle={togglePin}
          />
        </div>
      )}

      {detailed && (
        <FlowLayer boardRef={boardRef} links={links} activeKeys={activeKeys} marksSig={marksSig} />
      )}
    </div>
  )
}
