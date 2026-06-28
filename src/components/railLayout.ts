export interface DayCardMetrics {
  flagSize: number
  flagGap: number
}

export interface CarouselVisualState {
  fade: number
  scale: number
}

export function getDayCardMetrics(cardWidth: number): DayCardMetrics {
  if (cardWidth >= 440) return { flagSize: 84, flagGap: 30 }
  if (cardWidth >= 390) return { flagSize: 74, flagGap: 26 }
  if (cardWidth >= 340) return { flagSize: 62, flagGap: 22 }
  return { flagSize: 54, flagGap: 18 }
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
