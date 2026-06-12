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
          <Logo size={36} />
        </div>
        <h3 className="dialog-title">Catch up without spoilers</h3>
        <p className="dialog-body">
          Scores stay hidden until you reveal them. Open any match to watch the
          highlights first — the bracket fills in as you go.
        </p>
        <button type="button" className="btn-primary" onClick={onClose}>
          Got it
        </button>
        <p className="dialog-footnote">Progress saves in this browser. No account.</p>
      </div>
    </div>
  )
}
