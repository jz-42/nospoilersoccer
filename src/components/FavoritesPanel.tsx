import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { TeamId, Team, Tournament } from '../data/types'
import type { Progress } from '../state/progress'
import { Flag } from './Flag'
import { Heart } from './Heart'

/** Below this the add-list fits without hunting, and a search field is clutter. */
const SEARCH_THRESHOLD = 14

/**
 * Drag-to-reorder for the favorites list.
 *
 * Rows are a fixed height, which is what keeps this ~70 lines instead of a
 * dependency: the slot you are over is just the drag distance divided by the
 * row pitch. Nothing re-lays-out mid-drag — the lifted row and the rows it
 * displaces are moved with transforms only, so the motion can't stutter and
 * the pitch measured on pointerdown stays true. The order is committed on
 * release, which is also the only point anything is written to storage.
 */
function useDragOrder(ids: readonly TeamId[], commit: (order: readonly TeamId[]) => void) {
  const listRef = useRef<HTMLUListElement>(null)
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null)
  const pitchRef = useRef(0)
  const startRef = useRef<{ index: number; y: number; pointerId: number } | null>(null)

  const onPointerDown = (index: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    // On touch the row itself has to stay scrollable — the panel is a list you
    // flick through — so a finger may only start a drag from the grip, which
    // is the one element that opts out of panning. A mouse can grab anywhere.
    if (e.pointerType === 'touch' && !target.closest('.fav-grip')) return
    const rows = listRef.current?.querySelectorAll('.fav-item')
    if (!rows || rows.length < 2) return
    pitchRef.current = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top
    startRef.current = { index, y: e.clientY, pointerId: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const start = startRef.current
    if (!start || e.pointerId !== start.pointerId) return
    const dy = e.clientY - start.y
    // A few pixels of slack, so a tap on the row never reads as a drag.
    if (!drag && Math.abs(dy) < 4) return
    const pitch = pitchRef.current || 1
    const last = ids.length - 1
    const to = Math.max(0, Math.min(last, start.index + Math.round(dy / pitch)))
    // Travel is clamped to the list, so the row can't be flung past either end.
    const min = -start.index * pitch
    const max = (last - start.index) * pitch
    setDrag({ from: start.index, to, dy: Math.max(min, Math.min(max, dy)) })
    e.preventDefault()
  }

  const finish = (e: ReactPointerEvent<HTMLElement>) => {
    const start = startRef.current
    if (!start || e.pointerId !== start.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    startRef.current = null
    if (drag && drag.to !== drag.from) {
      const next = [...ids]
      next.splice(drag.to, 0, ...next.splice(drag.from, 1))
      commit(next)
    }
    setDrag(null)
  }

  /** Where row `i` should sit right now, in pixels. */
  const offset = (i: number) => {
    if (!drag) return 0
    if (i === drag.from) return drag.dy
    const pitch = pitchRef.current
    if (drag.to > drag.from && i > drag.from && i <= drag.to) return -pitch
    if (drag.to < drag.from && i < drag.from && i >= drag.to) return pitch
    return 0
  }

  return {
    listRef,
    dragging: drag !== null,
    rowProps: (i: number) => ({
      onPointerDown: onPointerDown(i),
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      className: `fav-item ${drag?.from === i ? 'is-dragging' : ''}`.trim(),
      style: {
        transform: offset(i) === 0 ? undefined : `translateY(${offset(i)}px)`,
        // The lifted row must track the finger exactly; the rows it displaces
        // glide out of its way, which is the whole feel of the thing.
        transition: drag?.from === i ? 'none' : undefined,
      },
    }),
  }
}

/** Heart in the header → the panel for picking, ordering and searching teams. */
export function FavoritesPanel({ t, progress }: { t: Tournament; progress: Progress }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // Favorites are global, but the heart answers for the competition on
  // screen: following only Argentina shouldn't fill it in the Premier League.
  const hasFavorites = progress.favorites.some((id) => id in t.teams)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="fav-root" ref={rootRef}>
      <button
        type="button"
        className={`fav-btn ${hasFavorites ? 'has-favs' : ''}`.trim()}
        aria-label="Favorite teams"
        aria-expanded={open}
        title="Favorite teams"
        onClick={() => setOpen((o) => !o)}
      >
        <Heart filled={hasFavorites} size={15} />
      </button>

      {/* The body is its own component so closing the panel unmounts the search
          box with it — reopening is then a clean slate, with no effect having
          to reach in and clear last time's half-typed query. */}
      {open && <FavPanel t={t} progress={progress} />}
    </div>
  )
}

