export interface DayCardMetrics {
  flagSize: number
  flagGap: number
}

export interface CarouselVisualState {
  fade: number
  scale: number
}

export function getCommittedDaySwipe({
  deltaX,
  deltaY,
}: {
  deltaX: number
  deltaY: number
}): -1 | 0 | 1 {
  const horizontal = Math.abs(deltaX)
  const vertical = Math.abs(deltaY)

  if (horizontal < 56) return 0
  if (horizontal < vertical * 1.35) return 0

  return deltaX < 0 ? 1 : -1
}

export function getDayCardMetrics(cardWidth: number): DayCardMetrics {
  if (cardWidth >= 440) return { flagSize: 84, flagGap: 30 }
  if (cardWidth >= 390) return { flagSize: 74, flagGap: 26 }
  if (cardWidth >= 340) return { flagSize: 62, flagGap: 22 }
  return { flagSize: 54, flagGap: 18 }
}

/**
 * How many columns a day of `count` matches should open, given how many fit.
 *
 * Two guards, both about the *last* row. Never open more columns than there
 * are matches, so a two-match day is two centred cards rather than two cards
 * hugging the left of a four-column grid. And never leave exactly one card
 * alone on the last row — a widow is the one ragged row that reads as a
 * mistake rather than a grid — so five across four becomes 3 + 2, not 4 + 1.
 * Anything else rags left the way a column grid should: ten across four is
 * 4 + 4 + 2.
 */
export function getDayColumns(count: number, fit: number): number {
  const most = Math.max(1, Math.min(count, fit))
  for (let cols = most; cols >= 2; cols--) {
    if (count % cols !== 1) return cols
  }
  return most
}

export function getCarouselVisualState(
  itemCenter: number,
  viewportCenter: number,
  itemWidth: number,
): CarouselVisualState {
  const distance = itemWidth > 0 ? Math.abs(itemCenter - viewportCenter) / itemWidth : Infinity
  const fade = Math.max(0.16, 1 - distance / 3.6)
  return {
    fade,
    scale: 0.72 + fade * 0.28,
  }
}

export function findNearestItemIndex(itemCenters: number[], viewportCenter: number): number {
  let bestIndex = 0
  let bestDistance = Infinity

  for (let i = 0; i < itemCenters.length; i++) {
    const distance = Math.abs(itemCenters[i] - viewportCenter)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }

  return bestIndex
}
