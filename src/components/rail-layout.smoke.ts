import { readFileSync } from 'node:fs'
import {
  findNearestItemIndex,
  getCarouselVisualState,
  getCommittedDaySwipe,
  getDayCardMetrics,
} from './railLayout'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

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
    railSource.includes('const getSwipeSourceIndex = () => swipeTargetIndexRef.current ?? idx') &&
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
  railSource.includes('onClick={() => scrollToIndex(idx - 1, true)}') &&
    railSource.includes('onClick={() => scrollToIndex(idx + 1, true)}') &&
    railSource.includes('onClick={() => scrollToIndex(anchorIndex, true)}'),
  'existing carousel buttons keep using the original smooth scroll path',
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

console.log('rail-layout smoke: ok')
