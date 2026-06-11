import type { Tournament } from './types'
import { wc2022 } from './wc2022'
import { wc2026 } from './wc2026'

export const tournaments: Record<string, Tournament> = {
  wc2026,
  wc2022,
}

export const defaultTournamentId = 'wc2026'

export * from './types'
