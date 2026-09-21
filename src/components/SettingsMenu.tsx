/**
 * The header's one menu — everything about the app rather than the football.
 *
 * It exists as a consolidation, not as a drawer with room to grow: the help
 * button and the lone "Reset progress" in the page footer were two separate
 * pieces of chrome for the same kind of thing. One trigger now, two items,
 * and the footer is gone.
 *
 * Archive is the one exception to "about the app": finished competitions,
 * retired from the season picker so it only lists what is in season. It is a
 * second page the panel slides over to, not a flyout — a flyout off a panel
 * already hung from the screen's right edge has nowhere to go on a phone —
 * and not an inline list, which would grow the menu with every season
 * archived. A dot on the row says when you are in one.
 *
 * Deliberately not a gear. A gear promises preferences; this is a guide and
 * one destructive action, so the mark is three rules — a list, which is what
 * opens. The last rule is short at rest and runs out to full width on hover,
 * which is the whole animation budget.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface ArchiveEntry {
  id: string
  /** The competition, e.g. 'World Cup'. */
  label: string
  /** The season, e.g. '2026'. */
  season: string
  /** The span it ran over, e.g. 'Jun 11 – Jul 19'. */
  dates?: string
  /** A small piece of artwork for the row's tile; initials stand in without one. */
  art?: string
  active: boolean
  onSelect: () => void
}

export function SettingsMenu({
  archive,
  onHowThisWorks,
  onReset,
}: {
  archive: ArchiveEntry[]
  onHowThisWorks: () => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const inArchive = archive.some((a) => a.active)
  const [page, setPage] = useState<'root' | 'archive'>('root')
  // Set when you come back from Archive, so focus returns to the row you left by.
  const returning = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Opening with the keyboard should land you in the menu, not behind it, and
  // turning a page should land you on that page.
  useEffect(() => {
    if (!open) return
    const scope = menuRef.current?.querySelector(`[data-page='${page}']`)
    const target =
      page === 'archive'
        ? // Straight to the seasons (the one you are in, if any), past the back row.
          (scope?.querySelector('.menu-archive-row.is-active') ?? scope?.querySelector('.menu-archive-row'))
        : scope?.querySelector(returning.current ? '.menu-archive-open' : '.menu-item')
    returning.current = false
    ;(target as HTMLButtonElement | null | undefined)?.focus()
  }, [open, page])

  // The panel takes the height of the page it is showing, animated,
  // so the second page does not sit in the first one's empty frame.
  useLayoutEffect(() => {
    const pages = pagesRef.current
    if (!open || !pages) return
    const current = pages.querySelector<HTMLElement>(`[data-page='${page}']`)
    if (current) pages.style.height = `${current.offsetHeight}px`
  }, [open, page])

  const toggle = () => {
    // Each opening starts from the top page.
    if (!open) setPage('root')
    setOpen((v) => !v)
  }

  const choose = (action: () => void) => {
    setOpen(false)
    action()
  }

  const howItem = (
    <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onHowThisWorks)}>
      <HelpIcon />
      <span className="menu-item-label">How this works</span>
    </button>
  )
  const resetItem = (
    <button type="button" role="menuitem" className="menu-item is-danger" onClick={() => choose(onReset)}>
      <ResetIcon />
      <span className="menu-item-label">Reset progress</span>
    </button>
  )
  const entries = archive.map((a) => <ArchiveRow key={a.id} entry={a} onSelect={() => choose(a.onSelect)} />)

  return (
    <div className={`menu-root ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        title="Menu"
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" className="menu-mark">
          <path d="M2.6 4.6h10.8" />
          <path d="M2.6 8h10.8" />
          <path d="M2.6 11.4h10.8" className="menu-mark-short" />
        </svg>
      </button>

      {open && (
        <div className="menu-panel" role="menu" aria-label="Menu" ref={menuRef}>
          <div className="menu-pages" ref={pagesRef} data-at={page}>
            <div className="menu-page" data-page="root" inert={page !== 'root'}>
              {howItem}
              {archive.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-label={inArchive ? 'Archive, viewing now' : 'Archive'}
                  className="menu-item menu-archive-open"
                  onClick={() => setPage('archive')}
                >
                  <ArchiveIcon />
                  <span className="menu-item-label">Archive</span>
                  {inArchive && <span className="menu-item-dot" />}
                  <Chevron />
                </button>
              )}
              <div className="menu-divider" />
              {resetItem}
            </div>
            <div className="menu-page" data-page="archive" inert={page !== 'archive'}>
              <button
                type="button"
                role="menuitem"
                className="menu-item menu-back"
                onClick={() => {
                  returning.current = true
                  setPage('root')
                }}
              >
                <Chevron back />
                <span className="menu-item-label">Archive</span>
              </button>
              <div className="menu-divider" />
              {entries}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ArchiveRow({ entry, onSelect }: { entry: ArchiveEntry; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={entry.active}
      className={`menu-item menu-archive-row ${entry.active ? 'is-active' : ''}`}
      onClick={onSelect}
    >
      <span className="menu-archive-art" aria-hidden="true">
        {entry.art ? <img src={entry.art} alt="" /> : entry.label.slice(0, 2)}
      </span>
      <span className="menu-archive-text">
        <span className="menu-archive-title">
          {entry.label} {entry.season}
        </span>
        {entry.dates && <span className="menu-archive-meta">{entry.dates}</span>}
      </span>
      <svg className="picker-check" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
        <path
          d="M2.6 7.4 5.4 10.2l6-6.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/* Row icons: 16px line marks drawn to the same pen as the menu's own mark. */

function HelpIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.1" />
      <path d="M6.3 6.3a1.75 1.75 0 1 1 2.4 1.62c-.44.18-.7.56-.7 1.02v.26" />
      <path d="M8 11.35v.05" className="menu-icon-dot" />
    </svg>
  )
}

function ArchiveIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="2.2" y="3" width="11.6" height="3.3" rx="1" />
      <path d="M3.3 6.3v5.7a1.4 1.4 0 0 0 1.4 1.4h6.6a1.4 1.4 0 0 0 1.4-1.4V6.3" />
      <path d="M6.6 9h2.8" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg className="menu-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3.1 8.6a4.95 4.95 0 1 0 1.3-4.1L2.8 6.1" />
      <path d="M2.8 2.9v3.2H6" />
    </svg>
  )
}

function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg
      className={`menu-chevron ${back ? 'is-back' : ''}`}
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path d="M4.6 3 7.6 6l-3 3" />
    </svg>
  )
}
