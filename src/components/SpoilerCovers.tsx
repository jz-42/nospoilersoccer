/**
 * Spoiler Covers: a compact panel for choosing what our covers over YouTube's
 * player hide, kept for the player lab. The app opens Spoiler Blur instead,
 * from the mark beside a match's highlights (SpoilerCoversButton) and from
 * the header menu.
 *
 * The panel leads with a preview: a drawing of the player with YouTube's
 * leaks on it (a score in the title, the full runtime, the progress bar, a
 * suggested clip) and our covers over them, so each switch shows what it
 * uncovers. Pointing at a row rings its part of the drawing. It is a drawing
 * rather than a video because YouTube hides its controls a few seconds into
 * playback, so a live embed would mostly show nothing changing, and any real
 * highlight is somebody's spoiler.
 */
import { useState, type ReactNode } from 'react'
import {
  DEFAULT_PLAYER_SETTINGS,
  resetPlayerSettings,
  setPlayerSetting,
  SKIP_CHOICES,
  usePlayerSettings,
  type PlayerSettings,
} from '../player-settings'
import { SkipIcon } from './PlayerControls'
import { openSpoilerBlur } from '../spoiler-blur'
import { BlurIcon } from './SpoilerBlur'

type ToggleKey = 'showElapsed' | 'showTotal' | 'showProgress' | 'showTitle' | 'showMoreVideos'
type Region = 'time' | 'bar' | 'title' | 'more' | 'skip'

const TOGGLES: { key: ToggleKey; label: string; region: Region }[] = [
  { key: 'showElapsed', label: 'Time elapsed', region: 'time' },
  { key: 'showTotal', label: 'Total length', region: 'time' },
  { key: 'showProgress', label: 'Progress bar', region: 'bar' },
  { key: 'showTitle', label: 'Video title', region: 'title' },
  { key: 'showMoreVideos', label: 'More videos', region: 'more' },
]

export function SpoilerCoversPanel({ heading }: { heading: ReactNode }) {
  const settings = usePlayerSettings()
  const [focus, setFocus] = useState<Region | null>(null)
  const isDefault = (Object.keys(DEFAULT_PLAYER_SETTINGS) as (keyof PlayerSettings)[]).every(
    (k) => settings[k] === DEFAULT_PLAYER_SETTINGS[k],
  )
  const point = (region: Region) => ({
    onPointerEnter: () => setFocus(region),
    onPointerLeave: () => setFocus(null),
    onFocus: () => setFocus(region),
    onBlur: () => setFocus(null),
  })

  return (
    <div className="sc-panel">
      <div className="sc-head">
        {heading}
        <button
          type="button"
          className="sc-reset"
          onClick={resetPlayerSettings}
          // Holds its place so the heading never shifts.
          style={isDefault ? { visibility: 'hidden' } : undefined}
        >
          Reset
        </button>
      </div>

      <CoversPreview settings={settings} focus={focus} />

      <p className="sc-caption">Show while watching</p>
      {TOGGLES.map((t) => (
        <label key={t.key} className="sc-row" {...point(t.region)}>
          <span className="sc-row-label">{t.label}</span>
          <input
            type="checkbox"
            role="switch"
            className="ps-switch"
            checked={settings[t.key]}
            onChange={(e) => setPlayerSetting(t.key, e.target.checked)}
          />
        </label>
      ))}
      <div className="sc-row sc-row-skip" {...point('skip')}>
        <span className="sc-row-label">Skip by</span>
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
      </div>
    </div>
  )
}

/**
 * The drawing: YouTube's chrome as it leaks, our covers over it. The rings
 * that answer a pointed-at row sit above the covers, so the glass can't blur
 * them.
 */
function CoversPreview({ settings, focus }: { settings: PlayerSettings; focus: Region | null }) {
  const ring = (region: Region) => (focus === region ? ' is-focus' : '')
  const off = (shown: boolean) => (shown ? ' is-off' : '')
  const { showElapsed, showTotal } = settings
  return (
    <div className="sc-preview" aria-hidden="true">
      <span className="sc-pitch" />

      {/* YouTube's own chrome, spoilers and all. */}
      <span className="sc-yt-title">Home 2–1 Away · Extended Highlights</span>
      <span className="sc-yt-time">3:12 / 14:08</span>
      <span className="sc-yt-bar">
        <span className="sc-yt-bar-played" />
        <span className="sc-yt-bar-head" />
      </span>
      <span className="sc-yt-more">
        <span className="sc-yt-more-thumb">
          2–0
          <span className={`sc-more-cover${off(settings.showMoreVideos)}`} />
          <span className={`sc-ring${ring('more')}`} />
        </span>
        More videos
      </span>

      {/* Ours, as the player draws them. */}
      <span className={`sc-title-shield${off(settings.showTitle)}`}>Extended Highlights</span>
      <span className={`sc-time${ring('time')}`}>
        <span className="sc-time-size">3:12 / 14:08</span>
        <span className="sc-time-text">
          {showElapsed && '3:12'}
          {showElapsed && showTotal && <span className="sc-time-sep">/</span>}
          {showTotal && <span className="sc-time-total">14:08</span>}
        </span>
      </span>
      <span className={`sc-bar-mute${off(settings.showProgress)}`} />
      <span className={`sc-bar-cover${off(settings.showProgress)}`} />
      <span className="sc-center">
        <span className={`yt-btn yt-skip${ring('skip')}`}>
          <SkipIcon seconds={settings.skipSeconds} forward={false} spin={0} />
        </span>
        <span className="yt-btn yt-play">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 4.5h3.2v15H7zM13.8 4.5H17v15h-3.2z" />
          </svg>
        </span>
        <span className={`yt-btn yt-skip${ring('skip')}`}>
          <SkipIcon seconds={settings.skipSeconds} forward spin={0} />
        </span>
      </span>
      <span className={`sc-ring sc-ring-title${ring('title')}`} />
      <span className={`sc-ring sc-ring-bar${ring('bar')}`} />
    </div>
  )
}

/** The feature's mark: a shield around a play glyph — a protected video. */
export function CoversIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M8 1.9 13 3.8v3.9c0 3-2.1 5.3-5 6.4-2.9-1.1-5-3.4-5-6.4V3.8z" />
      <path d="M6.9 5.9v3.8l3-1.9z" className="sc-icon-play" />
    </svg>
  )
}

/**
 * The mark beside a match's highlights (`inPlayer`: the disc inside the
 * player while a video plays). Either opens Spoiler Blur.
 */
export function SpoilerCoversButton({ inPlayer = false }: { inPlayer?: boolean }) {
  return (
    <button
      type="button"
      className={inPlayer ? 'player-blur is-disc' : 'sc-mark'}
      aria-label="Spoiler Blur"
      aria-haspopup="dialog"
      title="Blur"
      onClick={openSpoilerBlur}
    >
      <BlurIcon className={inPlayer ? undefined : 'sc-mark-blur'} />
    </button>
  )
}
