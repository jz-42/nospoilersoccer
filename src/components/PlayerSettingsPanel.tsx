import {
  DEFAULT_PLAYER_SETTINGS,
  resetPlayerSettings,
  setPlayerSetting,
  SKIP_CHOICES,
  usePlayerSettings,
  type PlayerSettings,
} from '../player-settings'

const TOGGLES: { key: 'showElapsed' | 'showTotal' | 'showProgress' | 'showTitle' | 'showMoreVideos'; label: string; hint: string }[] = [
  { key: 'showElapsed', label: 'Time elapsed', hint: 'How far into the video you are.' },
  { key: 'showTotal', label: 'Total length', hint: 'A long cut can hint at extra time or a flurry of goals.' },
  { key: 'showProgress', label: 'Progress bar', hint: 'How full it is reveals the length, even with the total hidden.' },
  { key: 'showTitle', label: 'Video title', hint: "YouTube's own title, which can name the score or the scorers." },
  { key: 'showMoreVideos', label: 'More videos', hint: "YouTube's suggested clip, whose thumbnail can show another match's score." },
]

/** The "Video player" section of Settings. */
export function PlayerSettingsPanel() {
  const settings = usePlayerSettings()
  const isDefault = (Object.keys(DEFAULT_PLAYER_SETTINGS) as (keyof PlayerSettings)[]).every(
    (k) => settings[k] === DEFAULT_PLAYER_SETTINGS[k],
  )

  return (
    <section className="ps-panel" aria-labelledby="ps-title">
      <header className="ps-head">
        <h2 id="ps-title">Video player</h2>
        <button type="button" className="ps-reset" onClick={resetPlayerSettings} disabled={isDefault}>
          Reset to defaults
        </button>
      </header>

      <div className="ps-group">
        <p className="ps-group-title">Show while watching</p>
        {TOGGLES.map((t) => (
          <label key={t.key} className="ps-row">
            <span className="ps-row-text">
              <span className="ps-row-label">{t.label}</span>
              <span className="ps-row-hint">{t.hint}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="ps-switch"
              checked={settings[t.key]}
              onChange={(e) => setPlayerSetting(t.key, e.target.checked)}
            />
          </label>
        ))}
      </div>

      <div className="ps-group">
        <p className="ps-group-title">Skip buttons &amp; arrow keys</p>
        <div className="ps-row">
          <span className="ps-row-text">
            <span className="ps-row-label">Skip by</span>
            <span className="ps-row-hint">The ⟲ ⟳ buttons and ← → keys.</span>
          </span>
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
    </section>
  )
}
