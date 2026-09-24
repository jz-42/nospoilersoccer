/**
 * Watch later — the shelf saved matches never had.
 *
 * The clock on a match writes to `pins`; until now nothing read them back as
 * a list, so saving a match was a note to yourself with nowhere to look it
 * up. This is that place: the clock in the header opens the queue
 * full-screen, every saved match at the same size, in an order you set by
 * dragging.
 *
 * Three rules shape it:
 *
 *   - **It is a grid of the same card, never a new one.** Every cell is the
 *     ordinary `PreviewCard`, so a locked knockout tie in your queue shows the
 *     same placeholders it shows everywhere else. A bespoke row here would be
 *     a second place to get the spoiler rules right, and a second place to get
 *     them wrong.
 *   - **Watching a match takes it out of the queue.** It stays on screen,
 *     dimmed, for as long as the queue is open — losing your place the instant
 *     a video ends would be worse than a stale row — and is dropped when you
 *     close it. A watch-later list that keeps what you've watched is a history,
 *     which is not what anybody opens it for.
 *   - **What you can watch comes first, in your order.** There is one order —
 *     newest save first, then whatever you drag it into — and a play button
 *     appearing only moves a match up among the ready ones, at the rank you
 *     gave it (see splitQueue). You drag within a section, never across one:
 *     which side a match is on is the data's call, not yours. The headings
 *     only appear once there is a split to label; a queue that is all one
 *     kind is just the grid.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { findSeason, loadSeason } from '../data'
import type { Tournament } from '../data/types'
import { watchLaterParts, type Progress } from '../state/progress'
import type { ModalTarget } from './MatchModal'
import { ClockIcon } from './ClockIcon'
import { PreviewCard } from './PreviewCard'
import type { RailEntry } from './PreviewCard'
import { matchLocalDate } from './schedule'
import { showsPlayButton } from './status'
import {
  dropIndex,
  reorder,
  slotDuringDrag,
  slotOffset,
  splitQueue,
  type SlotRect,
} from './queue'

const mascotUrl = new URL('../assets/mascot-watch-later.webp', import.meta.url).href

/** How far a mouse travels before a press becomes a drag rather than a click. */
const DRAG_SLOP = 8
/** Hysteresis on the drop slot, as a share of a card's width. See dropIndex. */
const DROP_HOLD = 0.18
/** A click this close to a card is a near miss on it, not a click on nothing. */
const NEAR_CARD = 36
/** A touch has to stay put this long to be a drag; moving sooner is a scroll. */
const HOLD_MS = 280
const HOLD_SLOP = 10

/** Module scope so the listener we remove is the listener we added. */
function blockTouchScroll(e: TouchEvent) {
  e.preventDefault()
}

/** Every match in the competition, keyed by id, carrying the round a modal needs. */
function matchEntries(t: Tournament): Map<string, RailEntry> {
  const out = new Map<string, RailEntry>()
  for (const m of t.groupMatches) {
    out.set(m.id, { target: { kind: 'group', match: m }, date: matchLocalDate(m) })
  }
  for (const round of t.knockoutRounds) {
    for (const m of round.matches) {
      out.set(m.id, {
        target: { kind: 'knockout', match: m, roundName: round.name },
        date: matchLocalDate(m),
      })
    }
  }
  return out
}

interface SavedEntry {
  tournament: Tournament
  entry: RailEntry
}

