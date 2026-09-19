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
 * Split a day's cards into rows as evenly as the column cap allows, fuller
 * rows first: 7 across four columns is 4 + 3, 10 is 4 + 3 + 3 (never
 * 4 + 4 + 2). Returns each row's card count.
 */
export function getBalancedRows(count: number, maxCols: number): number[] {
  if (count <= 0) return []
  const rows = Math.ceil(count / Math.max(1, maxCols))
  const base = Math.floor(count / rows)
  const extra = count % rows
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0))
}

/**
 * The grid runs on half-card tracks (two per column), so a short row can sit
 * centred under a full one. Returns, per card, the 1-based half-track it
 * starts on when its row is short and it opens that row; null means "let
 * auto-placement follow on".
 */
export function getCenteredRowStarts(rows: number[]): (number | null)[] {
  const cols = rows[0] ?? 0
  return rows.flatMap((n) =>
    Array.from({ length: n }, (_, i) => (i === 0 && n < cols ? cols - n + 1 : null)),
  )
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
