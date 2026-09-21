/**
 * The favorites glyph, drawn rather than typed.
 *
 * `♥`/`♡` are font-dependent: they change shape per platform, sit off the
 * baseline by different amounts, and on some systems render as a colour emoji
 * that ignores `color` entirely. Since this one mark now carries the whole
 * feature — header button, panel rows, match cards, the day strip — it has to
 * be the same shape everywhere and take its colour from CSS.
 */
export function Heart({
  filled = true,
  size = 16,
  className = '',
}: {
  filled?: boolean
  size?: number
  className?: string
}) {
  return (
    <svg
      className={`heart ${className}`.trim()}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 13.9 2.86 8.87A3.32 3.32 0 0 1 2.7 4.3a3.1 3.1 0 0 1 4.55-.07L8 5l.75-.77a3.1 3.1 0 0 1 4.55.07 3.32 3.32 0 0 1-.16 4.57L8 13.9Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={filled ? 0 : 1.35}
        strokeLinejoin="round"
      />
    </svg>
  )
}
