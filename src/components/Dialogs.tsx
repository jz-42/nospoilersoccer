import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Logo } from './Logo'

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
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal dialog onboarding" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-logo">
          <Logo size={44} />
        </div>
        <h3 className="dialog-title">Catch up. No spoilers.</h3>
        <ul className="onboarding-list">
          <li>Every score stays hidden until you reveal it.</li>
          <li>Tap a match to watch its highlights, then reveal the result — winners move on through the bracket.</li>
          <li>Progress saves in this browser. No account.</li>
        </ul>
        <button type="button" className="btn-primary" onClick={onClose}>
          Let's go
        </button>
      </div>
    </div>
  )
}
