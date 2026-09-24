/**
 * The arithmetic behind dragging a card around the watch-later grid.
 *
 * Pure on purpose: the pointer plumbing in WatchLater.tsx is the part a test
 * can't hold, so everything that decides *where a card lands* lives here and
 * is checked in queue.smoke.ts.
 *
 * The model is slots, not cards. At drag start every card's rectangle is
 * measured once; those rectangles become fixed slots on the page. Dragging
 * only ever changes which slot each card is assigned to, and the card is
 * translated from its own rectangle to that slot's. Because slots are
 * measured, a card can slide to the end of the row above and the maths is the
 * same as a nudge one place left.
 */

export interface SlotRect {
  left: number
  top: number
  width: number
  height: number
}

/** Move one item, closing the gap behind it. Out-of-range indices are a no-op. */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Which slot a point is asking for: the one whose centre it is nearest.
 *
 * Nearest-centre rather than "the rectangle under the pointer" because the
 * grid has gaps and edges — over a gap, or dragged past the last card, a
 * containment test has no answer and the row would freeze mid-drag.
 *
 * The caller passes the dragged card's centre, not the pointer: a card held by
 * its edge would otherwise claim the neighbour after half a gap's travel.
 *
 * `hold` is hysteresis. The slot the card already has (`current`) keeps it
 * until another slot's centre is nearer by more than `hold` pixels, so a card
 * resting on the boundary between two slots doesn't flicker the row between
 * them with every pixel of hand tremor.
 */
export function dropIndex(
  rects: readonly SlotRect[],
  x: number,
  y: number,
  current: number,
  hold = 0,
): number {
  const distanceTo = (r: SlotRect) =>
    Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
  let best = current
  let bestDistance = Infinity
  for (let i = 0; i < rects.length; i++) {
    const distance = distanceTo(rects[i])
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  const held = rects[current]
  if (held && best !== current && distanceTo(held) - bestDistance <= hold) return current
  return best
}

/**
 * Where card `index` sits while a card is being dragged from `from` to `to`.
 *
 * Everything between the two positions shuffles one place towards the hole the
 * dragged card left behind; everything outside that span stays put.
 */
export function slotDuringDrag(from: number, to: number, index: number): number {
  if (index === from) return to
  if (from < to && index > from && index <= to) return index - 1
  if (to < from && index >= to && index < from) return index + 1
  return index
}

/** The translation that carries a card from its own rectangle onto `slot`. */
export function slotOffset(
  rects: readonly SlotRect[],
  index: number,
  slot: number,
): { x: number; y: number } {
  const from = rects[index]
  const to = rects[slot]
  if (!from || !to) return { x: 0, y: 0 }
  return { x: to.left - from.left, y: to.top - from.top }
}

/**
 * The queue on screen: what you can watch now, then what you can't yet, each
 * in your order.
 *
 * There is one order — newest save first, then whatever dragging made of it —
 * and availability only ever decides which section a match sits in, never its
 * rank. So a match whose highlights land rises into "ready" exactly where
 * your order puts it among the others, rather than jumping the lot of them,
 * and it is never shuffled by anything but you.
 */
export function splitQueue(
  order: readonly string[],
  isReady: (id: string) => boolean,
): { ready: string[]; waiting: string[] } {
  const ready: string[] = []
  const waiting: string[] = []
  for (const id of order) (isReady(id) ? ready : waiting).push(id)
  return { ready, waiting }
}

/**
 * Write one section's new order back into the whole queue.
 *
 * The section's matches keep the positions they held in the full order and
 * are dealt back into them in their new sequence, so a drag among the ready
 * matches never changes where any of them ranks against a waiting one.
 */
export function reorderSection(order: readonly string[], section: readonly string[]): string[] {
  const members = new Set(section)
  let next = 0
  return order.map((id) => (members.has(id) && next < section.length ? section[next++] : id))
}
