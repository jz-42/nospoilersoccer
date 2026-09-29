import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Logo } from './Logo'

export type Disclosure = 'privacy' | 'advanced'

const DISCLOSURE_COPY: Record<Disclosure, readonly string[]> = {
  privacy: [
    'Your preferences are saved locally in your browser.',
    'This site uses anonymous Umami analytics for basic usage and error tracking, such as page views, match opens, highlight plays, result reveals, and video failures. Analytics may include general technical details like device type, browser language, screen size, referrer, and approximate country.',
    'No cookies, persistent IDs, user profiles, team picks, scores, or progress data are stored, profiled, or sold.',
  ],
  advanced: [
    'This is a static React website with no application backend. Your progress is stored in your browser.',
    'Results and highlights are updated automatically through GitHub Actions and delivered when the site refreshes.',
    'Video providers are loaded only after you choose a highlight.',
  ],
}

export function DisclosureContent({ disclosure }: { disclosure: Disclosure }) {
  return (
    <div className="onboarding-disclosure-content">
      {DISCLOSURE_COPY[disclosure].map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  )
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

/** The glyph at the top of a confirm: an eye for a reveal, a turn back for a reset. */
function DialogIcon({ kind }: { kind: 'reveal' | 'reset' }) {
  return (
    <span className={`dialog-icon dialog-icon-${kind}`} aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'reveal' ? (
          <>
            <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="3" />
          </>
        ) : (
          <>
            <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
            <path d="M4 4.5v3.8h3.8" />
          </>
        )}
      </svg>
    </span>
  )
}

/**
 * A yes-or-no question, drawn like an iOS 26 alert: a glyph, a title that
 * asks the question, one line of consequence, and two equal capsules with
 * the action on the right. Compact and centred on every screen, a phone
 * included: it's a question, not a sheet.
 */
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
    <div className="modal-backdrop dialog-backdrop" onClick={onCancel}>
      <div
        className={`modal dialog confirm ${danger ? 'is-danger' : ''}`.trim()}
        role="alertdialog"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-body"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogIcon kind={danger ? 'reset' : 'reveal'} />
        <h3 className="dialog-title" id="dialog-title">
          {title}
        </h3>
        <p className="dialog-body" id="dialog-body">
          {body}
        </p>
        <div className="dialog-actions">
          <button type="button" className="dialog-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`dialog-btn ${danger ? 'is-danger' : 'is-primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const WELCOME = [
  {
    title: 'Scores stay hidden',
    text: 'Every result is covered until you choose to see it.',
    icon: (
      <>
        <path d="M3 3l18 18" />
        <path d="M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7M6.5 6.9C3.9 8.6 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9.6 9.6 0 0 0 4.3-1" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      </>
    ),
  },
  {
    title: 'Watch, then reveal',
    text: 'Click a match to watch its highlights, then click to reveal the result.',
    icon: (
      <>
        <rect x="2.5" y="4.5" width="19" height="15" rx="4" />
        <path d="M10 9.2v5.6c0 .5.5.8.9.5l4.3-2.8c.4-.3.4-.8 0-1.1l-4.3-2.8c-.4-.2-.9.1-.9.6z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    title: 'Saved in this browser',
    text: 'Your progress stays on this device. No account.',
    icon: (
      <>
        <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      </>
    ),
  },
]

/**
 * The welcome, drawn like Apple's welcome sheets: the mascot as the hero,
 * the promise as the title, then three rows, each a glyph, a short bold line
 * and one sentence under it, and one full-width button. The small print sits
 * under the button, out of the way until it's asked for.
 */
export function Onboarding({ onClose }: { onClose: () => void }) {
  useEscape(onClose)
  const [open, setOpen] = useState<Disclosure | null>(null)
  const toggle = (next: Disclosure) =>
    setOpen((current) => (current === next ? null : next))

  return (
    <div className="modal-backdrop dialog-backdrop" onClick={onClose}>
      <div
        className="modal dialog onboarding"
        role="dialog"
        aria-labelledby="onboarding-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onboarding-badge">
          <Logo size={84} />
        </div>
        <h2 className="onboarding-title" id="onboarding-title">
          Catch up. No spoilers.
        </h2>
        <ul className="onboarding-list">
          {WELCOME.map((row) => (
            <li key={row.title}>
              <svg
                className="onboarding-glyph"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {row.icon}
              </svg>
              <div>
                <strong>{row.title}</strong>
                <span>{row.text}</span>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="dialog-btn is-primary onboarding-go" onClick={onClose}>
          Let's go
        </button>
        <div className="onboarding-links">
          <button
            type="button"
            className="onboarding-disclosure-link"
            aria-expanded={open === 'privacy'}
            onClick={() => toggle('privacy')}
          >
            Privacy
          </button>
          <span className="onboarding-links-dot" aria-hidden="true" />
          <button
            type="button"
            className="onboarding-disclosure-link"
            aria-expanded={open === 'advanced'}
            onClick={() => toggle('advanced')}
          >
            Advanced
          </button>
        </div>
        <div className="onboarding-disclosure-panel" aria-live="polite">
          {open && <DisclosureContent key={open} disclosure={open} />}
        </div>
      </div>
    </div>
  )
}
