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
 * How wide a card is, given how many share its row. A card's size is a
 * function of the row it sits in and nothing else, so "four matches" is two
 * rows of the two-match card rather than a smaller card in its own size —
 * every layout is rows of an existing shape.
 */
export const COLUMN_WIDTH: Record<number, number> = {
  1: 470, // a lone match — the biggest "hero" card
  2: 424,
  3: 378,
  4: 348,
  5: 272, // only for the overflow days; see getDayColumns
}

export const MAX_COLUMNS = 5
/** Narrowest a card may get before we drop a column on a small screen. */
export const CARD_MIN = 230

/**
 * How many cards per row a day of `count` matches wants.
 *
 * This is a table, not a formula, because the choice is a judgement about how
 * a given number of cards should sit on a page and the numbers are few: a day
 * has 1–10 or 18 matches — every other count is unreachable from any league's
 * fixture list in any timezone, which the counts script in .context checks.
 *
 * The shape of it: stay as wide and as few rows as the cards allow, stepping
 * the card down a size only when the count forces another row. Four is two
 * rows of two rather than one row of four, because a 424px card reads better
 * than a 348px one and two rows of two is a square. Five and six are rows of
 * three. Seven through twelve are rows of four. Past twelve the day is simply
 * too big to show at a readable size, so it goes to rows of five and accepts
 * that you will scroll.
 */
export function getDayColumns(count: number): number {
  if (count <= 3) return Math.max(1, count)
  if (count === 4) return 2
  if (count <= 6) return 3
  if (count <= 12) return 4
  return 5
}

export interface DayLayout {
  /** Cards per row. */
  cols: number
  /** Pixel width of every card. */
  width: number
}

/**
 * Resolve the day's layout against the space actually on screen.
 *
 * The table in `getDayColumns` is what the day *wants*; a phone or a tablet
 * can't give it, so columns come down until the cards clear `CARD_MIN`, and
 * the card takes whichever is smaller — its row's size, or the share of the
 * width it actually has. That is the whole responsive story: same table
 * everywhere, narrowed to fit.
 */
export function getDayLayout(count: number, avail: number, gap: number): DayLayout {
  if (count <= 0) return { cols: 1, width: COLUMN_WIDTH[1] }
  const fits = Math.max(1, Math.floor((avail + gap) / (CARD_MIN + gap)))
  const cols = Math.min(getDayColumns(count), fits, count, MAX_COLUMNS)
  const share = Math.floor((avail - (cols - 1) * gap) / cols)
  return { cols, width: Math.max(1, Math.min(COLUMN_WIDTH[cols], share)) }
}

/**
 * The cards on each row, top to bottom — what the layout actually looks like.
 * Only used by tests and the layout harness; the browser gets this shape from
 * flex-wrap against a row width pinned to exactly `cols` cards.
 */
export function getDayRows(count: number, cols: number): number[] {
  const rows: number[] = []
  for (let left = count; left > 0; left -= cols) rows.push(Math.min(cols, left))
  return rows
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
