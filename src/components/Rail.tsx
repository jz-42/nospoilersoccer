/**
 * The matchday strip above the groups.
 *
 * Live tournaments get a centered day carousel: every matchday of the
 * tournament laid out in a row, the selected day big in the middle and the
 * neighbours faded on either side. Picking a neighbour (or a chevron) slides
 * the whole strip so that day glides to centre. It defaults to today, and a
 * "Jump to today" pill appears once you wander off. A green dot on a day
 * means it has unwatched results in.
 *
 * Finished tournaments get "Continue": the next unwatched games in
 * tournament order.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Tournament } from '../data/types'
import { isPlayed, knockoutReady } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { PreviewCard } from './PreviewCard'
import type { RailEntry } from './PreviewCard'
import { formatDate, formatWeekday, formatWeekdayLong } from './format'
import { matchLocalDate } from './schedule'
import { addLocalDays, localDateKey, relativeDayLabel } from '../time/local'

function allEntries(t: Tournament): RailEntry[] {
  const out: RailEntry[] = []
  for (const m of t.groupMatches) {
    out.push({ target: { kind: 'group', match: m }, date: matchLocalDate(m) })
  }
  for (const round of t.knockoutRounds) {
    for (const m of round.matches) {
      out.push({
        target: { kind: 'knockout', match: m, roundName: round.name },
        date: matchLocalDate(m),
      })
    }
  }
  // Chronological: by visitor-local date, then by UTC kickoff instant.
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.target.match.kickoff ?? a.date).localeCompare(b.target.match.kickoff ?? b.date),
  )
}

const GRID_GAP = 16
const CARD_MIN = 230 // narrowest a card may get before we drop a column
// Lighter days get gently bigger cards — an even step up from the 4/6 base.
const CARD_MAX = 348 // 4+ matches (a 4-across card; 6 matches 4)
const TRIO_MAX = 378 // 3 matches
const DUO_MAX = 424 // 2 matches
const HERO_MAX = 470 // a lone match — the biggest "hero" card

/**
 * Lay the day's cards out in *balanced* rows. CSS can pack cards but can't
 * balance them — only we know the match count — so a six-match day that only
 * fits five across becomes a tidy 3 + 3 instead of an ugly 5 + 1, two matches
 * sit together rather than drifting to opposite edges, and a single match
 * blooms into one hero card. Columns are sized in pixels and the whole block
 * is centred, so cards never stretch to fill a half-empty row.
 */
function useBalancedColumns(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState({ cols: 1, width: CARD_MAX })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || count === 0) return
    const measure = () => {
      const avail = el.clientWidth
      if (!avail) return
      const maxCols = Math.max(1, Math.floor((avail + GRID_GAP) / (CARD_MIN + GRID_GAP)))
      const rows = Math.ceil(count / maxCols)
      const cols = Math.ceil(count / rows)
      const cap = { 1: HERO_MAX, 2: DUO_MAX, 3: TRIO_MAX }[count] ?? CARD_MAX
      const width = Math.min(cap, Math.floor((avail - (cols - 1) * GRID_GAP) / cols))
      setLayout({ cols, width })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [count])

  const style: CSSProperties = {
    gridTemplateColumns: `repeat(${layout.cols}, ${layout.width}px)`,
  }
  return [ref, style] as const
}

function DaySwitcher({
  t,
  progress,
  onOpen,
}: {
  t: Tournament
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  const entries = allEntries(t)
  const now = new Date()
  const today = localDateKey(now)
  // Every matchday, plus today itself so the carousel always has a "Today"
  // anchor even when today is a rest day.
  const dates = [...new Set([...entries.map((e) => e.date), today])].sort()
  const todayIndex = dates.indexOf(today)

  const [active, setActive] = useState(todayIndex)

  const idx = Math.min(Math.max(active, 0), dates.length - 1)

  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const onCarouselTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    swipeStart.current = { x: t.clientX, y: t.clientY }
  }
  const onCarouselTouchEnd = (e: React.TouchEvent) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const end = e.changedTouches[0]
    const dx = end.clientX - start.x
    const dy = end.clientY - start.y
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return
    if (dx < 0 && idx < dates.length - 1) setActive(idx + 1)
    if (dx > 0 && idx > 0) setActive(idx - 1)
  }
  const date = dates[idx]
  const dayEntries = entries.filter((e) => e.date === date)
  const [gridRef, gridStyle] = useBalancedColumns(dayEntries.length)

  const yesterday = addLocalDays(today, -1)
  const tomorrow = addLocalDays(today, 1)
  // Relative days lead with the word (and spell the full date underneath);
  // every other day leads with the weekday and shows just the date — no
  // point repeating "June 16 / June 16".
  const headlineFor = (d: string) => {
    return relativeDayLabel(d, now) ?? formatWeekday(d)
  }
  const subFor = (d: string) =>
    d === today || d === yesterday || d === tomorrow ? formatWeekdayLong(d) : formatDate(d)

  // "Something new to watch that day" — unwatched finished games.
  const hasFresh = (d: string) =>
    entries.some(
      (e) =>
        e.date === d &&
        progress.marks[e.target.match.id] === undefined &&
        isPlayed(e.target.match) &&
        (e.target.kind === 'group' ||
          knockoutReady(t, e.target.match, progress.marks, progress.revealed)),
    )

  return (
    <section className="day-rail" aria-label="Matchday">
      <div className="day-toolbar">
        {idx !== todayIndex && (
          <button type="button" className="day-jump-btn" onClick={() => setActive(todayIndex)}>
            Today
          </button>
        )}
      </div>
      <div className="day-carousel">
        <button
          type="button"
          className="day-arrow"
          onClick={() => setActive(idx - 1)}
          disabled={idx === 0}
          aria-label="Previous matchday"
        >
          ‹
        </button>
        <div
          className="day-carousel-window"
          onTouchStart={onCarouselTouchStart}
          onTouchEnd={onCarouselTouchEnd}
        >
          <div
            className="day-track"
            style={{ transform: `translateX(calc(${-(idx + 0.5)} * var(--day-item-w)))` }}
          >
            {dates.map((d, i) => (
              <button
                key={d}
                type="button"
                className={`day-item ${i === idx ? 'is-active' : ''}`}
                data-dist={Math.min(Math.abs(i - idx), 3)}
                aria-current={i === idx ? 'date' : undefined}
                tabIndex={i === idx ? 0 : -1}
                onClick={() => setActive(i)}
              >
                <span className="day-item-label">
                  {headlineFor(d)}
                  {hasFresh(d) && <span className="day-tab-dot" aria-label="New results" />}
                </span>
                <span className="day-item-date">{subFor(d)}</span>
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="day-arrow"
          onClick={() => setActive(idx + 1)}
          disabled={idx === dates.length - 1}
          aria-label="Next matchday"
        >
          ›
        </button>
      </div>

      {dayEntries.length > 0 ? (
        <div className="day-grid" ref={gridRef} style={gridStyle}>
          {dayEntries.map((e) => (
            <PreviewCard key={e.target.match.id} t={t} entry={e} progress={progress} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="day-empty">No matches {date === today ? 'today' : 'this day'} — rest day.</div>
      )}
    </section>
  )
}

/**
 * The day rail only appears for a live tournament (App hides the "Today" tab
 * once everything's played — a finished tournament is browsed through the group
 * and knockout views, where the videos live in context).
 */
export function Rail({
  t,
  progress,
  onOpen,
}: {
  t: Tournament
  progress: Progress
  onOpen: (target: ModalTarget) => void
}) {
  return <DaySwitcher key={t.id} t={t} progress={progress} onOpen={onOpen} />
}
