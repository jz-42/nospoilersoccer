import { useState } from 'react'
import type { HighlightVideo } from '../data/types'
import { HighlightPlayer } from '../components/HighlightPlayer'
import { PlayerSettingsPanel } from '../components/PlayerSettingsPanel'

const CLIPS: { label: string; matchId: string; video: HighlightVideo }[] = [
  {
    label: 'Czechia v South Africa · extended (has chapters)',
    matchId: 'A3',
    video: { youtubeId: 'jijCaWH_IxM', kind: 'extended', durationSeconds: 934 },
  },
  {
    label: 'Quick highlights · 8:44',
    matchId: 'A1',
    video: { youtubeId: 'pBk8BjA-X4Y', kind: 'normal', durationSeconds: 524 },
  },
  {
    label: 'Extended · 12:44',
    matchId: 'B2',
    video: { youtubeId: 'IR891e2-JBc', kind: 'extended', durationSeconds: 764 },
  },
]

const WIDTHS = [
  { label: 'Phone', px: 360 },
  { label: 'Modal', px: 640 },
  { label: 'Wide', px: 960 },
]

export function PlayerLab() {
  const [clip, setClip] = useState(0)
  const [width, setWidth] = useState(640)
  const [custom, setCustom] = useState(true)
  const c = CLIPS[clip]

  return (
    <main className="lab">
      <header className="lab-head">
        <h1>Player lab</h1>
        <p>
          Our controls over YouTube's player. YouTube keeps its volume, captions and quality buttons (top right);
          its title is always covered, and its time, chapter name, progress bar and "More videos" thumbnail
          while YouTube shows them. The settings below can uncover any of these but the chapter name.
          Keys: ← → skip, space plays/pauses once you've clicked the video. Double-click for full screen.
        </p>
      </header>

      <div className="lab-bar">
        <div className="ps-segment" role="radiogroup" aria-label="Video">
          {CLIPS.map((x, i) => (
            <button key={x.video.kind + i} type="button" role="radio" aria-checked={clip === i} className={clip === i ? 'is-active' : ''} onClick={() => setClip(i)}>
              {x.label}
            </button>
          ))}
        </div>
        <div className="ps-segment" role="radiogroup" aria-label="Player width">
          {WIDTHS.map((w) => (
            <button key={w.px} type="button" role="radio" aria-checked={width === w.px} className={width === w.px ? 'is-active' : ''} onClick={() => setWidth(w.px)}>
              {w.label} · {w.px}
            </button>
          ))}
        </div>
        <div className="ps-segment" role="radiogroup" aria-label="Controls">
          <button type="button" role="radio" aria-checked={custom} className={custom ? 'is-active' : ''} onClick={() => setCustom(true)}>
            Our controls
          </button>
          <button type="button" role="radio" aria-checked={!custom} className={!custom ? 'is-active' : ''} onClick={() => setCustom(false)}>
            Today's player
          </button>
        </div>
      </div>

      <div className="lab-body">
        <div className="lab-player" style={{ width }}>
          <HighlightPlayer
            key={`${clip}-${custom}`}
            videos={[c.video]}
            tournamentYear={2026}
            tournamentPhase="group"
            marked={false}
            onReveal={() => {}}
            matchId={c.matchId}
            homeName="Home"
            awayName="Away"
            customControls={custom}
          />
        </div>
        <PlayerSettingsPanel />
      </div>
    </main>
  )
}
