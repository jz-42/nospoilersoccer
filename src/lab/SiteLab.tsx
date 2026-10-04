import { useEffect, useState } from 'react'
import App from '../App.tsx'
import { LOOK_FEATURES, applyLook, readLook, type Look } from './new-look'

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
  const pick = (id: string, value: string) =>
    setLook((prev) => {
      const next: Look = { ...prev }
      if (value) next[id] = value
      else delete next[id]
      return next
    })
  const onCount = LOOK_FEATURES.filter((f) => look[f.id]).length
  const allOn = () => setLook(Object.fromEntries(LOOK_FEATURES.map((f) => [f.id, f.options?.[0].id ?? 'on'])))

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
            New look {onCount}/{LOOK_FEATURES.length} {lookOpen ? '▾' : '▸'}
          </button>
          {lookOpen && (
            <span className="nl-all">
              <button type="button" onClick={allOn}>
                All
              </button>
              <button type="button" onClick={() => setLook({})}>
                None
              </button>
            </span>
          )}
        </div>
        {lookOpen && (
          <div className="nl-list">
            {LOOK_FEATURES.map((f, i) => {
              const value = look[f.id] ?? ''
              const option = f.options?.find((o) => o.id === value)
              return (
                <div key={f.id}>
                  {f.group !== LOOK_FEATURES[i - 1]?.group && <div className="nl-group">{f.group}</div>}
                  {f.options ? (
                    <div className="nl-row">
                      <span>
                        <b>{f.label}</b>
                        <small>{option?.note ?? f.note}</small>
                      </span>
                      <span className="nl-seg">
                        {[{ id: '', label: 'Off' }, ...f.options].map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            className={o.id === value ? 'on' : ''}
                            onClick={() => pick(f.id, o.id)}
                          >
                            {o.label}
                          </button>
                        ))}
                      </span>
                    </div>
                  ) : (
                    <label className="nl-row nl-check">
                      <input type="checkbox" checked={!!value} onChange={() => pick(f.id, value ? '' : 'on')} />
                      <span>
                        <b>{f.label}</b>
                        <small>{f.note}</small>
                      </span>
                    </label>
                  )}
                </div>
              )
            })}
          </div>
        )}
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
