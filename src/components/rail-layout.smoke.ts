import { readFileSync } from 'node:fs'
import {
  findNearestItemIndex,
  getCarouselVisualState,
  getCommittedDaySwipe,
  getDayCardMetrics,
  getDayLayout,
  getDayRows,
} from './railLayout'
import { pickFlickStop, rubberBand, settleOmega, SPRING_OMEGA, stepSpring } from './stripPhysics'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/*
 * The agreed shape of every day, pinned. `avail` is 1424 — what `.app-main`
 * hands the grid on any screen from a 1512 laptop up, since it caps at
 * 1480px wide. A day has 1-10 or 18 matches in practice (see
 * .context/counts.ts, which checks every league in six timezones); 11-17 are
 * here so the rule stays total.
 */
const WIDE = 1424
const SHAPES: [count: number, rows: number[], width: number][] = [
  [1, [1], 470],
  [2, [2], 424],
  [3, [3], 378],
  [4, [2, 2], 424],
  [5, [3, 2], 378],
  [6, [3, 3], 378],
  [7, [4, 3], 344],
  [8, [4, 4], 344],
  [9, [4, 4, 1], 344],
  [10, [4, 4, 2], 344],
  [11, [4, 4, 3], 344],
  [12, [4, 4, 4], 344],
  [13, [5, 5, 3], 272],
  [18, [5, 5, 5, 3], 272],
]
for (const [count, rows, width] of SHAPES) {
  const layout = getDayLayout(count, WIDE, 16)
  const actual = getDayRows(count, layout.cols)
  assert(
    actual.join('+') === rows.join('+'),
    `expected ${count} matches to lay out ${rows.join('+')}, got ${actual.join('+')}`,
  )
  assert(
    layout.width === width,
    `expected ${count} matches at ${width}px cards, got ${layout.width}px`,
  )
}

// Every row fits the width it claims, with its gaps.
for (const [count] of SHAPES) {
  const { cols, width } = getDayLayout(count, WIDE, 16)
  const rowWidth = cols * width + (cols - 1) * 16
  assert(rowWidth <= WIDE, `a row of ${count}'s layout overflows: ${rowWidth} > ${WIDE}`)
}

/*
 * Narrow screens keep the same table, just fewer columns. A card never goes
 * under CARD_MIN (230) until the viewport itself is narrower than that.
 */
const phone = getDayLayout(10, 358, 10)
assert(phone.cols === 1, `expected a phone to stack the day, got ${phone.cols} columns`)
assert(phone.width === 358, `expected a phone card to fill the width, got ${phone.width}px`)

const tablet = getDayLayout(10, 712, 16)
assert(tablet.cols === 2, `expected a tablet to open two columns, got ${tablet.cols}`)
assert(tablet.width === 348, `expected a tablet card of 348px, got ${tablet.width}px`)

const laptop = getDayLayout(10, 1224, 16)
assert(laptop.cols === 4, `expected a 1280 laptop to keep four columns, got ${laptop.cols}`)
assert(laptop.width === 294, `expected a 1280 laptop card of 294px, got ${laptop.width}px`)

// A day never opens more columns than it has matches.
assert(getDayLayout(2, WIDE, 16).cols === 2, 'two matches never open a third column')
assert(getDayLayout(1, WIDE, 16).cols === 1, 'a lone match stays a lone hero card')

// Degenerate inputs stay sane rather than producing NaN widths.
assert(getDayLayout(0, WIDE, 16).width > 0, 'an empty day still resolves a positive width')
assert(getDayLayout(9, 0, 16).width > 0, 'an unmeasured grid still resolves a positive width')

const hero = getDayCardMetrics(470)
assert(hero.flagSize === 84, `expected hero flag size 84, got ${hero.flagSize}`)
assert(hero.flagGap === 30, `expected hero flag gap 30, got ${hero.flagGap}`)

const duo = getDayCardMetrics(400)
assert(duo.flagSize === 74, `expected duo flag size 74, got ${duo.flagSize}`)
assert(duo.flagGap === 26, `expected duo flag gap 26, got ${duo.flagGap}`)

const dense = getDayCardMetrics(320)
assert(dense.flagSize === 54, `expected dense flag size 54, got ${dense.flagSize}`)
assert(dense.flagGap === 18, `expected dense flag gap 18, got ${dense.flagGap}`)

const centered = getCarouselVisualState(200, 200, 100)
assert(centered.fade === 1, `expected centered fade 1, got ${centered.fade}`)
assert(centered.scale === 1, `expected centered scale 1, got ${centered.scale}`)

