import type { TeamId } from '../data/types'
import type { Marks } from '../logic/spoilers'

export interface TournamentProgress {
  marks: Marks
  revealed: string[]
  pins: string[]
  favorites: TeamId[]
  favAuto: boolean
}

export function emptyTournamentProgress(): TournamentProgress {
  return { marks: {}, revealed: [], pins: [], favorites: [], favAuto: true }
}

export function resetTournamentProgressForViewing(tp: TournamentProgress): TournamentProgress {
  return {
    ...emptyTournamentProgress(),
    pins: tp.pins,
    favorites: tp.favorites,
    favAuto: tp.favAuto,
  }
}
