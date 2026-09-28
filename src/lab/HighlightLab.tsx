import { useState } from 'react'
import type { GroupMatch, HighlightVideo } from '../data/types'
import { unl2026 } from '../data/nations/unl-2026'
import type { Progress } from '../state/progress'
import { MatchModal } from '../components/MatchModal'

const fox: HighlightVideo = { youtubeId: '4fsGpbnpU9Q', kind: 'extended', durationSeconds: 886 }
const tudn: HighlightVideo = {
  youtubeId: 'AjiN46Zmdlc',
  kind: 'normal',
  durationSeconds: 902,
  publisher: 'tudn',
}
const espnFc: HighlightVideo = { youtubeId: 'espnfc00abc', kind: 'normal', publisher: 'espn-fc' }
const deportes: HighlightVideo = { youtubeId: 'deportesabc', kind: 'normal', publisher: 'espn-deportes' }

const BY_COUNT: HighlightVideo[][] = [
  [fox],
  [fox, tudn],
  [fox, tudn, espnFc],
  [fox, tudn, espnFc, deportes],
]

const noop = () => {}

const progress: Progress = {
  marks: {},
  revealed: new Set(),
  pins: new Set(),
  pinOrder: [],
  allPinOrder: [],
  favorites: [],
  favAuto: true,
  spotlight: false,
  setMark: noop,
  unmark: noop,
  reveal: noop,
  togglePin: noop,
  setPinOrder: noop,
  reorderAllPins: noop,
  removePins: noop,
  forTournament: () => progress,
  toggleFavorite: noop,
  setFavorites: noop,
  setFavAuto: noop,
  setSpotlight: noop,
  catchUp: noop,
  reset: noop,
}

const belgiumFrance = unl2026.groupMatches.find((match) => match.id === 'unl-401861081')
if (!belgiumFrance) throw new Error('Belgium v France is missing from the Nations League')
const belgiumFranceMatch: GroupMatch = belgiumFrance

const initial = new URLSearchParams(window.location.search)
/** The phone view is this same page in an iframe, so the sheet's own breakpoints apply. */
const framed = initial.has('frame')

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

export function HighlightLab() {
  const [count, setCount] = useState(() => {
    const n = Number(initial.get('sources'))
    return n >= 1 && n <= 4 ? n : 2
  })
  const [phone, setPhone] = useState(initial.get('view') === 'phone')
  const videos = BY_COUNT[count - 1] ?? BY_COUNT[1]
  const match: GroupMatch = { ...belgiumFranceMatch, videos }

  const modal = (
    <MatchModal
      key={count}
      t={unl2026}
      target={{ kind: 'group', match }}
      progress={progress}
      onClose={noop}
    />
  )
  if (framed) return modal

  return (
    <>
      <div className="hl-bar">
        <Seg
          label="How many sources"
          options={BY_COUNT.map((_, i) => ({ id: i + 1, label: String(i + 1) }))}
          value={count}
          onChange={setCount}
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
      {phone ? (
        <div className="hl-phone">
          <iframe
            key={count}
            title="Phone view"
            src={`${window.location.pathname}?frame=1&sources=${count}`}
          />
        </div>
      ) : (
        modal
      )}
    </>
  )
}
