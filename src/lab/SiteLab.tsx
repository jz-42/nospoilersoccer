import { useEffect, useState } from 'react'
import App from '../App.tsx'
import { LOOK_FEATURES, applyLook, readLook, type LookId } from './new-look'

const initial = new URLSearchParams(window.location.search)

function Seg<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={`seg-btn${value === o.id ? ' active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SiteLab({ sources }: { sources: number }) {
  const [phone, setPhone] = useState(initial.get('view') === 'phone')
  const [look, setLook] = useState(readLook)
  const [lookOpen, setLookOpen] = useState(true)
  useEffect(() => {
    applyLook(look)
    // Tell the phone iframe too; it reads the same storage on reload.
    document.querySelector<HTMLIFrameElement>('.sl-phone iframe')?.contentWindow?.postMessage('nl-look', '*')
  }, [look])
  const toggle = (id: LookId) =>
    setLook((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // The extra sources are added as the page loads, so a new count is a reload.
  const setSources = (n: number) => {
    const url = new URL(window.location.href)
    url.searchParams.set('sources', String(n))
    url.searchParams.set('view', phone ? 'phone' : 'desktop')
    window.location.href = url.toString()
  }

  return (
    <>
      {phone ? (
        <div className="sl-phone">
          <iframe title="Phone view" src={`${window.location.pathname}?frame=1&sources=${sources}`} />
        </div>
      ) : (
        <App />
      )}
      <div className={`nl-panel${lookOpen ? '' : ' closed'}`}>
        <div className="nl-head">
          <button type="button" className="nl-title" onClick={() => setLookOpen((o) => !o)}>
            New look {look.size}/{LOOK_FEATURES.length} {lookOpen ? '▾' : '▸'}
          </button>
          {lookOpen && (
            <span className="nl-all">
              <button type="button" onClick={() => setLook(new Set(LOOK_FEATURES.map((f) => f.id)))}>
                All
              </button>
              <button type="button" onClick={() => setLook(new Set())}>
                None
              </button>
            </span>
          )}
        </div>
        {lookOpen &&
          LOOK_FEATURES.map((f) => (
            <label key={f.id} className="nl-row">
              <input type="checkbox" checked={look.has(f.id)} onChange={() => toggle(f.id)} />
              <span>
                <b>{f.label}</b>
                <small>{f.note}</small>
              </span>
            </label>
          ))}
      </div>
      <div className="sl-bar">
        <Seg
          label="Sources per match"
          options={[1, 2, 3, 4].map((n) => ({ id: n, label: n === 1 ? 'Real' : String(n) }))}
          value={sources}
          onChange={setSources}
        />
        <Seg
          label="View"
          options={[
            { id: 'desktop', label: 'Desktop' },
            { id: 'phone', label: 'Phone' },
          ]}
          value={phone ? 'phone' : 'desktop'}
          onChange={(v) => setPhone(v === 'phone')}
        />
      </div>
    </>
  )
}