export function WatchLater({
  t,
  progress,
  onOpen,
  covered,
}: {
  t: Tournament
  progress: Progress
  onOpen: (tournament: Tournament, target: ModalTarget) => void
  /** A match opened from the queue is on top of it, and Escape is the match's. */
  covered: boolean
}) {
  const [open, setOpen] = useState(false)
  const [otherTournaments, setOtherTournaments] = useState<Record<string, Tournament | null>>({})
  const ids = progress.allPinOrder

  // Club seasons are lazy chunks. Load only seasons that actually have saved
  // matches, when the queue opens; a missing season stays removable in place.
  useEffect(() => {
    if (!open) return
    const needed = [...new Set(ids.map((key) => watchLaterParts(key)?.tournamentId).filter((id): id is string => !!id))]
      .filter((id) => id !== t.id && !(id in otherTournaments))
    if (needed.length === 0) return
    let cancelled = false
    void Promise.all(needed.map(async (id): Promise<[string, Tournament | null]> => {
      const found = findSeason(id)
      if (!found) return [id, null]
      try {
        return [id, await loadSeason(found.season)]
      } catch {
        return [id, null]
      }
    })).then((loaded) => {
      if (cancelled) return
      setOtherTournaments((current) => ({ ...current, ...Object.fromEntries(loaded) }))
    })
    return () => { cancelled = true }
  }, [open, ids, t.id, otherTournaments])

  const loading = ids.some((key) => {
    const seasonId = watchLaterParts(key)?.tournamentId
    return seasonId && seasonId !== t.id && !(seasonId in otherTournaments)
  })
  const entries = useMemo(() => {
    const tournaments: Record<string, Tournament | null> = { ...otherTournaments, [t.id]: t }
    const bySeason = new Map<string, Map<string, RailEntry>>()
    const out = new Map<string, SavedEntry>()
    for (const key of ids) {
      const parts = watchLaterParts(key)
      if (!parts) continue
      const tournament = tournaments[parts.tournamentId]
      if (!tournament) continue
      let matches = bySeason.get(parts.tournamentId)
      if (!matches) {
        matches = matchEntries(tournament)
        bySeason.set(parts.tournamentId, matches)
      }
      const entry = matches.get(parts.matchId)
      if (entry) out.set(key, { tournament, entry })
    }
    return out
  }, [ids, otherTournaments, t])

  const close = useCallback(() => {
    setOpen(false)
    const watched = ids.filter((key) => {
      const saved = entries.get(key)
      return saved && progress.forTournament(saved.tournament).marks[saved.entry.target.match.id] === 'watched'
    })
    if (watched.length > 0) progress.removePins(watched)
  }, [ids, entries, progress])

  useEffect(() => {
    if (!open || covered) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, covered])

  // The overlay owns the whole viewport, so the page behind it must not
  // scroll under the pointer while a card is being dragged across it.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        className={`clock-btn ${ids.length > 0 ? 'has-queue' : ''}`}
        aria-label={ids.length > 0 ? `Watch Later (${ids.length})` : 'Watch Later'}
        title="Watch Later"
        onClick={() => setOpen(true)}
      >
        <ClockIcon size={17} />
      </button>

      {/* Through a portal, because the clock lives in `.app-header` and a
          backdrop-filter makes that header the containing block for every
          fixed descendant — `inset: 0` inside it means the header's 63px, not
          the viewport. The overlay has to hang off the body to be full-screen. */}
      {open &&
        createPortal(
          <QueueOverlay
            ids={ids}
            entries={entries}
            loading={loading}
            progress={progress}
            onOpen={onOpen}
            onClose={close}
          />,
          document.body,
        )}
    </>
  )
}

type Section = 'ready' | 'waiting'

const SECTION_LABEL: Record<Section, string> = {
  ready: 'Ready',
  waiting: 'Waiting',
}

/** What a drag holds still until it ends: the section it is in, as it was. */
interface Held {
  section: Section
  /** The section's matches in order, as the drag began. */
  members: readonly string[]
  /** Which matches were ready as the drag began, so no card changes sides mid-drag. */
  ready: ReadonlySet<string>
  /** The slots, measured once when the drag began. See queue.ts. */
  rects: SlotRect[]
}

interface Drag extends Held {
  from: number
  to: number
  dx: number
  dy: number
}

interface Press {
  pointerId: number
  id: string
  startX: number
  startY: number
  touch: boolean
  scrollTop: number
  /** Set when the press becomes a drag. */
  held: (Held & { index: number }) | null
  holdTimer: number | undefined
}

