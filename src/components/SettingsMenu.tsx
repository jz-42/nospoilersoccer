/**
 * The header's one menu — everything about the app rather than the football.
 *
 * Deliberately not a gear. A gear promises preferences; this is a guide, so
 * the mark is three rules — a list, which is what opens. The last rule is
 * short at rest and runs out to full width on hover, which is the whole
 * animation budget.
 */
import { useEffect, useRef, useState } from 'react'

export function SettingsMenu({
  onHowThisWorks,
}: {
  onHowThisWorks: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  // Opening with the keyboard should land you in the menu, not behind it.
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('.menu-item')?.focus()
  }, [open])

  const choose = (action: () => void) => {
    setOpen(false)
    action()
  }

  return (
    <div className={`menu-root ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu"
        title="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" className="menu-mark">
          <path d="M2.6 4.6h10.8" />
          <path d="M2.6 8h10.8" />
          <path d="M2.6 11.4h10.8" className="menu-mark-short" />
        </svg>
      </button>

      {open && (
        <div className="menu-panel" role="menu" aria-label="Menu" ref={menuRef}>
          <button type="button" role="menuitem" className="menu-item" onClick={() => choose(onHowThisWorks)}>
            How this works
          </button>
        </div>
      )}
    </div>
  )
}
