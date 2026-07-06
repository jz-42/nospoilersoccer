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
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import type { Tournament } from '../data/types'
import { isPlayed, knockoutReady } from '../logic/spoilers'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { PreviewCard } from './PreviewCard'
import type { RailEntry } from './PreviewCard'
import { formatDate, formatWeekday, formatWeekdayLong } from './format'
import { matchLocalDate } from './schedule'
import { addLocalDays, localDateKey, relativeDayLabel } from '../time/local'
import {
  findNearestItemIndex,
  getCarouselVisualState,
  getCommittedDaySwipe,
  getDayCardMetrics,
} from './railLayout'

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

  const { flagSize, flagGap } = getDayCardMetrics(layout.width)
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(${layout.cols}, ${layout.width}px)`,
    ['--day-flag-size' as string]: `${flagSize}px`,
    ['--day-flag-gap' as string]: `${flagGap}px`,
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
  const windowRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const rafRef = useRef<number | null>(null)
  const momentumRef = useRef<number | null>(null)
  const wheelSnapRef = useRef<number | null>(null)
  const scrollSettleTimeoutRef = useRef<number | null>(null)
  const swipeTransitionTimeoutRef = useRef<number | null>(null)
  const suppressScrollSync = useRef(false)
  const suppressClickUntilRef = useRef(0)
  const touchSwipeRef = useRef<{ startX: number; startY: number } | null>(null)
  const swipeTargetIndexRef = useRef<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isFreeScrolling, setIsFreeScrolling] = useState(false)
  const [isSwipeTransitioning, setIsSwipeTransitioning] = useState(false)

  const setItemRef = (i: number) => (el: HTMLButtonElement | null) => {
    itemRefs.current[i] = el
  }

  const updateFade = () => {
    rafRef.current = null
    const w = windowRef.current
    if (!w) return
    const viewportCenter = w.scrollLeft + w.clientWidth / 2
    const centers: number[] = []

    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i]
      if (!el) continue
      const itemCenter = el.offsetLeft + el.clientWidth / 2
      centers.push(itemCenter)
      const { fade, scale } = getCarouselVisualState(itemCenter, viewportCenter, el.clientWidth)
      el.style.setProperty('--day-fade', fade.toFixed(3))
      el.style.setProperty('--day-scale', scale.toFixed(3))
    }

    const bestIndex = findNearestItemIndex(centers, viewportCenter)
    if (swipeTargetIndexRef.current === bestIndex) {
      swipeTargetIndexRef.current = null
    }
    if (!suppressScrollSync.current) {
      setActive((prev) => (prev === bestIndex ? prev : bestIndex))
    }
  }

  const onScroll = () => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(updateFade)
    }
  }

  const clearWheelSnap = () => {
    if (wheelSnapRef.current !== null) {
      window.clearTimeout(wheelSnapRef.current)
      wheelSnapRef.current = null
    }
  }

  const clearScrollSettleSync = () => {
    if (scrollSettleTimeoutRef.current !== null) {
      window.clearTimeout(scrollSettleTimeoutRef.current)
      scrollSettleTimeoutRef.current = null
    }
  }

  const scheduleScrollSettleSync = () => {
    clearScrollSettleSync()
    scrollSettleTimeoutRef.current = window.setTimeout(() => {
      scrollSettleTimeoutRef.current = null
      updateFade()
    }, 420)
  }

  const clearSwipeTransition = () => {
    if (swipeTransitionTimeoutRef.current !== null) {
      window.clearTimeout(swipeTransitionTimeoutRef.current)
      swipeTransitionTimeoutRef.current = null
    }
    setIsSwipeTransitioning(false)
  }

  const cancelMomentum = () => {
    if (momentumRef.current !== null) {
      cancelAnimationFrame(momentumRef.current)
      momentumRef.current = null
    }
  }

  const scrollToIndex = (i: number, smooth: boolean) => {
    const clamped = Math.min(Math.max(i, 0), dates.length - 1)
    const w = windowRef.current
    const el = itemRefs.current[clamped]
    if (!w || !el) return
    const target = el.offsetLeft - (w.clientWidth - el.clientWidth) / 2
    w.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' })
    if (smooth) scheduleScrollSettleSync()
  }

  const getSwipeSourceIndex = () => swipeTargetIndexRef.current ?? idx

  const swipeToIndex = (i: number) => {
    const clamped = Math.min(Math.max(i, 0), dates.length - 1)
    const swipeSourceIndex = getSwipeSourceIndex()
    if (clamped === swipeSourceIndex) return false

    swipeTargetIndexRef.current = clamped
    scrollToIndex(clamped, true)
    clearSwipeTransition()
    setIsSwipeTransitioning(true)
    swipeTransitionTimeoutRef.current = window.setTimeout(() => {
      swipeTransitionTimeoutRef.current = null
      setIsSwipeTransitioning(false)
      updateFade()
    }, 260)
    return true
  }

  const snapToNearest = () => {
    const w = windowRef.current
    if (!w) return
    const viewportCenter = w.scrollLeft + w.clientWidth / 2
    const centers = itemRefs.current.flatMap((el) => (el ? [el.offsetLeft + el.clientWidth / 2] : []))
    scrollToIndex(findNearestItemIndex(centers, viewportCenter), true)
  }

  const dragRef = useRef<{
    pointerId: number
    startX: number
    lastX: number
    lastT: number
    startScroll: number
    moved: boolean
    velocity: number
  } | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    const w = windowRef.current
    if (!w) return
    cancelMomentum()
    clearWheelSnap()
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      lastX: e.clientX,
      lastT: performance.now(),
      startScroll: w.scrollLeft,
      moved: false,
      velocity: 0,
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const w = windowRef.current
    if (!w) return
    const dx = e.clientX - drag.startX
    if (!drag.moved && Math.abs(dx) > 4) {
      drag.moved = true
      setIsDragging(true)
      setIsFreeScrolling(true)
      if (!w.hasPointerCapture(e.pointerId)) w.setPointerCapture(e.pointerId)
    }
    if (!drag.moved) return
    const now = performance.now()
    const dt = Math.max(1, now - drag.lastT)
    drag.velocity = (e.clientX - drag.lastX) / dt
    drag.lastX = e.clientX
    drag.lastT = now
    w.scrollLeft = drag.startScroll - dx
    e.preventDefault()
  }

  const startMomentum = (velocity: number) => {
    const w = windowRef.current
    if (!w) return
    let v = Math.max(-2.4, Math.min(2.4, velocity))
    let last = performance.now()

    const tick = (now: number) => {
      const dt = now - last
      last = now
      w.scrollLeft += v * dt
      v *= Math.pow(0.92, dt / 16)
      if (Math.abs(v) < 0.03) {
        momentumRef.current = null
        setIsFreeScrolling(false)
        snapToNearest()
        return
      }
      momentumRef.current = requestAnimationFrame(tick)
    }

    momentumRef.current = requestAnimationFrame(tick)
  }

  const finishPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    const w = windowRef.current
    if (w?.hasPointerCapture(e.pointerId)) w.releasePointerCapture(e.pointerId)
    dragRef.current = null
    if (!drag.moved) return
    setIsDragging(false)
    suppressClickUntilRef.current = performance.now() + 180
    if (Math.abs(drag.velocity) > 0.02) {
      startMomentum(-drag.velocity)
      return
    }
    setIsFreeScrolling(false)
    snapToNearest()
  }

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const w = windowRef.current
    if (!w) return
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
    if (delta === 0) return
    cancelMomentum()
    clearWheelSnap()
    setIsFreeScrolling(true)
    w.scrollLeft += delta
    e.preventDefault()
    wheelSnapRef.current = window.setTimeout(() => {
      wheelSnapRef.current = null
      setIsFreeScrolling(false)
      snapToNearest()
    }, 130)
  }

  useLayoutEffect(() => {
    suppressScrollSync.current = true
    scrollToIndex(todayIndex, false)
    updateFade()
    suppressScrollSync.current = false
  }, [todayIndex, dates.length])

  useEffect(() => {
    const w = windowRef.current
    if (!w) return
    const ro = new ResizeObserver(() => {
      suppressScrollSync.current = true
      scrollToIndex(idx, false)
      updateFade()
      suppressScrollSync.current = false
    })
    ro.observe(w)
    return () => {
      ro.disconnect()
      cancelMomentum()
      clearWheelSnap()
      clearScrollSettleSync()
      clearSwipeTransition()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const isMobileViewport = () =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches

  const canSwipeToDirection = (direction: -1 | 1, sourceIndex = getSwipeSourceIndex()) => {
    const next = sourceIndex + direction
    return next >= 0 && next < dates.length
  }

  const clearSectionSwipe = () => {
    touchSwipeRef.current = null
  }

  const isBelowAppHeader = (clientY: number) => {
    const header = document.querySelector('.app-header')
    return !header || clientY >= header.getBoundingClientRect().bottom
  }

  const shouldIgnoreDocumentSwipeTarget = (target: EventTarget | null) => {
    const el = target instanceof HTMLElement ? target : null
    return Boolean(
      el?.closest(
        '.app-header, .day-carousel-window, .day-arrow, .day-jump-btn, .modal-backdrop, .dialog, .app-footer',
      ),
    )
  }

  const onDocumentTouchStart = (e: TouchEvent) => {
    if (!isMobileViewport() || e.touches.length !== 1) return
    const touch = e.touches[0]
    if (!isBelowAppHeader(touch.clientY)) return
    if (shouldIgnoreDocumentSwipeTarget(e.target)) return
    touchSwipeRef.current = { startX: touch.clientX, startY: touch.clientY }
  }

  const onDocumentTouchMove = (e: TouchEvent) => {
    const swipe = touchSwipeRef.current
    if (!isMobileViewport() || !swipe) return
    const touch = e.touches[0]
    if (!touch) return
    const deltaX = touch.clientX - swipe.startX
    const deltaY = touch.clientY - swipe.startY
    const direction = getCommittedDaySwipe({ deltaX, deltaY })
    if (direction !== 0 && e.cancelable) {
      e.preventDefault()
    }
  }

  const onDocumentTouchEnd = (e: TouchEvent) => {
    if (!isMobileViewport()) return
    const swipe = touchSwipeRef.current
    touchSwipeRef.current = null
    const touch = e.changedTouches[0]
    if (!swipe || !touch) return

    const direction = getCommittedDaySwipe({
      deltaX: touch.clientX - swipe.startX,
      deltaY: touch.clientY - swipe.startY,
    })

    const swipeSourceIndex = getSwipeSourceIndex()
    if (direction === 0) return
    if (!canSwipeToDirection(direction, swipeSourceIndex)) return
    if (!swipeToIndex(swipeSourceIndex + direction)) return

    suppressClickUntilRef.current = performance.now() + 320
  }

  useEffect(() => {
    document.addEventListener('touchstart', onDocumentTouchStart, { passive: true })
    document.addEventListener('touchmove', onDocumentTouchMove, { passive: false })
    document.addEventListener('touchend', onDocumentTouchEnd, { passive: true })
    document.addEventListener('touchcancel', clearSectionSwipe, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onDocumentTouchStart)
      document.removeEventListener('touchmove', onDocumentTouchMove)
      document.removeEventListener('touchend', onDocumentTouchEnd)
      document.removeEventListener('touchcancel', clearSectionSwipe)
    }
  })

  const onSectionClickCapture = (e: ReactMouseEvent<HTMLElement>) => {
    if (performance.now() < suppressClickUntilRef.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <section
      className={`day-rail ${isSwipeTransitioning ? 'is-swipe-transitioning' : ''}`.trim()}
      aria-label="Matchday"
      onClickCapture={onSectionClickCapture}
    >
      <div className="day-toolbar">
        {idx !== todayIndex && (
          <button type="button" className="day-jump-btn" onClick={() => scrollToIndex(todayIndex, true)}>
            Today
          </button>
        )}
      </div>
      <div className="day-carousel">
        <button
          type="button"
          className="day-arrow"
          onClick={() => scrollToIndex(idx - 1, true)}
          disabled={idx === 0}
          aria-label="Previous matchday"
        >
          ‹
        </button>
        <div
          className={`day-carousel-window ${isDragging ? 'is-dragging' : ''} ${isFreeScrolling ? 'is-free-scrolling' : ''}`}
          ref={windowRef}
          onScroll={onScroll}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
        >
          <div className="day-track">
            {dates.map((d, i) => (
              <button
                key={d}
                type="button"
                ref={setItemRef(i)}
                className={`day-item ${i === idx ? 'is-active' : ''}`}
                aria-current={i === idx ? 'date' : undefined}
                onClick={() => {
                  if (performance.now() < suppressClickUntilRef.current) return
                  scrollToIndex(i, true)
                }}
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
          onClick={() => scrollToIndex(idx + 1, true)}
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
