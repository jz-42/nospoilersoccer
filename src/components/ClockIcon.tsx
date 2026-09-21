/**
 * The watch-later mark: the header button, the toggle on a match, and the
 * small badge on any card you've queued all draw this one glyph, so the thing
 * you tap and the thing you see afterwards are recognisably the same.
 *
 * `size` defaults to 1em so a badge can be sized by its CSS font-size, the way
 * the text glyph it replaced was.
 */
export function ClockIcon({ size = '1em', filled = false }: { size?: number | string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" focusable="false">
      <circle
        cx="8"
        cy="8"
        r="6.15"
        fill={filled ? 'currentColor' : 'none'}
        fillOpacity={filled ? 0.18 : undefined}
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M8 4.5v3.7l2.5 1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
