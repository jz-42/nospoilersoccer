import type { Marks } from '../logic/spoilers'

export interface TournamentProgress {
  marks: Marks
  revealed: string[]
  pins: string[]
}

export function emptyTournamentProgress(): TournamentProgress {
  return { marks: {}, revealed: [], pins: [] }
}

export function resetTournamentProgressForViewing(tp: TournamentProgress): TournamentProgress {
  return {
    ...emptyTournamentProgress(),
    pins: tp.pins,
  }
}
