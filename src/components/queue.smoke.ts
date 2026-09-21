import { dropIndex, reorder, slotDuringDrag, slotOffset, type SlotRect } from './queue'

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

console.log('ALL PASS')
