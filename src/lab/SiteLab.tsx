import { useState } from 'react'
import App from '../App.tsx'

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