type Positions = Map<string, { left: number; top: number }>

function QueueOverlay({
  ids,
  entries,
  loading,
  progress,
  onOpen,
  onClose,
}: {
  ids: readonly string[]
  entries: Map<string, SavedEntry>
  loading: boolean
  progress: Progress
  onOpen: (tournament: Tournament, target: ModalTarget) => void
  onClose: () => void
}) {
  const [drag, setDrag] = useState<Drag | null>(null)
  // Cards by match id, and the two headings — everything the drop and a
  // section change slide from where it was.
  const itemsRef = useRef(new Map<string, HTMLLIElement>())
  const headsRef = useRef(new Map<Section, HTMLHeadingElement>())
  const scrollRef = useRef<HTMLDivElement>(null)
  const pressRef = useRef<Press | null>(null)
  const targetRef = useRef(0)
  // A finished drag is followed by a click on the card underneath it. This
  // swallows that one click so a reorder never also opens a match.
  const draggedRef = useRef(false)
  const rectsRef = useRef<Positions>(new Map())
  const seenKeyRef = useRef<string | null>(null)
  const cameFromDragRef = useRef(false)
  const landingRef = useRef<string | null>(null)
  const dragRef = useRef(false)

  const { reorderAllPins } = progress

  // Ready is decided in each match's own competition. Its own mark is left
  // out: a card you have just watched stays where it was, dimmed, rather than
  // dropping into the other section under you.
  const readyNow = useMemo(() => {
    const out = new Set<string>()
    for (const id of ids) {
      const saved = entries.get(id)
      if (!saved) continue
      const { marks, revealed } = progress.forTournament(saved.tournament)
      const matchId = saved.entry.target.match.id
      const others = { ...marks }
      delete others[matchId]
      if (showsPlayButton(saved.tournament, matchId, { marks: others, revealed })) out.add(id)
    }
    return out
  }, [ids, entries, progress])
  const readySet = drag?.ready ?? readyNow
  const sections = useMemo(() => splitQueue(ids, (id) => readySet.has(id)), [ids, readySet])
  const split = sections.ready.length > 0 && sections.waiting.length > 0

  // What the pointer handlers read: they outlive the render they started in.
  const liveRef = useRef({ ids, sections, readySet })
  useLayoutEffect(() => {
    dragRef.current = drag !== null
    liveRef.current = { ids, sections, readySet }
  })

  const animated = useCallback(
    (): Array<[string, HTMLElement]> => [
      ...itemsRef.current,
      ...[...headsRef.current].map(([section, el]): [string, HTMLElement] => [`#${section}`, el]),
    ],
    [],
  )

  const measureRects = useCallback(() => {
    const next: Positions = new Map()
    for (const [key, el] of animated()) {
      const r = el.getBoundingClientRect()
      next.set(key, { left: r.left, top: r.top })
    }
    return next
  }, [animated])

  const endPress = useCallback(() => {
    const press = pressRef.current
    if (press?.holdTimer !== undefined) window.clearTimeout(press.holdTimer)
    pressRef.current = null
    document.removeEventListener('touchmove', blockTouchScroll)
    document.body.style.removeProperty('user-select')
  }, [])

  useEffect(() => endPress, [endPress])

  // Positions are what a slide animates from. Scroll and resize move every
  // card without changing the order, and a stale origin would send them flying.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const record = () => {
      if (dragRef.current) return
      const settling = animated().some(([, el]) =>
        el.getAnimations().some((anim) => anim.playState === 'running'),
      )
      if (settling) return
      rectsRef.current = measureRects()
    }
    scroller.addEventListener('scroll', record, { passive: true })
    window.addEventListener('resize', record)
    return () => {
      scroller.removeEventListener('scroll', record)
      window.removeEventListener('resize', record)
    }
  }, [animated, measureRects])

  // Every layout, not just when the order changes, so the next slide always
  // starts from where things were last painted.
  useLayoutEffect(() => {
    if (drag) {
      cameFromDragRef.current = true
      return
    }
    const cameFromDrag = cameFromDragRef.current
    cameFromDragRef.current = false
    const landing = landingRef.current
    landingRef.current = null
    const key = `${sections.ready.join('\0')}|${sections.waiting.join('\0')}`
    // A new order slides, and so does a match changing sections — and every
    // card after a drop: they were measured where they sat on screen as the
    // pointer let go (see finish), so the dropped card glides in from the
    // pointer and the others finish their shuffle from mid-flight instead of
    // snapping. The first paint of the queue has nothing to slide from.
    const shouldFlip = cameFromDrag || (seenKeyRef.current !== null && seenKeyRef.current !== key)
    seenKeyRef.current = key
    const els = animated()
    const settling = els.some(([, el]) => el.getAnimations().some((anim) => anim.playState === 'running'))
    if (settling && !shouldFlip) return

    // Clearing the drag transforms starts a CSS transition on every card that
    // made way — back across the slot it has just been moved into, a whole
    // slot too far. The drop's own slide below replaces it, so it goes first.
    if (cameFromDrag) {
      for (const [, el] of els) el.getAnimations().forEach((anim) => anim.cancel())
    }

    const prev = rectsRef.current
    const next: Positions = new Map()
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    for (const [id, el] of els) {
      const r = el.getBoundingClientRect()
      next.set(id, { left: r.left, top: r.top })
      if (!shouldFlip || reduce) continue
      const old = prev.get(id)
      if (!old) continue
      const dx = old.left - r.left
      const dy = old.top - r.top
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
      el.getAnimations().forEach((anim) => anim.cancel())
      el.classList.add('is-settling')
      if (id === landing) el.classList.add('is-landing')
      const anim = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: 240, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
      )
      const clear = () => el.classList.remove('is-settling', 'is-landing')
      anim.onfinish = clear
      anim.oncancel = clear
    }
    rectsRef.current = next
  })

  /** Lift the pressed card. False if it has nowhere to go. */
  const beginDrag = useCallback((press: Press) => {
    const { sections: live, readySet: ready } = liveRef.current
    const section: Section = ready.has(press.id) ? 'ready' : 'waiting'
    const members = live[section]
    const index = members.indexOf(press.id)
    if (index < 0 || members.length < 2) return false
    // Only the section's own cards are slots: a card can't be dropped into
    // the other one.
    const rects = members.map((id) => {
      const r = itemsRef.current.get(id)?.getBoundingClientRect()
      return { left: r?.left ?? 0, top: r?.top ?? 0, width: r?.width ?? 0, height: r?.height ?? 0 }
    })
    press.held = { section, members, ready, rects, index }
    press.scrollTop = scrollRef.current?.scrollTop ?? 0
    targetRef.current = index
    draggedRef.current = true
    document.body.style.setProperty('user-select', 'none')
    if (press.touch) document.addEventListener('touchmove', blockTouchScroll, { passive: false })
    setDrag({ section, members, ready, rects, from: index, to: index, dx: 0, dy: 0 })
    return true
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLLIElement>, id: string, sectionSize: number) => {
    if (e.button !== 0 || sectionSize < 2 || pressRef.current) return
    // The remove button is a button, not a handle: a slow tap on it must
    // remove, never lift the card (and have its click swallowed as a drop).
    if ((e.target as Element).closest('.queue-remove')) return
    for (const [, el] of animated()) {
      el.getAnimations().forEach((anim) => anim.cancel())
      el.classList.remove('is-settling')
    }
    const touch = e.pointerType !== 'mouse'
    const press: Press = {
      pointerId: e.pointerId,
      id,
      startX: e.clientX,
      startY: e.clientY,
      touch,
      scrollTop: 0,
      held: null,
      holdTimer: undefined,
    }
    pressRef.current = press
    // Touch can't use a movement threshold — the first thing a finger does on
    // a scrollable grid is scroll. A press that holds still is the gesture.
    if (touch) {
      press.holdTimer = window.setTimeout(() => {
        if (!beginDrag(press)) finish(false)
      }, HOLD_MS)
    }

    function onMove(move: PointerEvent) {
      const current = pressRef.current
      if (!current || move.pointerId !== current.pointerId) return
      const dx = move.clientX - current.startX
      const dy = move.clientY - current.startY
      if (!current.held) {
        const distance = Math.hypot(dx, dy)
        if (current.touch) {
          if (distance > HOLD_SLOP) finish(false)
          return
        }
        if (distance < DRAG_SLOP) return
        if (!beginDrag(current)) return finish(false)
      }
      const held = current.held
      if (!held) return
      const scrolled = (scrollRef.current?.scrollTop ?? 0) - current.scrollTop
      // The card's centre, not the pointer: where you grabbed it mustn't
      // change how far it has to travel to take the next slot.
      const home = held.rects[held.index]
      targetRef.current = dropIndex(
        held.rects,
        home.left + home.width / 2 + dx,
        home.top + home.height / 2 + dy + scrolled,
        targetRef.current,
        home.width * DROP_HOLD,
      )
      setDrag({ ...held, from: held.index, to: targetRef.current, dx, dy: dy + scrolled })
    }

    function finish(commit: boolean) {
      const held = pressRef.current?.held
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      endPress()
      if (!held) {
        draggedRef.current = false
        return
      }
      // Where every card is on screen right now, drag transforms and all —
      // the drop animates from here, not from where the cards sat before.
      rectsRef.current = measureRects()
      landingRef.current = held.members[held.index]
      setDrag(null)
      if (commit && targetRef.current !== held.index) {
        const saved = new Set(liveRef.current.ids)
        reorderAllPins(reorder(held.members, held.index, targetRef.current).filter((m) => saved.has(m)))
      }
      // Cleared after the click that this pointerup is about to produce.
      window.setTimeout(() => {
        draggedRef.current = false
      }, 0)
    }

    // Only the finger that started the press ends it — a second one lifting
    // mid-drag must not drop the card.
    function onUp(up: PointerEvent) {
      if (up.pointerId === press.pointerId) finish(true)
    }
    function onCancel(cancel: PointerEvent) {
      if (cancel.pointerId === press.pointerId) finish(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  /**
   * A click on nothing closes the queue, like the match modal's backdrop —
   * in the grid's margins or along the top bar. It has to start and end on
   * nothing, without travelling, and well clear of every card and button — a
   * near miss on a card, the gaps between them, or the tail of a drag released
   * over empty space must never throw the queue away.
   */
  const backdropPressRef = useRef<{ x: number; y: number } | null>(null)
  const onEmptySpace = (target: EventTarget, x: number, y: number) => {
    if (!(target instanceof Element) || target.closest('.queue-item, button')) return false
    return [...itemsRef.current.values()].every((el) => {
      const r = el.getBoundingClientRect()
      const dx = Math.max(r.left - x, 0, x - r.right)
      const dy = Math.max(r.top - y, 0, y - r.bottom)
      return Math.hypot(dx, dy) > NEAR_CARD
    })
  }
  const onBackdropPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    backdropPressRef.current =
      e.button === 0 && onEmptySpace(e.target, e.clientX, e.clientY) ? { x: e.clientX, y: e.clientY } : null
  }
  const onBackdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const press = backdropPressRef.current
    backdropPressRef.current = null
    if (!press || draggedRef.current || pressRef.current) return
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_SLOP) return
    if (onEmptySpace(e.target, e.clientX, e.clientY)) onClose()
  }

  /**
   * Keyboard reordering, since the queue has no arrow buttons. React moves the
   * same keyed element rather than re-creating it, so focus rides along with
   * the card and you can walk it through its section with one held modifier.
   */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLLIElement>, members: readonly string[], index: number) => {
    if (!e.altKey) return
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    const to = index + step
    if (step === 0 || to < 0 || to >= members.length) return
    e.preventDefault()
    reorderAllPins(reorder(members, index, to))
  }

  return (
    <div
      className="queue-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Watch Later"
      onPointerDown={onBackdropPointerDown}
      onClick={onBackdropClick}
    >
      <header className="queue-bar">
        <div className="queue-bar-inner">
          <span className="queue-mark" aria-hidden="true">
            <ClockIcon size={20} />
          </span>
          <h2 className="queue-title">Watch Later</h2>
          {ids.length > 0 && <span className="queue-count">{ids.length}</span>}
          <button type="button" className="queue-close" aria-label="Close Watch Later" onClick={onClose}>
            <svg className="modal-close-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </header>

      <div className="queue-body" ref={scrollRef}>
        {ids.length === 0 ? (
          <div className="queue-empty">
            <img className="queue-empty-art" src={mascotUrl} alt="" width={600} height={473} draggable={false} />
            <p className="queue-empty-title">Nothing saved yet!</p>
            <p className="queue-empty-sub">
              Open a match and tap the top left{' '}
              <span className="queue-empty-glyph">
                <ClockIcon />
              </span>
            </p>
          </div>
        ) : loading ? (
          <div className="queue-loading" role="status">Loading saved matches…</div>
        ) : (
          <div className="queue-sections">
            {(['ready', 'waiting'] as const).map((section) => {
              const members = sections[section]
              if (members.length === 0) return null
              const dragging = drag?.section === section ? drag : null
              const headingId = `queue-heading-${section}`
              return (
                <section
                  key={section}
                  className={`queue-section is-${section}`}
                  aria-labelledby={split ? headingId : undefined}
                >
                  {split && (
                    <h3
                      className="queue-heading"
                      id={headingId}
                      ref={(el) => {
                        if (el) headsRef.current.set(section, el)
                        else headsRef.current.delete(section)
                      }}
                    >
                      {SECTION_LABEL[section]}
                    </h3>
                  )}
                  <ul className={`queue-grid ${dragging ? 'is-dragging' : ''}`}>
                    {members.map((id, i) => {
                      const saved = entries.get(id)
                      const itemProgress = saved ? progress.forTournament(saved.tournament) : null
                      let style: CSSProperties | undefined
                      if (dragging && i === dragging.from) {
                        style = { transform: `translate(${dragging.dx}px, ${dragging.dy}px)` }
                      } else if (dragging) {
                        const offset = slotOffset(dragging.rects, i, slotDuringDrag(dragging.from, dragging.to, i))
                        style = { transform: `translate(${offset.x}px, ${offset.y}px)` }
                      }
                      return (
                        <li
                          key={id}
                          ref={(el) => {
                            if (el) itemsRef.current.set(id, el)
                            else itemsRef.current.delete(id)
                          }}
                          className={`queue-item ${dragging && i === dragging.from ? 'is-lifted' : ''} ${
                            saved && itemProgress?.marks[saved.entry.target.match.id] !== undefined ? 'is-done' : ''
                          }`}
                          style={style}
                          onPointerDown={(e) => onPointerDown(e, id, members.length)}
                          onKeyDown={(e) => onKeyDown(e, members, i)}
                          onClickCapture={(e) => {
                            if (!draggedRef.current) return
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                        >
                          {saved && itemProgress ? (
                            <PreviewCard
                              t={saved.tournament}
                              entry={saved.entry}
                              progress={itemProgress}
                              sourceLabel={saved.tournament.name}
                              onOpen={(target) => onOpen(saved.tournament, target)}
                            />
                          ) : (
                            <div className="queue-unavailable">Saved match unavailable</div>
                          )}
                          <button
                            type="button"
                            className="queue-remove"
                            aria-label="Remove from Watch Later"
                            title="Remove from Watch Later"
                            onClick={() => progress.removePins([id])}
                          >
                            <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
                              <path
                                d="M3.6 3.6l6.8 6.8M10.4 3.6l-6.8 6.8"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
