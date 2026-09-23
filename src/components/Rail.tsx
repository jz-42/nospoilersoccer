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
import { dayNavFeel, hapticTick } from './dayNavFeel'
import {
  pickFlickStop,
  rubberBand,
  settleOmega,
  SPRING_OMEGA,
  stepSpring,
} from './stripPhysics'

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="day-chevron">
      <path
        d={dir === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

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
  // Which way the cards just moved, so the incoming ones can arrive from that
  // side. Derived during render (React's "adjust state on prop change").
  const [shown, setShown] = useState({ idx, dir: 0 })
  if (shown.idx !== idx) setShown({ idx, dir: idx > shown.idx ? 1 : -1 })
  const activeRef = useRef(anchorIndex)
  const lastCommitRef = useRef(0)
  const carouselRef = useRef<HTMLDivElement>(null)
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
  const glideRef = useRef<number | null>(null)
  const wheelPageRef = useRef({ acc: 0, locked: false, last: 0, lastMag: 0, lastStep: 0 })
  /** Where each day sits in the strip, measured once rather than every frame. */
  const layoutRef = useRef<{ centers: number[]; widths: number[]; half: number; max: number } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  /** How far the strip is rubber-banded past its first or last day, in px. */
  const overshootRef = useRef(0)
  const engineRef = useRef({
    mode: 'idle' as 'idle' | 'direct' | 'spring',
    pos: 0,
    v: 0,
    target: 0,
    omega: SPRING_OMEGA,
    last: 0,
    raf: null as number | null,
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isFreeScrolling, setIsFreeScrolling] = useState(false)
  const [isSwipeTransitioning, setIsSwipeTransitioning] = useState(false)

  const setItemRef = (i: number) => (el: HTMLButtonElement | null) => {
    itemRefs.current[i] = el
  }

  /*
   * Push: leave a snapshot of the outgoing cards on top, stepping aside and
   * fading, while the incoming ones arrive underneath. A DOM clone rather than a
   * second React render so it keeps its exact old layout (the grid's column
   * variables change with the new day) and costs nothing to throw away.
   */
  const ghostOutgoingRows = (dir: 'next' | 'prev') => {
    const rows = windowRef.current
      ?.closest('.day-rail')
      ?.querySelector<HTMLElement>('.day-grid-rows:not(.day-rows-ghost)')
    const grid = rows?.parentElement
    if (!rows || !grid) return
    grid.querySelectorAll('.day-rows-ghost').forEach((n) => n.remove())
    const g = grid.getBoundingClientRect()
    const r = rows.getBoundingClientRect()
    const clone = rows.cloneNode(true) as HTMLElement
    clone.classList.add('day-rows-ghost')
    clone.removeAttribute('data-enter')
    clone.dataset.exit = dir
    clone.setAttribute('aria-hidden', 'true')
    clone.inert = true
    clone.style.cssText = `${grid.getAttribute('style') ?? ''};position:absolute;top:${r.top - g.top}px;left:${r.left - g.left}px;width:${r.width}px;margin:0;pointer-events:none`
    grid.appendChild(clone)
    // No exit animation styled for it: drop it now rather than leave a still
    // copy of the old cards over the new ones.
    if (getComputedStyle(clone).animationName === 'none') {
      clone.remove()
      return
    }
    const done = () => clone.remove()
    clone.addEventListener('animationend', done, { once: true })
    window.setTimeout(done, 500)
  }

  /** The one place the active day changes. */
  const commitActive = (i: number) => {
    if (i === activeRef.current) return
    const from = activeRef.current
    activeRef.current = i
    // Event / animation-frame timestamp, not a rendered value.
    // eslint-disable-next-line react-hooks/purity
    const now = performance.now()
    // Days flying past faster than the outgoing cards could leave just swap;
    // snapshotting cards that are still arriving would flash them back in.
    const rapid = now - lastCommitRef.current < 240
    lastCommitRef.current = now
    if (dayNavFeel.cardsOut && !rapid) ghostOutgoingRows(i > from ? 'next' : 'prev')
    setActive(i)
  }

  // Reading offsetLeft for every day on every frame forced a layout per
  // frame mid-glide; the days never move within the track, so measure once
  // and again only when the strip resizes.
  const measureStrip = () => {
    const w = windowRef.current
    if (!w) return null
    if (!layoutRef.current) {
      const centers: number[] = []
      const widths: number[] = []
      itemRefs.current.forEach((el, i) => {
        centers[i] = el ? el.offsetLeft + el.clientWidth / 2 : NaN
        widths[i] = el ? el.clientWidth : 0
      })
      layoutRef.current = { centers, widths, half: w.clientWidth / 2, max: w.scrollWidth - w.clientWidth }
    }
    return layoutRef.current
  }

  const updateFade = () => {
    rafRef.current = null
    const w = windowRef.current
    const layout = measureStrip()
    if (!w || !layout) return
    const viewportCenter = w.scrollLeft + layout.half + overshootRef.current
    const { centers } = layout

    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i]
      if (!el || Number.isNaN(centers[i])) continue
      const { fade, scale } = getCarouselVisualState(centers[i], viewportCenter, layout.widths[i])
      el.style.setProperty('--day-fade', fade.toFixed(3))
      el.style.setProperty('--day-scale', scale.toFixed(3))
    }

    const bestIndex = findNearestItemIndex(centers, viewportCenter)
    if (swipeTargetIndexRef.current === bestIndex) {
      swipeTargetIndexRef.current = null
    }
    if (!suppressScrollSync.current) commitActive(bestIndex)
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

  const cancelGlide = () => {
    if (glideRef.current === null) return
    cancelAnimationFrame(glideRef.current)
    glideRef.current = null
    const w = windowRef.current
    if (w) w.style.scrollSnapType = ''
    suppressScrollSync.current = false
    swipeTargetIndexRef.current = null
    setIsSwipeTransitioning(false)
  }

  /*
   * The strip's own motion (dayNavFeel wheel 'glide' / glide 'spring').
   *
   * One position, moved two ways. `direct`: it is exactly where your fingers
   * or the mouse put it, rubber-banding past either end. `spring`: it settles
   * onto a day, starting at whatever speed it already has — so a flick glides
   * to rest instead of stopping and snapping, and pressing → twice quickly
   * speeds up toward the second day rather than restarting. Phones keep the
   * browser's own touch scrolling, which is already this.
   */
  const stopFor = (i: number) => {
    const layout = measureStrip()
    if (!layout) return 0
    return Math.min(Math.max(layout.centers[i] - layout.half, 0), layout.max)
  }

  const renderPos = (pos: number) => {
    const w = windowRef.current
    const layout = measureStrip()
    if (!w || !layout) return
    const inside = Math.min(Math.max(pos, 0), layout.max)
    const over = rubberBand(pos - inside, w.clientWidth / 3)
    w.scrollLeft = inside
    overshootRef.current = over
    if (trackRef.current) trackRef.current.style.transform = over ? `translate3d(${-over}px, 0, 0)` : ''
    updateFade()
  }

  const engineTakeOver = () => {
    const e = engineRef.current
    const w = windowRef.current
    if (e.mode !== 'idle' || !w) return
    cancelMomentum()
    cancelGlide()
    clearWheelSnap()
    clearScrollSettleSync()
    w.style.scrollSnapType = 'none'
    e.pos = w.scrollLeft
    e.v = 0
    setIsSwipeTransitioning(true)
  }

  const engineStop = () => {
    const e = engineRef.current
    if (e.raf !== null) cancelAnimationFrame(e.raf)
    e.raf = null
    if (e.mode === 'idle') return
    e.mode = 'idle'
    overshootRef.current = 0
    if (trackRef.current) trackRef.current.style.transform = ''
    const w = windowRef.current
    if (w) w.style.scrollSnapType = ''
    suppressScrollSync.current = false
    swipeTargetIndexRef.current = null
    setIsSwipeTransitioning(false)
    updateFade()
  }

  const engineTick = (now: number) => {
    const e = engineRef.current
    e.raf = null
    if (e.mode !== 'spring') return
    // A long frame pauses the glide instead of skipping part of it.
    const dt = Math.min(Math.max(now - e.last, 0), 34)
    e.last = now
    const next = stepSpring({ x: e.pos, v: e.v }, e.target, e.omega, dt)
    e.pos = next.x
    e.v = next.v
    if (Math.abs(e.pos - e.target) < 0.3 && Math.abs(e.v) < 0.01) {
      e.pos = e.target
      renderPos(e.target)
      engineStop()
      return
    }
    renderPos(e.pos)
    e.raf = requestAnimationFrame(engineTick)
  }

  /** Settle onto day `i`, carrying `v` (px/ms) if given, else the current speed. */
  const springTo = (i: number, v?: number) => {
    const clamped = Math.min(Math.max(i, 0), dates.length - 1)
    engineTakeOver()
    const e = engineRef.current
    e.mode = 'spring'
    if (v !== undefined) e.v = v
    e.target = stopFor(clamped)
    e.omega = settleOmega(e.pos, e.v, e.target)
    swipeTargetIndexRef.current = clamped
    suppressScrollSync.current = true
    // The day (and its cards) change the moment you ask, not when the strip
    // happens to pass the midpoint.
    commitActive(clamped)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      e.pos = e.target
      renderPos(e.pos)
      engineStop()
      return
    }
    if (e.raf === null) {
      // Animation bookkeeping, not a rendered value.
      // eslint-disable-next-line react-hooks/purity
      e.last = performance.now()
      e.raf = requestAnimationFrame(engineTick)
    }
  }

  /** Put the strip exactly at `pos` — it's under your fingers. */
  const followTo = (pos: number) => {
    engineTakeOver()
    const e = engineRef.current
    if (e.raf !== null) cancelAnimationFrame(e.raf)
    e.raf = null
    if (e.mode !== 'direct') {
      e.mode = 'direct'
      suppressScrollSync.current = false
      swipeTargetIndexRef.current = null
    }
    e.pos = pos
    renderPos(pos)
  }

  /** Let go at velocity `v`: settle on the day the flick is heading for. */
  const release = (v: number) => {
    const layout = measureStrip()
    if (!layout) return
    const stops = dates.map((_, i) => stopFor(i))
    springTo(pickFlickStop(stops, engineRef.current.pos, v), v)
  }

  /*
   * Our own glide instead of the browser's smooth scroll. Two things make it
   * feel crisper: the day (and the cards under it) switch the instant you
   * press, rather than when the strip happens to scroll past the midpoint,
   * and the strip travels on a short ease-out whose length barely grows with
   * distance, so a jump of thirty days doesn't become a long whoosh.
   */
  const crispScrollTo = (i: number) => {
    const w = windowRef.current
    const el = itemRefs.current[i]
    if (!w || !el) return
    engineStop()
    cancelMomentum()
    cancelGlide()
    const from = w.scrollLeft
    const max = w.scrollWidth - w.clientWidth
    const to = Math.min(Math.max(el.offsetLeft - (w.clientWidth - el.clientWidth) / 2, 0), max)
    swipeTargetIndexRef.current = i
    suppressScrollSync.current = true
    commitActive(i)
    setIsSwipeTransitioning(true)
    w.style.scrollSnapType = 'none'
    const duration = Math.min(440, 250 + Math.sqrt(Math.abs(to - from)) * 4)
    // Animation bookkeeping, not a rendered value.
    // eslint-disable-next-line react-hooks/purity
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      w.scrollLeft = from + (to - from) * (1 - Math.pow(1 - p, 4))
      updateFade()
      if (p < 1) {
        glideRef.current = requestAnimationFrame(tick)
        return
      }
      glideRef.current = null
      w.style.scrollSnapType = ''
      suppressScrollSync.current = false
      swipeTargetIndexRef.current = null
      setIsSwipeTransitioning(false)
      updateFade()
    }
    glideRef.current = requestAnimationFrame(tick)
  }

  /** A deliberate step to a day — arrows, taps, Today, keys, wheel pages, swipes. */
  const goToIndex = (i: number) => {
    const clamped = Math.min(Math.max(i, 0), dates.length - 1)
    if (clamped !== getSwipeSourceIndex()) hapticTick()
    if (dayNavFeel.glide === 'spring') springTo(clamped)
    else if (dayNavFeel.glide === 'crisp') crispScrollTo(clamped)
    else {
      // A spring still settling from a glide release would overwrite the
      // browser's smooth scroll every frame.
      engineStop()
      clearWheelSnap()
      // Record where we're headed, so a quick second step goes one further.
      // Heading nowhere new (already there, or pressing past the last day)
      // records nothing: updateFade only clears a target it scrolls onto.
      swipeTargetIndexRef.current = clamped === activeRef.current ? null : clamped
      scrollToIndex(clamped, true)
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

  // The committed day as of now, not as of the last render: a key press
  // landing between a commit and its re-render would otherwise step from
  // the old day and be lost.
  const getSwipeSourceIndex = () =>
    swipeTargetIndexRef.current ?? Math.min(Math.max(activeRef.current, 0), dates.length - 1)

  const swipeToIndex = (i: number) => {
    const clamped = Math.min(Math.max(i, 0), dates.length - 1)
    const swipeSourceIndex = getSwipeSourceIndex()
    if (clamped === swipeSourceIndex) return false

    if (dayNavFeel.glide !== 'smooth') {
      goToIndex(clamped)
      return true
    }
    hapticTick()
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
    // Grabbing the strip abandons any day an arrow was heading for; the next
    // step counts from wherever you leave it.
    swipeTargetIndexRef.current = null
    // A finger on the strip takes it over natively; stop any glide of ours
    // (spring or crisp) so the two don't fight over the scroll position.
    if (e.pointerType !== 'mouse') {
      engineStop()
      cancelGlide()
      cancelMomentum()
      return
    }
    if (e.button !== 0) return
    const w = windowRef.current
    if (!w) return
    const glide = dayNavFeel.wheel === 'glide'
    // Pressing on a gliding strip catches it where it is.
    if (glide && engineRef.current.mode !== 'idle') followTo(engineRef.current.pos)
    else engineStop()
    cancelMomentum()
    cancelGlide()
    clearWheelSnap()
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      lastX: e.clientX,
      // Event-handler timestamp, not a rendered value.
      // eslint-disable-next-line react-hooks/purity
      lastT: performance.now(),
      startScroll: glide && engineRef.current.mode !== 'idle' ? engineRef.current.pos : w.scrollLeft,
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
    // Event-handler timestamp, not a rendered value.
    // eslint-disable-next-line react-hooks/purity
    const now = performance.now()
    const dt = Math.max(1, now - drag.lastT)
    const instant = (e.clientX - drag.lastX) / dt
    drag.velocity = dayNavFeel.wheel === 'glide' ? drag.velocity * 0.5 + instant * 0.5 : instant
    drag.lastX = e.clientX
    drag.lastT = now
    if (dayNavFeel.wheel === 'glide') followTo(drag.startScroll - dx)
    else w.scrollLeft = drag.startScroll - dx
    e.preventDefault()
  }

  const startMomentum = (velocity: number) => {
    const w = windowRef.current
    if (!w) return
    let v = Math.max(-2.4, Math.min(2.4, velocity))
    // Animation bookkeeping, not a rendered value.
    // eslint-disable-next-line react-hooks/purity
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
    if (!drag.moved) {
      // Caught mid-glide and let go without dragging: settle again.
      if (engineRef.current.mode === 'direct') release(0)
      return
    }
    setIsDragging(false)
    // Event-handler timestamp, not a rendered value.
    // eslint-disable-next-line react-hooks/purity
    const now = performance.now()
    suppressClickUntilRef.current = now + 180
    if (dayNavFeel.wheel === 'glide') {
      setIsFreeScrolling(false)
      // Held still before letting go means no flick.
      release(now - drag.lastT > 60 ? 0 : -drag.velocity)
      return
    }
    if (Math.abs(drag.velocity) > 0.02) {
      startMomentum(-drag.velocity)
      return
    }
    setIsFreeScrolling(false)
    snapToNearest()
  }

  /*
   * One day per gesture. A trackpad swipe arrives as a burst of wheel events
   * followed by a long inertial tail; stepping once and then ignoring the
   * tail is what makes it feel like paging a book rather than spinning a
   * dial. The tail is over when the events stop for a moment, or when they
   * suddenly grow again — which only a new swipe does. A mouse wheel's
   * notches are big, evenly sized events, so each notch is its own step.
   */
  const onWheelPaged = (delta: number, isNotch: boolean, now: number) => {
    // `now` is the event's own timestamp, not the time we got to it: if the
    // day swap stalls the main thread, queued tail events still read as the
    // tail rather than as a fresh swipe after a pause.
    const s = wheelPageRef.current
    const mag = Math.abs(delta)
    if (isNotch) {
      if (now - s.lastStep < 90) return
      s.lastStep = now
      goToIndex(getSwipeSourceIndex() + Math.sign(delta))
      return
    }
    // A step also holds for 280ms outright, so a hitch in the event stream
    // can't split one swipe into two days.
    const held = now - s.lastStep < 280
    if (!held && (now - s.last > 160 || (s.locked && mag > s.lastMag * 1.8 && mag > 6))) {
      s.locked = false
      s.acc = 0
    }
    s.last = now
    s.lastMag = mag
    if (s.locked) return
    s.acc += delta
    if (Math.abs(s.acc) < 36) return
    s.locked = true
    s.lastStep = now
    goToIndex(getSwipeSourceIndex() + Math.sign(s.acc))
    s.acc = 0
  }

  /*
   * Glide: the strip follows every trackpad event exactly, macOS's own
   * momentum included, so it coasts the way every other scroll on the Mac
   * does and you can slow it onto the day you want. Once the events stop it
   * springs onto the nearest day. (Guessing when the fingers lift and
   * throwing the strip to a predicted day made it hard to stop on a day.)
   * A mouse wheel moves one day per notch.
   */
  const onWheelGlide = (delta: number, isNotch: boolean) => {
    clearWheelSnap()
    if (isNotch) {
      springTo(getSwipeSourceIndex() + Math.sign(delta))
      return
    }
    // Take over first: when the engine was idle, its position is stale (the
    // browser may have scrolled the strip since), and this reads it afresh.
    engineTakeOver()
    followTo(engineRef.current.pos + delta)
    wheelSnapRef.current = window.setTimeout(() => {
      wheelSnapRef.current = null
      if (engineRef.current.mode === 'direct') release(0)
    }, 130)
  }

  /*
   * Any wheel or trackpad scroll with the pointer on the strip moves the days
   * and never the page. Listened for natively (below): React registers wheel
   * listeners as passive, so its preventDefault is silently ignored and the
   * page scrolled underneath the strip at the same time — the "bounce".
   */
  const onWheel = (e: WheelEvent) => {
    const w = windowRef.current
    if (!w || e.ctrlKey) return // ctrl + wheel is pinch-zoom
    e.preventDefault()
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    const delta = horizontal ? e.deltaX : e.deltaY
    if (delta === 0) return
    const isNotch =
      !horizontal &&
      (e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && Number.isInteger(e.deltaY)))
    if (dayNavFeel.wheel === 'paged') {
      onWheelPaged(delta, isNotch, e.timeStamp)
      return
    }
    if (dayNavFeel.wheel === 'glide') {
      onWheelGlide(delta, isNotch)
      return
    }
    engineStop()
    cancelMomentum()
    cancelGlide()
    clearWheelSnap()
    swipeTargetIndexRef.current = null
    setIsFreeScrolling(true)
    w.scrollLeft += delta
    wheelSnapRef.current = window.setTimeout(() => {
      wheelSnapRef.current = null
      setIsFreeScrolling(false)
      snapToNearest()
    }, 130)
  }

  const onWheelRef = useRef(onWheel)
  useEffect(() => {
    onWheelRef.current = onWheel
  })
  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    const listener = (e: WheelEvent) => onWheelRef.current(e)
    el.addEventListener('wheel', listener, { passive: false })
    return () => el.removeEventListener('wheel', listener)
  }, [])

  useLayoutEffect(() => {
    engineStop()
    layoutRef.current = null
    suppressScrollSync.current = true
    scrollToIndex(anchorIndex, false)
    updateFade()
    suppressScrollSync.current = false
  }, [anchorIndex, dates.length])

  useEffect(() => {
    const w = windowRef.current
    const engine = engineRef.current
    if (!w) return
    const ro = new ResizeObserver(() => {
      engineStop()
      layoutRef.current = null
      suppressScrollSync.current = true
      scrollToIndex(idx, false)
      updateFade()
      suppressScrollSync.current = false
    })
    ro.observe(w)
    return () => {
      ro.disconnect()
      cancelMomentum()
      if (glideRef.current !== null) cancelAnimationFrame(glideRef.current)
      if (engine.raf !== null) cancelAnimationFrame(engine.raf)
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

  const leanRows = (dx: number | null) => {
    const rows = windowRef.current
      ?.closest('.day-rail')
      ?.querySelector<HTMLElement>('.day-grid-rows:not(.day-rows-ghost)')
    if (!rows) return
    if (dx === null) {
      rows.style.transition = 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.32s ease'
      rows.style.transform = ''
      rows.style.opacity = ''
      return
    }
    rows.style.transition = 'none'
    rows.style.transform = `translate3d(${dx}px, 0, 0)`
    rows.style.opacity = String(Math.max(0.55, 1 - Math.abs(dx) / 700))
  }

  const clearSectionSwipe = () => {
    if (touchSwipeRef.current && dayNavFeel.followFinger) leanRows(null)
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
    if (dayNavFeel.followFinger && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.35) {
      // Past the first or last day the cards barely give, like a rubber band.
      const edge = !canSwipeToDirection(deltaX < 0 ? 1 : -1)
      leanRows(deltaX * (edge ? 0.1 : 0.32))
    }
  }

  const onDocumentTouchEnd = (e: TouchEvent) => {
    if (!isMobileViewport()) return
    const swipe = touchSwipeRef.current
    touchSwipeRef.current = null
    const touch = e.changedTouches[0]
    if (!swipe || !touch) return
    if (dayNavFeel.followFinger) leanRows(null)

    const direction = getCommittedDaySwipe({
      deltaX: touch.clientX - swipe.startX,
      deltaY: touch.clientY - swipe.startY,
    })

    const swipeSourceIndex = getSwipeSourceIndex()
    if (direction === 0) return
    if (!canSwipeToDirection(direction, swipeSourceIndex)) return
    if (!swipeToIndex(swipeSourceIndex + direction)) return

    // Event-handler timestamp, not a rendered value.
    // eslint-disable-next-line react-hooks/purity
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!dayNavFeel.keys || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target instanceof HTMLElement ? e.target : null
      // Only somewhere you type: a focused button or checkbox shouldn't swallow ← →.
      if (el?.closest('input:not([type="checkbox"], [type="radio"], [type="button"]), textarea, select, [contenteditable="true"], iframe')) return
      if (document.querySelector('.modal-backdrop, .dialog, [role="dialog"], [role="menu"]')) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        goToIndex(getSwipeSourceIndex() + (e.key === 'ArrowLeft' ? -1 : 1))
      } else if (e.key === 't' || e.key === 'T') {
        goToIndex(anchorIndex)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
        {/* Always rendered, so it can fade in and out rather than pop. The
            chevron points the way today lies. */}
        <button
          type="button"
          className={`day-jump-btn ${idx !== anchorIndex ? 'is-shown' : ''}`.trim()}
          data-dir={idx > anchorIndex ? 'left' : 'right'}
          onClick={() => goToIndex(anchorIndex)}
          aria-hidden={idx === anchorIndex || undefined}
          tabIndex={idx === anchorIndex ? -1 : undefined}
        >
          <Chevron dir="left" />
          <span className="day-jump-label">{anchorLabel}</span>
          <Chevron dir="right" />
        </button>
      </div>
      <div className="day-carousel" ref={carouselRef}>
        <button
          type="button"
          className="day-arrow"
          onClick={() => goToIndex(getSwipeSourceIndex() - 1)}
          disabled={idx === 0}
          aria-label="Previous matchday"
        >
          <Chevron dir="left" />
        </button>
        <div
          className={`day-carousel-window ${isDragging ? 'is-dragging' : ''} ${isFreeScrolling ? 'is-free-scrolling' : ''}`}
          ref={windowRef}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
        >
          <div className="day-track" ref={trackRef}>
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
                  // Against where the strip is heading, not the day it's
                  // passing: tapping the day you started from mid-glide goes back.
                  if (i !== getSwipeSourceIndex()) goToIndex(i)
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
          onClick={() => goToIndex(getSwipeSourceIndex() + 1)}
          disabled={idx === dates.length - 1}
          aria-label="Next matchday"
        >
          <Chevron dir="right" />
        </button>
      </div>

      {!isRestDay ? (
        <div
          className={`day-grid ${progress.spotlight ? 'is-spotlight' : ''}`.trim()}
          ref={gridRef}
          style={gridStyle}
        >
          <div
            className="day-grid-rows"
            key={date}
            data-enter={shown.dir === 0 ? undefined : shown.dir > 0 ? 'next' : 'prev'}
          >
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
