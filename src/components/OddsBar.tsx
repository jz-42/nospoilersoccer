/**
 * Pre-match odds, shown as one labeled probability bar instead of three loose
 * chips. The track is split into home / draw / away segments sized by their
 * snapshotted market probability; the likeliest outcome is emphasised. The
 * Polymarket deep-link rides along as the source credit. Snapshotted pre-match
 * (never live), so it's safe to show right up until the result is revealed.
 */
import type { MatchOdds } from '../data/types'

export function OddsBar({
  odds,
  homeCode,
  awayCode,
  showLink = true,
}: {
  odds: MatchOdds
  homeCode: string
  awayCode: string
  /**
   * Show the clickable Polymarket source link. Hidden once the real match has
   * finished: by then the market has resolved, so the link would leak the
   * result to anyone who clicks it before watching. The snapshot numbers stay
   * (they're spoiler-free) — only the deep-link goes.
   */
  showLink?: boolean
}) {
  const pct = (n: number) => Math.round(n * 100)
  const hasDraw = odds.draw !== undefined
  const fav: 'home' | 'draw' | 'away' =
    odds.home >= odds.away && odds.home >= (odds.draw ?? 0)
      ? 'home'
      : odds.away >= (odds.draw ?? 0)
        ? 'away'
        : 'draw'

  return (
    <div className="oddsbar">
      <div className="oddsbar-head">
        <span className="oddsbar-label">Pre-match odds</span>
        {showLink && (
          <a className="oddsbar-src" href={odds.url} target="_blank" rel="noreferrer">
            Polymarket ↗
          </a>
        )}
      </div>
      <div className="oddsbar-track" role="img" aria-label="Pre-match win probability">
        <span
          className={`oddsbar-seg oddsbar-home ${fav === 'home' ? 'is-fav' : ''}`}
          style={{ flexGrow: odds.home }}
        />
        {hasDraw && (
          <span
            className={`oddsbar-seg oddsbar-draw ${fav === 'draw' ? 'is-fav' : ''}`}
            style={{ flexGrow: odds.draw }}
          />
        )}
        <span
          className={`oddsbar-seg oddsbar-away ${fav === 'away' ? 'is-fav' : ''}`}
          style={{ flexGrow: odds.away }}
        />
      </div>
      <div className="oddsbar-keys">
        <span className={`oddsbar-key ${fav === 'home' ? 'is-fav' : ''}`}>
          <b>{homeCode}</b> {pct(odds.home)}%
        </span>
        {hasDraw && (
          <span className={`oddsbar-key oddsbar-key-mid ${fav === 'draw' ? 'is-fav' : ''}`}>
            Draw {pct(odds.draw!)}%
          </span>
        )}
        <span className={`oddsbar-key oddsbar-key-end ${fav === 'away' ? 'is-fav' : ''}`}>
          {pct(odds.away)}% <b>{awayCode}</b>
        </span>
      </div>
    </div>
  )
}
