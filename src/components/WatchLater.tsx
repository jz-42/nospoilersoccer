/**
 * Watch later — the shelf saved matches never had.
 *
 * The clock on a match writes to `pins`; until now nothing read them back as
 * a list, so saving a match was a note to yourself with nowhere to look it
 * up. This is that place: the clock in the header opens the queue
 * full-screen, every saved match at the same size, in an order you set by
 * dragging.
 *
 * Two rules shape it:
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
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
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
import { dropIndex, reorder, slotDuringDrag, slotOffset, type SlotRect } from './queue'

const mascotUrl = new URL('../assets/mascot-watch-later.webp', import.meta.url).href

/** How far a mouse travels before a press becomes a drag rather than a click. */
const DRAG_SLOP = 6
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

interface Drag {
  from: number
  to: number
  dx: number
  dy: number
  /** The slots, measured once when the drag began. See queue.ts. */
  rects: SlotRect[]
}

interface Press {
  pointerId: number
  index: number
  /** How many cards there were when the press started, for measuring slots. */
  count: number
  startX: number
  startY: number
  touch: boolean
  active: boolean
  scrollTop: number
  rects: SlotRect[]
  holdTimer: number | undefined
}

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
  const itemsRef = useRef<Array<HTMLLIElement | null>>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const pressRef = useRef<Press | null>(null)
  const targetRef = useRef(0)
  // A finished drag is followed by a click on the card underneath it. This
  // swallows that one click so a reorder never also opens a match.
  const draggedRef = useRef(false)

  const { reorderAllPins } = progress

  const endPress = useCallback(() => {
    const press = pressRef.current
    if (press?.holdTimer !== undefined) window.clearTimeout(press.holdTimer)
    pressRef.current = null
    document.removeEventListener('touchmove', blockTouchScroll)
    document.body.style.removeProperty('user-select')
  }, [])

  useEffect(() => endPress, [endPress])

  const beginDrag = useCallback((press: Press) => {
    press.active = true
    press.scrollTop = scrollRef.current?.scrollTop ?? 0
    // Sliced, not mapped whole: the element array keeps its high-water mark
    // when the queue shrinks, and a stale slot would be a droppable index with
    // no card in it.
    press.rects = itemsRef.current.slice(0, press.count).map((el) => {
      const r = el?.getBoundingClientRect()
      return { left: r?.left ?? 0, top: r?.top ?? 0, width: r?.width ?? 0, height: r?.height ?? 0 }
    })
    targetRef.current = press.index
    draggedRef.current = true
    document.body.style.setProperty('user-select', 'none')
    if (press.touch) document.addEventListener('touchmove', blockTouchScroll, { passive: false })
    setDrag({ from: press.index, to: press.index, dx: 0, dy: 0, rects: press.rects })
  }, [])

  const onPointerDown = (e: ReactPointerEvent<HTMLLIElement>, index: number) => {
    if (e.button !== 0 || ids.length < 2 || pressRef.current) return
    // The remove button is a button, not a handle: a slow tap on it must
    // remove, never lift the card (and have its click swallowed as a drop).
    if ((e.target as Element).closest('.queue-remove')) return
    const touch = e.pointerType !== 'mouse'
    const press: Press = {
      pointerId: e.pointerId,
      index,
      count: ids.length,
      startX: e.clientX,
      startY: e.clientY,
      touch,
      active: false,
      scrollTop: 0,
      rects: [],
      holdTimer: undefined,
    }
    pressRef.current = press
    // Touch can't use a movement threshold — the first thing a finger does on
    // a scrollable grid is scroll. A press that holds still is the gesture.
    if (touch) press.holdTimer = window.setTimeout(() => beginDrag(press), HOLD_MS)

    function onMove(move: PointerEvent) {
      const current = pressRef.current
      if (!current || move.pointerId !== current.pointerId) return
      const dx = move.clientX - current.startX
      const dy = move.clientY - current.startY
      if (!current.active) {
        const distance = Math.hypot(dx, dy)
        if (current.touch) {
          if (distance > HOLD_SLOP) finish(false)
          return
        }
        if (distance < DRAG_SLOP) return
        beginDrag(current)
      }
      const scrolled = (scrollRef.current?.scrollTop ?? 0) - current.scrollTop
      targetRef.current = dropIndex(
        current.rects,
        move.clientX,
        move.clientY + scrolled,
        current.index,
      )
      setDrag({
        from: current.index,
        to: targetRef.current,
        dx,
        dy: dy + scrolled,
        rects: current.rects,
      })
    }

    function finish(commit: boolean) {
      const current = pressRef.current
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      endPress()
      if (!current?.active) {
        draggedRef.current = false
        return
      }
      setDrag(null)
      if (commit && targetRef.current !== current.index) {
        reorderAllPins(reorder(ids, current.index, targetRef.current))
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
   * Keyboard reordering, since the queue has no arrow buttons. React moves the
   * same keyed element rather than re-creating it, so focus rides along with
   * the card and you can walk it across the grid with one held modifier.
   */
  const onKeyDown = (e: ReactKeyboardEvent<HTMLLIElement>, index: number) => {
    if (!e.altKey) return
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    const to = index + step
    if (step === 0 || to < 0 || to >= ids.length) return
    e.preventDefault()
    reorderAllPins(reorder(ids, index, to))
  }

  return (
    <div className="queue-overlay" role="dialog" aria-modal="true" aria-label="Watch Later">
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
          <ul className={`queue-grid ${drag ? 'is-dragging' : ''}`}>
            {ids.map((id, i) => {
              const saved = entries.get(id)
              const itemProgress = saved ? progress.forTournament(saved.tournament) : null
              const slot = drag ? slotDuringDrag(drag.from, drag.to, i) : i
              let style: CSSProperties | undefined
              if (drag && i === drag.from) {
                style = { transform: `translate(${drag.dx}px, ${drag.dy}px)` }
              } else if (drag) {
                const offset = slotOffset(drag.rects, i, slot)
                style = { transform: `translate(${offset.x}px, ${offset.y}px)` }
              }
              return (
                <li
                  key={id}
                  ref={(el) => {
                    itemsRef.current[i] = el
                  }}
                  className={`queue-item ${drag && i === drag.from ? 'is-lifted' : ''} ${
                    saved && itemProgress?.marks[saved.entry.target.match.id] !== undefined ? 'is-done' : ''
                  }`}
                  style={style}
                  onPointerDown={(e) => onPointerDown(e, i)}
                  onKeyDown={(e) => onKeyDown(e, i)}
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
        )}
      </div>
    </div>
  )
}
