/**
 * After "Reveal all", the scores that just appeared come up across the page
 * one after another, in reading order, instead of all switching on in the
 * same frame: a quick ripple that shows you what changed. Only the ones on
 * screen move, and the whole ripple is over in well under a second however
 * many there are. Nothing moves under reduced motion.
 */
const SCORES = '.preview-score, .preview-badge.badge-seen, .ko-score'

export function rippleScores(update: () => void) {
  const before = new Set(document.querySelectorAll(SCORES))
  update()
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  // After React has put the new scores in, before they are painted.
  requestAnimationFrame(() => {
    const fresh = [...document.querySelectorAll<HTMLElement>(SCORES)]
      .filter((el) => !before.has(el))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)
      // Rows first, then left to right, with a little give for rows that
      // don't line up to the pixel.
      .sort((a, b) => Math.round((a.r.top - b.r.top) / 24) || a.r.left - b.r.left)
    const step = Math.min(70, 560 / Math.max(fresh.length, 1))
    fresh.forEach(({ el }, i) => {
      el.animate(
        [
          { opacity: 0, transform: 'scale(0.82)', filter: 'blur(6px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0)' },
        ],
        { duration: 420, delay: 120 + i * step, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
      )
    })
  })
}