const offset = getCarouselVisualState(260, 200, 100)
assert(
  offset.fade.toFixed(3) === '0.833',
  `expected offset fade 0.833, got ${offset.fade.toFixed(3)}`,
)
assert(
  offset.scale.toFixed(3) === '0.953',
  `expected offset scale 0.953, got ${offset.scale.toFixed(3)}`,
)

assert(
  findNearestItemIndex([100, 260, 420], 395) === 2,
  'expected the third day to be nearest to the viewport centre',
)
assert(
  findNearestItemIndex([], 200) === 0,
  'expected empty inputs to fall back to the first day index',
)

assert(
  getCommittedDaySwipe({ deltaX: -88, deltaY: 16 }) === 1,
  'clear left swipe advances to the next day',
)
assert(
  getCommittedDaySwipe({ deltaX: 92, deltaY: 14 }) === -1,
  'clear right swipe moves to the previous day',
)
assert(
  getCommittedDaySwipe({ deltaX: 28, deltaY: 74 }) === 0,
  'mostly vertical motion does not commit a day swipe',
)
assert(
  getCommittedDaySwipe({ deltaX: -34, deltaY: 6 }) === 0,
  'small horizontal motion under threshold does not commit a day swipe',
)

const railSource = readFileSync(new URL('./Rail.tsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
assert(
  railSource.includes('swipeToIndex(swipeSourceIndex + direction)'),
  'committed mobile day swipes route through the swipe-specific day navigation',
)
assert(
  railSource.includes('const swipeTargetIndexRef = useRef<number | null>(null)') &&
    // Falls back to the day committed right now (activeRef), not the last render's idx.
    /const getSwipeSourceIndex = \(\) =>\s*swipeTargetIndexRef\.current \?\? Math\.min\(Math\.max\(activeRef\.current, 0\), dates\.length - 1\)/.test(railSource) &&
    /const swipeToIndex = \(i: number\) => \{[\s\S]*?const swipeSourceIndex = getSwipeSourceIndex\(\)[\s\S]*?if \(clamped === swipeSourceIndex\) return false[\s\S]*?swipeTargetIndexRef\.current = clamped[\s\S]*?scrollToIndex\(clamped, true\)[\s\S]*?return true/.test(
      railSource,
    ) &&
    /const onDocumentTouchEnd = \(e: TouchEvent\) => \{[\s\S]*?const swipeSourceIndex = getSwipeSourceIndex\(\)[\s\S]*?if \(!canSwipeToDirection\(direction, swipeSourceIndex\)\) return[\s\S]*?if \(!swipeToIndex\(swipeSourceIndex \+ direction\)\) return/.test(
      railSource,
    ),
  'mobile day swipes chain from the latest intended day rather than stale active state',
)
assert(
  railSource.includes('const scrollSettleTimeoutRef = useRef<number | null>(null)') &&
    /const scrollToIndex = \(i: number, smooth: boolean\) => \{[\s\S]*?w\.scrollTo\(\{ left: target, behavior: smooth \? 'smooth' : 'auto' \}\)[\s\S]*?if \(smooth\) scheduleScrollSettleSync\(\)/.test(
      railSource,
    ),
  'smooth carousel navigation schedules a final active-day sync after browser scroll settling',
)
assert(
  railSource.includes('<span className="day-track-spacer" aria-hidden="true" />') &&
    /\.day-track\s*\{[\s\S]*?--day-window-w:\s*min\(calc\(100vw - 108px\), 604px\);[\s\S]*?\}/.test(appCss) &&
    /\.day-track-spacer\s*\{[\s\S]*?flex:\s*0 0 max\(0px, calc\(\(var\(--day-window-w\) - var\(--day-item-w\)\) \/ 2\)\);/.test(
      appCss,
    ) &&
    !/\.day-track\s*\{[\s\S]*?padding-inline:\s*max\(0px, calc\(50% - \(var\(--day-item-w\) \/ 2\)\)\);/.test(
      appCss,
    ),
  'day carousel uses real edge spacer items so the first and final days can center like every other day',
)
assert(
  /const onDocumentTouchMove = \(e: TouchEvent\) => \{[\s\S]*?const direction = getCommittedDaySwipe\(\{ deltaX, deltaY \}\)[\s\S]*?if \(direction !== 0 && e\.cancelable\)[\s\S]*?e\.preventDefault\(\)/.test(
    railSource,
  ),
  'touch move consumes any committed horizontal day swipe, including inert edge swipes',
)
assert(
  railSource.includes("document.addEventListener('touchstart', onDocumentTouchStart") &&
    railSource.includes("document.addEventListener('touchmove', onDocumentTouchMove") &&
    railSource.includes("document.addEventListener('touchend', onDocumentTouchEnd") &&
    railSource.includes("'.app-header, .day-carousel-window, .day-arrow, .day-jump-btn, .modal-backdrop, .dialog, .app-footer'") &&
    !railSource.includes('onTouchStart={onSectionTouchStart}'),
  'mobile Today day swipes start from the document below the header while preserving carousel and modal gestures',
)
assert(
  railSource.includes('onClick={() => goToIndex(getSwipeSourceIndex() - 1)}') &&
    railSource.includes('onClick={() => goToIndex(getSwipeSourceIndex() + 1)}') &&
    railSource.includes('onClick={() => goToIndex(anchorIndex)}') &&
    /const goToIndex = [\s\S]*?if \(dayNavFeel\.glide === 'crisp'\) crispScrollTo\(clamped\)\s*else \{[\s\S]*?engineStop\(\)\s*cancelGlide\(\)[\s\S]*?cancelMomentum\(\)[\s\S]*?scrollToIndex\(clamped, true\)\s*\}\s*\}/.test(railSource),
  'carousel buttons step through goToIndex, which keeps the original smooth scroll path unless a crisp or spring glide is on, and first stops any coast still running so the step is not lost',
)
assert(
  /if \(direction === 0\) return[\s\S]*?if \(!canSwipeToDirection\(direction, swipeSourceIndex\)\) return[\s\S]*?if \(!swipeToIndex\(swipeSourceIndex \+ direction\)\) return[\s\S]*?suppressClickUntilRef\.current = performance\.now\(\) \+ 320/.test(
    railSource,
  ),
  'edge swipes stay true no-ops and do not suppress the next tap',
)
assert(
  railSource.includes(".day-carousel-window, .day-arrow, .day-jump-btn"),
  'carousel-window touches stay excluded from the section-level swipe recognizer',
)
assert(
  /\.day-carousel-window\s*\{[\s\S]*?touch-action:\s*pan-x;/.test(appCss),
  'carousel window keeps its original horizontal touch pan behavior',
)
assert(
  /@media \(max-width: 760px\)\s*\{[\s\S]*?\.day-rail\s*\{[\s\S]*?min-height:\s*calc\(100dvh - 120px\);/.test(
    appCss,
  ),
  'mobile Today swipe surface extends through the main area below the app header',
)

// ---- strip physics ----
{
  // Settles on the day without passing it, from rest or from a flick.
  for (const v0 of [0, 1.5, 6]) {
    const omega = settleOmega(0, v0, 190)
    let st = { x: 0, v: v0 }
    let maxX = 0
    for (let t = 0; t < 1200; t += 16) {
      st = stepSpring(st, 190, omega, 16)
      maxX = Math.max(maxX, st.x)
    }
    assert(maxX <= 190.01, `spring launched at ${v0}px/ms never overshoots the day (peak ${maxX.toFixed(2)})`)
    assert(Math.abs(st.x - 190) < 0.5 && Math.abs(st.v) < 0.01, `spring launched at ${v0}px/ms comes to rest on the day`)
  }
  // One 64ms step lands where four 16ms steps do (closed form, not Euler).
  const long = stepSpring({ x: 0, v: 0 }, 190, SPRING_OMEGA, 64)
  let short = { x: 0, v: 0 }
  for (let i = 0; i < 4; i++) short = stepSpring(short, 190, SPRING_OMEGA, 16)
  assert(Math.abs(long.x - short.x) < 1e-9, 'a long frame lands exactly where the curve says')

  const stops = [0, 190, 380, 570, 760]
  assert(pickFlickStop(stops, 190, 0) === 1, 'no flick settles on the nearest day')
  assert(pickFlickStop(stops, 200, 0.2) === 1, 'a gentle flick stays on the day you slowed onto')
  assert(pickFlickStop(stops, 190, 2) === 3, 'a flick lands where the original momentum coasted (v × 200ms)')
  assert(pickFlickStop(stops, 760, 3) === 4, 'a flick at the end stays on the last day')

  assert(rubberBand(0, 300) === 0, 'no overshoot, no rubber band')
  assert(rubberBand(1000, 300) < 300 && rubberBand(-1000, 300) > -300, 'the rubber band never gives more than its dimension')
  assert(rubberBand(50, 300) < 50 && rubberBand(50, 300) > 0, 'the rubber band gives less than you pull')

}

console.log('rail-layout smoke: ok')
