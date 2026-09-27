/**
 * Spoiler Blur: the blur settings as a sheet over a blurred page, led by a
 * large preview of the player.
 *
 * The preview is the real thing, not a drawing. Under it lies YouTube's own
 * chrome, captured from a live embed with demo spoilers written in (a score
 * in the title, the chapter name, the runtime, the progress bar, a suggested
 * clip; `.context/blurlab/capture.mjs` regenerates it). Over that run the
 * player's real title shield and PlayerControls, driven by a paused stand-in
 * player, so every cover, switched on or off, looks exactly as it will over
 * a match.
 *
 * Switches read as "blur this": on means hidden, the way people think about
 * a spoiler, and the eye in each knob is struck through while it is. Rows
 * are grouped (Timeline, On screen) and ordered by how often people change
 * them. The preview is live: its bar drags, with one playhead.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  DEFAULT_PLAYER_SETTINGS,
  resetPlayerSettings,
  setPlayerSetting,
  SKIP_CHOICES,
  usePlayerSettings,
  type PlayerSettings,
} from '../player-settings'
import { PlayerControls, type ControlledPlayer } from './PlayerControls'
import { PlayerTitlebar } from './PlayerTitlebar'

type ShowKey = 'showElapsed' | 'showTotal' | 'showProgress' | 'showTitle' | 'showChapters' | 'showMoreVideos'
type Region = 'time' | 'bar' | 'title' | 'chapters' | 'more'

const GROUPS: { name: string; rows: { key: ShowKey; label: string; region: Region }[] }[] = [
  {
    name: 'Timeline',
    rows: [
      { key: 'showProgress', label: 'Progress bar', region: 'bar' },
      { key: 'showTotal', label: 'Total length', region: 'time' },
      { key: 'showElapsed', label: 'Time elapsed', region: 'time' },
    ],
  },
  {
    name: 'On screen',
    rows: [
      { key: 'showTitle', label: 'Video title', region: 'title' },
      { key: 'showChapters', label: 'Chapters', region: 'chapters' },
      { key: 'showMoreVideos', label: 'More videos', region: 'more' },
    ],
  },
]

/** The two sizes YouTube lays its chrome out at, and our captures of each. */
const WIDE = { w: 640, h: 360, src: new URL('../assets/yt-chrome-640x360.webp', import.meta.url).href }
const COMPACT = { w: 354, h: 199, src: new URL('../assets/yt-chrome-354x199.webp', import.meta.url).href }

/** 5:22 of 23:21, what the capture's own time display reads. */
const DEMO_AT = 322
const DEMO_LENGTH = 1401

/**
 * A paused player for the preview. Paused is when YouTube's chrome stays up,
 * so the covers stay up with it. Skips move the playhead; play is a no-op.
 */
class DemoPlayer implements ControlledPlayer {
  private at = DEMO_AT
  private readonly frame = document.createElement('iframe')
  getCurrentTime = () => this.at
  getDuration = () => DEMO_LENGTH
  getPlayerState = () => 2
  getVideoLoadedFraction = () => 0.4
  playVideo = () => {}
  pauseVideo = () => {}
  seekTo = (s: number) => {
    this.at = s
  }
  getIframe = () => this.frame
}

function BlurPreview({ settings, focus }: { settings: PlayerSettings; focus: Region | null }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<{ size: typeof WIDE; scale: number } | null>(null)
  const [player] = useState(() => new DemoPlayer())

  // Laid out at YouTube's own size, then scaled to fit: its chrome doesn't
  // scale, it switches layout at 396px. Phones get the compact one they see.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => {
      const size = window.innerWidth < 560 ? COMPACT : WIDE
      setFit({ size, scale: box.clientWidth / size.w })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  const size = fit?.size ?? WIDE
  const ring = (r: Region) => `bp-ring bp-ring-${r}${focus === r ? ' is-focus' : ''}`
  return (
    <div
      ref={boxRef}
      className={`bp-box${size === COMPACT ? ' is-compact' : ''}`}
      style={{ aspectRatio: `${size.w} / ${size.h}` }}
    >
      {fit && (
        <div
          className="player-wrap bp-wrap"
          style={{ width: size.w, height: size.h, transform: `scale(${fit.scale})` }}
        >
          <span className="bp-pitch" aria-hidden="true" />
          <img className="bp-chrome" src={size.src} alt="" draggable={false} />
          <PlayerControls player={player} stateChangedAt={0} settings={settings} onToggleExpanded={() => {}} />
          <PlayerTitlebar label="Extended Highlights" />
          <span className={ring('title')} aria-hidden="true" />
          <span className={ring('time')} aria-hidden="true" />
          <span className={ring('chapters')} aria-hidden="true" />
          <span className={ring('bar')} aria-hidden="true" />
          <span className={ring('more')} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

/** The in-player mark: Google's own blur glyph, a field of dots fading out. */
export function BlurIcon({ className }: { className?: string }) {
  const dots: [number, number, number][] = []
  for (const x of [5, 12, 19])
    for (const y of [5, 12, 19]) {
      const edge = (x !== 12 ? 1 : 0) + (y !== 12 ? 1 : 0)
      dots.push([x, y, [2.6, 1.8, 1.15][edge]])
    }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {dots.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} />
      ))}
    </svg>
  )
}