function FavPanel({ t, progress }: { t: Tournament; progress: Progress }) {
  const [query, setQuery] = useState('')
  // Your teams that play in this competition. The rest of the list is still
  // followed — it just has nothing to show here — and a reorder of these
  // leaves their slots in the global order alone.
  const here = progress.favorites.filter((id) => id in t.teams)
  const { listRef, dragging, rowProps } = useDragOrder(here, progress.setFavorites)

  const showSearch = Object.keys(t.teams).length > SEARCH_THRESHOLD
  const favorites = here.map((id) => t.teams[id])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return (team: Team) =>
      team.name.toLowerCase().includes(q) || (team.shortName?.toLowerCase().includes(q) ?? false)
  }, [query])

  /*
   * Search filters the add-list only. Your own list is short and is the thing
   * you came here to rearrange — hiding rows out of it would also break the
   * drag, which addresses rows by their index in the real order.
   */
  const rest = Object.values(t.teams)
    .filter((team) => !progress.favorites.includes(team.id))
    .filter((team) => (matches ? matches(team) : true))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className={`fav-panel ${dragging ? 'is-reordering' : ''}`.trim()}>
      <div className="fav-panel-head">
        <span className="fav-panel-title">Favorite teams</span>
        {showSearch && (
          <span className="fav-search">
            <svg className="fav-search-icon" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="m10.4 10.4 3 3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              className="fav-search-input"
              placeholder="Search"
              aria-label="Search teams"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </span>
        )}
      </div>

      {favorites.length > 0 ? (
        <>
          <ul className="fav-list" ref={listRef}>
            {favorites.map((team, i) => (
              <li key={team.id} {...rowProps(i)}>
                <span className="fav-grip" aria-hidden="true">
                  <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor">
                    <circle cx="3" cy="4" r="1.1" />
                    <circle cx="7" cy="4" r="1.1" />
                    <circle cx="3" cy="8" r="1.1" />
                    <circle cx="7" cy="8" r="1.1" />
                    <circle cx="3" cy="12" r="1.1" />
                    <circle cx="7" cy="12" r="1.1" />
                  </svg>
                </span>
                <Flag team={team} className="flag fav-crest" />
                <span className="fav-name">{team.name}</span>
                <button
                  type="button"
                  className="fav-toggle-btn is-on"
                  aria-label={`Unfollow ${team.name}`}
                  onClick={() => progress.toggleFavorite(team.id)}
                >
                  <Heart size={18} />
                </button>
              </li>
            ))}
          </ul>

          <div className="fav-options">
            <label className="fav-auto">
              <input
                type="checkbox"
                checked={progress.favAuto}
                onChange={(e) => progress.setFavAuto(e.target.checked)}
              />
              <span>Highlight matches</span>
            </label>
            <label className="fav-auto">
              <input
                type="checkbox"
                checked={progress.spotlight}
                onChange={(e) => progress.setSpotlight(e.target.checked)}
              />
              <span>Spotlight</span>
            </label>
          </div>

          <div className="fav-divider" />
        </>
      ) : (
        <p className="fav-empty">Tap a heart to follow a team</p>
      )}

      <div className="fav-grid">
        {rest.map((team) => (
          <button
            key={team.id}
            type="button"
            className="fav-add"
            onClick={() => progress.toggleFavorite(team.id)}
          >
            <Flag team={team} className="flag fav-crest" />
            <span className="fav-name">{team.name}</span>
            <span className="fav-toggle-btn" aria-hidden="true">
              <Heart filled={false} size={18} />
            </span>
          </button>
        ))}
        {rest.length === 0 && query.trim() !== '' && (
          <p className="fav-empty">No team by that name</p>
        )}
      </div>
    </div>
  )
}
