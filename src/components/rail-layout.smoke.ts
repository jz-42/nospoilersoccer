import {
  findNearestItemIndex,
  getCarouselVisualState,
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

console.log('rail-layout smoke: ok')
