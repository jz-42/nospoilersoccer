/**
 * The matchday strip above the groups.
 *
 * Current tournaments get a centered day carousel: every matchday of the
 * tournament laid out in a row, the selected day big in the middle and the
 * neighbours faded on either side. Picking a neighbour (or a chevron) slides
 * the whole strip so that day glides to centre. It defaults to today, and a
 * "Jump to today" pill appears once you wander off. A green dot on a day
 * means it has unwatched results in.
 *
 * Archived tournaments open on their final matchday and remain browsable.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'
import type { Tournament } from '../data/types'
import { isPlayed, knockoutReady, resolveSlot } from '../logic/spoilers'
import { dayRailInitialDate, isTournamentArchived } from '../navigation'
import type { Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { Heart } from './Heart'
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
  getDayLayout,
  COLUMN_WIDTH,
} from './railLayout'
import type { DayLayout } from './railLayout'

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

/**
 * Size the day's cards and pick a row width.
 *
 * The shapes themselves live in `getDayLayout` — see the table there. What
 * this owns is measuring, and the one structural trick that makes a short
 * last row centre: the *outer* element is full width and is what we measure,
 * while the inner one is pinned to exactly `cols` cards wide and wraps. Flex
 * then does the rest, centring every row including the short one, and full
 * rows still line up because every card is the same width. Measuring the
 * outer element is what keeps that from feeding back on itself — pinning the
 * element you measure makes its own width the next input.
 */
function useDayColumns(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<DayLayout>({ cols: 1, width: COLUMN_WIDTH[1] })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || count === 0) return
    const measure = () => {
      const avail = el.clientWidth
      if (!avail) return
      // Read the gap from CSS rather than hard-coding it: it tightens on
      // mobile, and a row pinned to the wrong gap wraps a card early.
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0
      setLayout(getDayLayout(count, avail, gap))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [count])

  const { flagSize, flagGap } = getDayCardMetrics(layout.width)
  const style: CSSProperties = {
    ['--day-cols' as string]: layout.cols,
    ['--day-card-w' as string]: `${layout.width}px`,
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
  // Current tournaments include today as an anchor, even on rest days.
  // Archives use the final matchday and do not grow empty post-event dates.
  const anchorDate = dayRailInitialDate(t, now)
  const dates = [...new Set([...entries.map((e) => e.date), anchorDate])].sort()
  const anchorIndex = dates.indexOf(anchorDate)
  const anchorLabel = isTournamentArchived(t, now) ? 'First day' : 'Today'

  const [active, setActive] = useState(anchorIndex)
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
    scrollToIndex(anchorIndex, false)
    updateFade()
    suppressScrollSync.current = false
  }, [anchorIndex, dates.length])

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
  const [gridRef, gridStyle] = useDayColumns(dayEntries.length)

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

  /*
   * "One of mine plays that day."
   *
   * Deliberately the same answer the cards give — favAuto off means the whole
   * feature is off, and a knockout slot whose teams aren't known yet resolves
   * to null, so the strip never leaks who made it through.
   */
  const favOnDay = (d: string) => {
    if (!progress.favAuto || progress.favorites.length === 0) return false
    return entries.some((e) => {
      if (e.date !== d) return false
      if (e.target.kind === 'group') {
        const gm = e.target.match
        return progress.favorites.includes(gm.home) || progress.favorites.includes(gm.away)
      }
      const km = e.target.match
      const home = resolveSlot(t, km, 'home', progress.marks, progress.revealed)
      const away = resolveSlot(t, km, 'away', progress.marks, progress.revealed)
      return (
        (home !== null && progress.favorites.includes(home)) ||
        (away !== null && progress.favorites.includes(away))
      )
    })
  }

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

  const isRestDay = dayEntries.length === 0

  return (
    <section
      className={`day-rail ${isSwipeTransitioning ? 'is-swipe-transitioning' : ''} ${
        isRestDay ? 'is-rest-day' : ''
      }`.trim()}
      aria-label="Matchday"
      onClickCapture={onSectionClickCapture}
    >
      <div className="day-toolbar">
        {idx !== anchorIndex && (
          <button type="button" className="day-jump-btn" onClick={() => scrollToIndex(anchorIndex, true)}>
            {anchorLabel}
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
            <span className="day-track-spacer" aria-hidden="true" />
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
                <span className="day-item-date">
                  {favOnDay(d) && <Heart size={12} className="day-item-heart" />}
                  {subFor(d)}
                </span>
              </button>
            ))}
            <span className="day-track-spacer" aria-hidden="true" />
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

      {!isRestDay ? (
        <div
          className={`day-grid ${progress.spotlight ? 'is-spotlight' : ''}`.trim()}
          ref={gridRef}
          style={gridStyle}
        >
          <div className="day-grid-rows">
            {dayEntries.map((e) => (
              <PreviewCard
                key={e.target.match.id}
                t={t}
                entry={e}
                progress={progress}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ) : (
        <RestDay date={date} />
      )}
    </section>
  )
}

const SLEEPING_MASCOTS = [
  new URL('../assets/mascot-sleeping-1.webp', import.meta.url).href,
  new URL('../assets/mascot-sleeping-2.webp', import.meta.url).href,
  new URL('../assets/mascot-sleeping-3.webp', import.meta.url).href,
] as const

/**
 * Daily-deterministic pose, not a roll of the dice.
 *
 * Random-on-load is the cheap-widget pattern: the art reshuffles every
 * refresh, which fights the stillness the page is going for. Indexing by the
 * calendar day cycles 1 → 2 → 3, so a given date always looks the same and
 * two rest days in a row never show the same pose.
 */
function sleepingMascotFor(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
  const n = SLEEPING_MASCOTS.length
  return SLEEPING_MASCOTS[((dayNumber % n) + n) % n]
}

/**
 * A day with no fixtures.
 *
 * This is a normal, frequent state — most days of a season are rest days — so
 * it gets a composed page rather than an error box. The whole page is the
 * napping mascot and the words under it; there is deliberately no "jump to
 * the next matchday" control, because the carousel directly above already
 * has the next matchday sitting one step to the right (a rest day only ever
 * renders for today, so `dates[idx + 1]` *is* that neighbour).
 */
function RestDay({ date }: { date: string }) {
  return (
    <div className="rest-day">
      <img
        className="rest-day-mascot"
        src={sleepingMascotFor(date)}
        alt=""
        width={800}
        height={768}
        draggable={false}
      />
      <p className="rest-day-label">Rest Day</p>
    </div>
  )
}

/**
 * The day rail stays available after the tournament and opens archived editions
 * on their final matchday.
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
