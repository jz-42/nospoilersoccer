import { useEffect, useRef, useState } from 'react'
import type { Tournament } from '../data/types'
import type { Progress } from '../state/progress'

/** Heart in the header → panel for favorite teams: pick, order, auto-highlight. */
export function FavoritesPanel({ t, progress }: { t: Tournament; progress: Progress }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const favorites = progress.favorites.map((id) => t.teams[id]).filter(Boolean)
  const rest = Object.values(t.teams)
    .filter((team) => !progress.favorites.includes(team.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="fav-root" ref={rootRef}>
      <button
        type="button"
        className={`fav-btn ${favorites.length > 0 ? 'has-favs' : ''}`}
        aria-label="Favorite teams"
        title="Favorite teams"
        onClick={() => setOpen((o) => !o)}
      >
        {favorites.length > 0 ? '♥' : '♡'}
      </button>

      {open && (
        <div className="fav-panel">
          <div className="fav-panel-title">Favorite teams</div>

          {favorites.length > 0 ? (
            <>
              <ul className="fav-list">
                {favorites.map((team, i) => (
                  <li key={team.id} className="fav-item">
                    <span className="flag">{team.flag}</span>
                    <span className="fav-name">{team.name}</span>
                    <span className="fav-actions">
                      <button
                        type="button"
                        className="fav-move"
                        disabled={i === 0}
                        aria-label="Move up"
                        onClick={() => progress.moveFavorite(team.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="fav-move"
                        disabled={i === favorites.length - 1}
                        aria-label="Move down"
                        onClick={() => progress.moveFavorite(team.id, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="fav-remove"
                        aria-label={`Remove ${team.name}`}
                        onClick={() => progress.toggleFavorite(team.id)}
                      >
                        ♥
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <label className="fav-toggle">
                <input
                  type="checkbox"
                  checked={progress.favAuto}
                  onChange={(e) => progress.setFavAuto(e.target.checked)}
                />
                Highlight their matches
              </label>
            </>
          ) : (
            <p className="fav-empty">Tap a heart to follow a team — their games get a soft glow.</p>
          )}

          <div className="fav-divider" />
          <div className="fav-grid">
            {rest.map((team) => (
              <button
                key={team.id}
                type="button"
                className="fav-add"
                onClick={() => progress.toggleFavorite(team.id)}
              >
                <span className="fav-add-heart">♡</span>
                <span className="flag">{team.flag}</span> {team.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
