import { useRef, useState } from 'react'
import type { Group, KnockoutMatch, TeamId, Tournament } from '../data/types'
import { matchWinner } from '../data/types'
import { groupStandings } from '../data/standings'
import type { StandingRow } from '../data/standings'
import { groupComplete, resolveSlot, slotLabel } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import { ChampionMoment } from './Champion'
import { FlowLayer } from './FlowLayer'
import type { FeedLink } from './FlowLayer'
import type { ModalTarget } from './MatchModal'
import { matchState } from './status'
import { formatDate, formatKickoffShort } from './format'

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
  onFocus,
  onToggle,
}: {
  t: Tournament
  m: KnockoutMatch
  side: 'home' | 'away'
  progress: Progress
  feedKey?: string
  tone?: HiTone
  onFocus?: (key: string | null) => void
  onToggle?: (key: string) => void
}) {
  const mark = progress.marks[m.id]
  const teamId = resolveSlot(t, m, side, progress.marks, progress.revealed)
  const slot = side === 'home' ? m.home : m.away

  // Hover/click target is the team name only (the row stays the line anchor via
  // data-feed-tgt). Hovering the name previews its flow; clicking it keeps it on
  // (and stops there, so the rest of the card still opens the match modal).
  const rowProps = feedKey ? { 'data-feed-tgt': feedKey } : {}
  const onPinEnter = feedKey ? () => onFocus?.(feedKey) : undefined
  const onPinLeave = feedKey ? () => onFocus?.(null) : undefined
  const onPinClick = feedKey
    ? (e: React.MouseEvent) => {
        e.stopPropagation()
        onToggle?.(feedKey)
      }
    : undefined
  const pinCls = feedKey ? 'ko-pin' : ''
  const activeCls = tone ? `feed-active feed-${tone}` : ''

  if (teamId === null) {
    return (
      <div className={`ko-row ${activeCls}`} {...rowProps}>
        <span
          className={`ko-placeholder ${pinCls}`}
          onMouseEnter={onPinEnter}
          onMouseLeave={onPinLeave}
          onClick={onPinClick}
        >
          {slotLabel(t, slot)}
        </span>
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
      <span
        className={`ko-team ${pinCls}`}
        onMouseEnter={onPinEnter}
        onMouseLeave={onPinLeave}
        onClick={onPinClick}
      >
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
  feedSrcKey,
  activeTone,
  onFocus,
  onToggle,
}: {
  t: Tournament
  m: KnockoutMatch
  roundName: string
  progress: Progress
  onOpen: (target: ModalTarget) => void
  champion?: boolean
  feedKeys?: { home: string; away: string }
  feedSrcKey?: string
  activeTone?: ReadonlyMap<string, HiTone>
  onFocus?: (key: string | null) => void
  onToggle?: (key: string) => void
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
      data-feed-src={feedSrcKey}
      className={`ko-card state-${state} ${champion ? 'ko-champ' : ''} ${
        pinned ? 'is-pinned' : fav ? 'is-fav' : ''
      }`}
      onClick={() => onOpen({ kind: 'knockout', match: m, roundName })}
    >
      <div className="ko-meta">
        <span>{formatDate(m.date)}</span>
        {status}
      </div>
      <SlotRow
        t={t}
        m={m}
        side="home"
        progress={progress}
        feedKey={feedKeys?.home}
        tone={feedKeys ? activeTone?.get(feedKeys.home) : undefined}
        onFocus={onFocus}
        onToggle={onToggle}
      />
      <SlotRow
        t={t}
        m={m}
        side="away"
        progress={progress}
        feedKey={feedKeys?.away}
        tone={feedKeys ? activeTone?.get(feedKeys.away) : undefined}
        onFocus={onFocus}
        onToggle={onToggle}
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
            // Ranks 1–2 feed the bracket (green); rank 3 is a best-third
            // candidate (yellow) — both are flow sources.
            const srcKey = rank <= 3 ? `src-${group.id}-${rank}` : undefined
            const tone = srcKey ? activeTone.get(srcKey) : undefined
            // Only the name cell triggers the highlight, so it doesn't fire as
            // you sweep across the whole row.
            const nameProps = srcKey
              ? {
                  onMouseEnter: () => onFocus(srcKey),
                  onMouseLeave: () => onFocus(null),
                  onClick: () => onToggle(srcKey),
                }
              : {}
            return (
              <tr
                key={row.team}
                data-feed-src={srcKey}
                className={`${advances ? 'advances' : ''} ${
                  tone ? `feed-active feed-${tone}` : ''
                } ${srcKey && pinned.has(srcKey) ? 'is-pinned' : ''}`}
              >
                <td className="pos">{rank}</td>
                <td className={`name ${srcKey ? 'feed-hit' : ''}`} {...nameProps}>
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
  // Who advances (and who's out) is only real once you've revealed every group
  // — until then this is a provisional table with no cut-off and nobody out.
  const settled = t.groups.every((g) => groupComplete(t, g.id, progress.marks))

  const body: React.ReactNode[] = []
  rows.forEach((r, i) => {
    if (settled && i === count)
      body.push(
        <tr key="cutoff" className="bt-cutoff">
          <td colSpan={3} />
        </tr>,
      )
    const team = t.teams[r.row.team]
    const srcKey = `bt-${r.group}`
    const tone = activeTone.get(srcKey)
    body.push(
      <tr
        key={r.group}
        data-feed-src={srcKey}
        className={`${settled && i < count ? 'advances' : ''} ${
          settled && i >= count ? 'eliminated' : ''
        } ${tone ? `feed-active feed-${tone}` : ''} ${pinned.has(srcKey) ? 'is-pinned' : ''}`}
      >
        <td className="pos grp">{r.group}</td>
        <td
          className="name feed-hit"
          onMouseEnter={() => onFocus(srcKey)}
          onMouseLeave={() => onFocus(null)}
          onClick={() => onToggle(srcKey)}
        >
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
  sfIds,
  activeTone,
  onFocus,
  onToggle,
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
  sfIds: ReadonlySet<string>
  activeTone: ReadonlyMap<string, HiTone>
  onFocus: (key: string | null) => void
  onToggle: (key: string) => void
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
                    isR32 ? { home: `tgt-${m.id}-home`, away: `tgt-${m.id}-away` } : undefined
                  }
                  feedSrcKey={sfIds.has(m.id) ? `sf-${m.id}` : undefined}
                  activeTone={activeTone}
                  onFocus={onFocus}
                  onToggle={onToggle}
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
  const togglePin = (key: string) =>
    setPinned((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

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
  let bestThirdCount = 0
  const links: FeedLink[] = []

  // Group 1st/2nd → their R32 slot (green — going through for sure: winner
  // always drawn, runner-up on focus). A best-third pool slot links to every
  // candidate group's best-third row (yellow — only maybe, shown on focus).
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
      } else if (slot.type === 'best-third') {
        bestThirdCount++
        for (const g of slot.groups)
          links.push({
            id: `r-${m.id}-${sideKey}-${g}`,
            srcKey: `bt-${g}`,
            tgtKey,
            show: 'focus',
            tone: 'yellow',
            on: false,
          })
      }
    }
  }

  // Each group's 3rd place → the best-third table below (yellow "maybe"),
  // drawn only while that team is focused.
  if (bestThirdCount > 0)
    for (const g of t.groups)
      links.push({
        id: `cand-${g.id}`,
        srcKey: `src-${g.id}-3`,
        tgtKey: `bt-${g.id}`,
        show: 'focus',
        tone: 'yellow',
        on: false,
      })

  // Losing semi-finalists → third-place match (subtle grey).
  const sfIds = new Set([finalInLeft?.id, finalInRight?.id].filter(Boolean) as string[])
  if (thirdPlace) {
    for (const sideKey of ['home', 'away'] as const) {
      const slot = sideKey === 'home' ? thirdPlace.home : thirdPlace.away
      if (slot.type === 'match-loser')
        links.push({
          id: `tp-${sideKey}`,
          srcKey: `sf-${slot.match}`,
          tgtKey: `tp-${thirdPlace.id}-${sideKey}`,
          show: 'focus',
          tone: 'grey',
          on: false,
        })
    }
  }

  // Map every feed key to the team it currently represents (your-canon only),
  // so focusing one instance of a team lights up all of them — its group row,
  // its best-third row, and the R32 slot it's resolved into.
  const marked = (id: string) => progress.marks[id] !== undefined
  const keyTeam = new Map<string, TeamId>()
  for (const g of t.groups) {
    const s = groupStandings(t, g.id, marked)
    for (let r = 1; r <= 3; r++) if (s[r - 1]) keyTeam.set(`src-${g.id}-${r}`, s[r - 1].team)
    if (s[2]) keyTeam.set(`bt-${g.id}`, s[2].team)
  }
  for (const m of r32Matches)
    for (const sideKey of ['home', 'away'] as const) {
      const team = resolveSlot(t, m, sideKey, progress.marks, progress.revealed)
      if (team) keyTeam.set(`tgt-${m.id}-${sideKey}`, team)
    }

  const TONE_RANK: Record<HiTone, number> = { green: 0, yellow: 1, red: 2 }
  const bump = (map: Map<string, HiTone>, key: string, tone: HiTone) => {
    const cur = map.get(key)
    if (!cur || TONE_RANK[tone] > TONE_RANK[cur]) map.set(key, tone)
  }
  // Each key's own tone, from the flow it participates in (grey lines don't tint).
  const keyTone = new Map<string, HiTone>()
  for (const l of links) {
    if (l.tone === 'grey') continue
    bump(keyTone, l.srcKey, l.tone)
    bump(keyTone, l.tgtKey, l.tone)
  }

  // Active = pinned (sticky) + hovered, expanded to every instance of those
  // teams so the whole path lights up at once.
  const focusKeys = new Set(pinned)
  if (hoverKey) focusKeys.add(hoverKey)
  const focusTeams = new Set<TeamId>()
  for (const k of focusKeys) {
    const tm = keyTeam.get(k)
    if (tm) focusTeams.add(tm)
  }
  const activeKeys = new Set(focusKeys)
  for (const [k, tm] of keyTeam) if (focusTeams.has(tm)) activeKeys.add(k)

  // Tone each active row/slot: prefer its flow tone, else its focused team's.
  const activeTone = new Map<string, HiTone>()
  for (const l of links)
    if ((activeKeys.has(l.srcKey) || activeKeys.has(l.tgtKey)) && l.tone !== 'grey') {
      bump(activeTone, l.srcKey, l.tone)
      bump(activeTone, l.tgtKey, l.tone)
    }
  for (const k of activeKeys) if (!activeTone.has(k)) bump(activeTone, k, keyTone.get(k) ?? 'green')

  const marksSig =
    Object.keys(progress.marks).sort().join(',') +
    '|' +
    [...progress.revealed].sort().join(',') +
    '|' +
    [...activeKeys].sort().join(',')

  return (
    <div className="ko-board" ref={boardRef}>
      <div className="ko-main">
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
              sfIds={sfIds}
              activeTone={activeTone}
              onFocus={setHoverKey}
              onToggle={togglePin}
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
                    feedKeys={{
                      home: `tp-${thirdPlace.id}-home`,
                      away: `tp-${thirdPlace.id}-away`,
                    }}
                    activeTone={activeTone}
                    onFocus={setHoverKey}
                    onToggle={togglePin}
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
              sfIds={sfIds}
              activeTone={activeTone}
              onFocus={setHoverKey}
              onToggle={togglePin}
            />
          ))}
        </div>

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
      </div>

      {bestThirdCount > 0 && (
        <div className="ko-thirds">
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

      <FlowLayer boardRef={boardRef} links={links} activeKeys={activeKeys} marksSig={marksSig} />
    </div>
  )
}