export function SpoilerBlurSheet({ onClose }: { onClose: () => void }) {
  const settings = usePlayerSettings()
  const [focus, setFocus] = useState<Region | null>(null)
  const [leaving, setLeaving] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const isDefault = (Object.keys(DEFAULT_PLAYER_SETTINGS) as (keyof PlayerSettings)[]).every(
    (k) => settings[k] === DEFAULT_PLAYER_SETTINGS[k],
  )
  const point = (region: Region) => ({
    onPointerEnter: () => setFocus(region),
    onPointerLeave: () => setFocus(null),
    onFocus: () => setFocus(region),
    onBlur: () => setFocus(null),
  })

  const close = () => setLeaving(true)
  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(onClose, 200)
    return () => clearTimeout(id)
  }, [leaving, onClose])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    sheetRef.current?.focus()
    // Capture, and stop it there: Escape closes this, not the match sheet
    // underneath, which listens on the window too.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setLeaving(true)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      opener?.focus?.()
    }
  }, [])

  const skipSegment = (
    <div className="ps-segment" role="radiogroup" aria-label="Skip by">
      {SKIP_CHOICES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={settings.skipSeconds === s}
          className={settings.skipSeconds === s ? 'is-active' : ''}
          onClick={() => setPlayerSetting('skipSeconds', s)}
        >
          {s}s
        </button>
      ))}
    </div>
  )

  // Touches and clicks inside must not reach the match sheet (drag to dismiss).
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

  return (
    <div
      className={`bs-backdrop${leaving ? ' is-leaving' : ''}`}
      onClick={(e) => {
        stop(e)
        close()
      }}
      onTouchStart={stop}
      onTouchMove={stop}
      onTouchEnd={stop}
    >
      <div
        ref={sheetRef}
        className="bs-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        onClick={stop}
        onKeyDown={stop}
      >
        <header className="bs-head">
          <h2 id={headingId} className="bs-title">
            Spoiler Blur
          </h2>
          <button type="button" className="queue-close" aria-label="Done" onClick={close}>
            <svg className="modal-close-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>

        <BlurPreview settings={settings} focus={focus} />

        <div className="bs-list">
          {GROUPS.map((g) => (
            <div key={g.name} className="bs-card" role="group" aria-label={g.name}>
              {g.rows.map((r) => (
                <label key={r.key} className="bs-row" {...point(r.region)}>
                  <span className="bs-row-label">{r.label}</span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="ps-switch"
                    aria-label={`Blur ${r.label.toLowerCase()}`}
                    checked={!settings[r.key]}
                    onChange={(e) => {
                      setPlayerSetting(r.key, !e.target.checked)
                      // Phones have no hover: the ring follows the last change.
                      setFocus(r.region)
                    }}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>

        <footer className="bs-foot">
          {!isDefault && (
            <button type="button" className="bs-restore" aria-label="Restore defaults" onClick={resetPlayerSettings}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5" />
                <path d="M4.6 2.2v2.5h2.5" />
              </svg>
              <span className="bs-restore-long">Restore defaults</span>
              <span className="bs-restore-short">Reset</span>
            </button>
          )}
          <div className="bs-skip">
            <span className="bs-skip-label">Skip by</span>
            {skipSegment}
          </div>
        </footer>
      </div>
    </div>
  )
}
