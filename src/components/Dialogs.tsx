import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Logo } from './Logo'

type Disclosure = 'privacy' | 'advanced'

const DISCLOSURE_COPY: Record<Disclosure, string> = {
  privacy: 'Your data stay in this browser and are not sent to us.',
  advanced:
    'This is a static React website with no application backend. Your progress is stored in your browser. Results and highlights are updated automatically through GitHub Actions and delivered when the site refreshes. YouTube is loaded only after you choose a highlight.',
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEscape(onCancel)
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal dialog" role="alertdialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">{title}</h3>
        <p className="dialog-body">{body}</p>
        <div className="dialog-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'btn-primary btn-primary-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Onboarding({ onClose }: { onClose: () => void }) {
  useEscape(onClose)
  const [open, setOpen] = useState<Disclosure | null>(null)
  const toggle = (next: Disclosure) =>
    setOpen((current) => (current === next ? null : next))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal dialog onboarding" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-logo">
          <Logo size={44} />
        </div>
        <h3 className="dialog-title">Catch up. No spoilers.</h3>
        <ul className="onboarding-list">
          <li>Every score stays hidden until you reveal it.</li>
          <li>Click a match to watch its highlights, then click to reveal the result.</li>
          <li>Progress saves in this browser. No account.</li>
        </ul>
        <button type="button" className="btn-primary" onClick={onClose}>
          Let's go
        </button>
        <div className="onboarding-disclosures">
          <div className="onboarding-disclosure-panel" aria-live="polite">
            {open && <p key={open}>{DISCLOSURE_COPY[open]}</p>}
          </div>
          <div className="onboarding-disclosure-row">
            <button
              type="button"
              className="onboarding-disclosure-link"
              aria-expanded={open === 'privacy'}
              onClick={() => toggle('privacy')}
            >
              Privacy
            </button>
            <button
              type="button"
              className="onboarding-disclosure-link"
              aria-expanded={open === 'advanced'}
              onClick={() => toggle('advanced')}
            >
              Advanced
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
