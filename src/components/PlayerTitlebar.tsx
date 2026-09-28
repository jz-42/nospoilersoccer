/**
 * The frosted shield over YouTube's title line (see HighlightPlayer's header).
 * Shared with the Spoiler Blur preview, which draws the real thing.
 */
export function PlayerTitlebar({ label }: { label: string }) {
  return (
    <div className="player-titlebar">
      <span className="player-titlebar-glass" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="player-titlebar-label">{label}</span>
    </div>
  )
}
