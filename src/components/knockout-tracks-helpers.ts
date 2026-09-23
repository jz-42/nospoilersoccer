import type { KnockoutRound, Tournament } from '../data/types'

export function roundsForTrack(t: Tournament, trackId: string): KnockoutRound[] {
  const track = t.knockoutTracks?.find((candidate) => candidate.id === trackId)
  if (!track) return []
  const ids = new Set(track.roundIds)
  return t.knockoutRounds.filter((round) => ids.has(round.id))
}
