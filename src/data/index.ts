import type { Tournament } from './types'
import { wc2022 } from './wc2022'

export const tournaments: Record<string, Tournament> = {
  wc2022,
}

export const defaultTournamentId = 'wc2022'

export * from './types'
