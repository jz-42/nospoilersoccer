import { twoLeggedFixture } from '../logic/ties-fixture'
import {
  dropIndex,
  reorder,
  slotDuringDrag,
  slotOffset,
  splitQueue,
  type SlotRect,
} from './queue'
import { reorderSavedMatches } from '../state/progress'
import { showsPlayButton } from './status'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const list = ['a', 'b', 'c', 'd', 'e']

assert(reorder(list, 0, 2).join('') === 'bcade', 'moving forward closes the gap behind the card')
assert(reorder(list, 3, 1).join('') === 'adbce', 'moving back pushes the cards after it along')
assert(reorder(list, 2, 2).join('') === 'abcde', 'dropping a card on itself changes nothing')
assert(reorder(list, 0, 4).join('') === 'bcdea', 'a card can travel to the end')
assert(reorder(list, 1, 9).join('') === 'abcde', 'an out-of-range target is ignored')
assert(list.join('') === 'abcde', 'reorder does not mutate its input')

// Two rows of three, 300×220 cards with a 20px gap.
const grid: SlotRect[] = [0, 1, 2, 3, 4, 5].map((i) => ({
  left: (i % 3) * 320,
  top: Math.floor(i / 3) * 240,
  width: 300,
  height: 220,
}))

assert(dropIndex(grid, 150, 110, 0) === 0, 'the pointer over a card picks that card')
assert(dropIndex(grid, 790, 110, 0) === 2, 'the pointer over the last card of a row picks it')
assert(dropIndex(grid, 150, 350, 0) === 3, 'the pointer in the second row picks from that row')
assert(
  dropIndex(grid, 310, 110, 0) === 0,
  'in the gap, the card whose centre is nearest wins (still the left one)',
)
assert(
  dropIndex(grid, 330, 110, 0) === 1,
  'crossing the middle of the gap hands the slot to the next card',
)
assert(dropIndex(grid, 4000, 4000, 0) === 5, 'dragged off the end, the last slot wins')
assert(dropIndex([], 10, 10, 2) === 2, 'an empty grid keeps the card where it was')
assert(
  dropIndex(grid, 330, 110, 0, 45) === 0,
  'just past the midpoint, hysteresis keeps the slot the card already has',
)
assert(
  dropIndex(grid, 400, 110, 0, 45) === 1,
  'well past the midpoint, the next slot takes over despite the hysteresis',
)
assert(
  dropIndex(grid, 290, 110, 1, 45) === 1,
  'coming back, the new slot holds until the card is clearly back over the old one',
)
assert(dropIndex(grid, 4000, 4000, 0, 45) === 5, 'hysteresis never stops a long drag reaching the end')

assert(slotDuringDrag(1, 4, 1) === 4, 'the dragged card takes the slot it was dropped on')
assert(slotDuringDrag(1, 4, 2) === 1, 'cards passed on the way forward shift back one')
assert(slotDuringDrag(1, 4, 4) === 3, 'the card at the destination shifts back one too')
assert(slotDuringDrag(1, 4, 0) === 0, 'cards before the span stay put')
assert(slotDuringDrag(1, 4, 5) === 5, 'cards after the span stay put')
assert(slotDuringDrag(4, 1, 1) === 2, 'dragging back pushes the destination card along')
assert(slotDuringDrag(4, 1, 3) === 4, 'the card before the origin fills the hole')
assert(slotDuringDrag(4, 1, 5) === 5, 'cards past the origin stay put')
assert(slotDuringDrag(2, 2, 2) === 2, 'a drag that goes nowhere moves nothing')

const wrap = slotOffset(grid, 3, 2)
assert(
  wrap.x === 640 && wrap.y === -240,
  'a card moving to the row above is carried by one measured slot, not one column',
)
assert(slotOffset(grid, 1, 1).x === 0 && slotOffset(grid, 1, 1).y === 0, 'a card in its own slot does not move')
assert(slotOffset(grid, 0, 99).x === 0, 'a missing slot is a no-op rather than NaN')

const order = ['a', 'x', 'b', 'y', 'c']
const readyNow = new Set(['a', 'b', 'c'])
const split = splitQueue(order, (id) => readyNow.has(id))
assert(split.ready.join() === 'a,b,c', 'ready matches keep your order')
assert(split.waiting.join() === 'x,y', 'waiting matches keep your order')

const risen = splitQueue(order, (id) => readyNow.has(id) || id === 'x')
assert(
  risen.ready.join() === 'a,x,b,c',
  'a match that becomes ready joins the ready ones at its own rank, not the front',
)
const risenLate = splitQueue(order, (id) => readyNow.has(id) || id === 'y')
assert(risenLate.ready.join() === 'a,b,y,c', 'and never jumps ahead of a ready match you ranked above it')

// A drag saves through reorderSavedMatches, which deals a subset back in place.
const dragged = reorderSavedMatches(order, ['c', 'a', 'b'])
assert(dragged.join() === 'c,x,a,y,b', 'a drag deals the section back into the slots it already held')
assert(
  splitQueue(dragged, (id) => readyNow.has(id) || id === 'x').ready.join() === 'c,x,a,b',
  'a waiting match that becomes ready later lands where it ranked against the dragged ones',
)
assert(reorderSavedMatches(order, ['y', 'x']).join() === 'a,y,b,x,c', 'the waiting section reorders the same way')
assert(reorderSavedMatches(order, []).join() === order.join(), 'an empty section changes nothing')
assert(order.join() === 'a,x,b,y,c', 'reordering does not mutate its input')

const video = { kind: 'normal' as const, youtubeId: 'abcdefghijk' }
const none = new Set<string>()
const withVideo = twoLeggedFixture()
withVideo.groupMatches[0].videos = [video]
assert(
  showsPlayButton(withVideo, 'g1', { marks: {}, revealed: none }),
  'a finished match with highlights shows a play button',
)
assert(
  !showsPlayButton(withVideo, 'g2', { marks: {}, revealed: none }),
  'a finished match without highlights does not',
)
assert(
  !showsPlayButton(withVideo, 'g1', { marks: { g1: 'watched' }, revealed: none }),
  'a match you have already revealed does not show a play button',
)
assert(!showsPlayButton(withVideo, 'missing', { marks: {}, revealed: none }), 'an unknown match does not')

const upcoming = twoLeggedFixture()
upcoming.groupMatches[0].score = undefined
upcoming.groupMatches[0].videos = [video]
assert(
  !showsPlayButton(upcoming, 'g1', { marks: {}, revealed: none }),
  'a match that has not been played does not show a play button',
)

const live = twoLeggedFixture()
live.groupMatches[0].score = undefined
live.groupMatches[0].videos = [video]
live.groupMatches[0].liveStatus = { kind: 'live' }
assert(!showsPlayButton(live, 'g1', { marks: {}, revealed: none }), 'a live match does not show a play button')

const locked = twoLeggedFixture()
locked.knockoutRounds[1].matches[0].videos = [video]
assert(
  !showsPlayButton(locked, 'f', { marks: {}, revealed: none }),
  'a locked knockout does not show a play button',
)
assert(
  showsPlayButton(locked, 'f', { marks: {}, revealed: new Set(['f']) }),
  'jumping ahead to a knockout that has highlights shows its play button',
)

console.log('ALL PASS')
