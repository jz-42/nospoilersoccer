import type { KnockoutMatch, Tie, Tournament } from '../data/types'

export interface BracketTie {
  tie: Tie
  legs: [KnockoutMatch, KnockoutMatch]
}

export interface NationsBracketView {
  quarterFinals: (BracketTie | null)[]
  semiFinals: (KnockoutMatch | null)[]
  final: KnockoutMatch | null
  thirdPlace: KnockoutMatch | null
  pathsKnown: boolean
}

export function nationsBracketView(t: Tournament): NationsBracketView {
  const round = (id: string) => t.knockoutRounds.find((candidate) => candidate.id === id)
  const qfMatches = round('qf')?.matches ?? []
  const qfById = new Map(qfMatches.map((match) => [match.id, match]))
  const ties: BracketTie[] = (t.ties ?? []).flatMap((tie) => {
    const first = qfById.get(tie.legs[0])
    const second = qfById.get(tie.legs[1])
    return first && second ? [{ tie, legs: [first, second] }] : []
  })
  ties.sort((a, b) =>
    (a.legs[0].kickoff ?? a.legs[0].date).localeCompare(b.legs[0].kickoff ?? b.legs[0].date) ||
    a.tie.id.localeCompare(b.tie.id),
  )

  const final = round('final')?.matches[0] ?? null
  const thirdPlace = round('third-place')?.matches[0] ?? null
  let semis = [...(round('sf')?.matches ?? [])]
  if (final?.home.type === 'match-winner' && final.away.type === 'match-winner') {
    const byId = new Map(semis.map((match) => [match.id, match]))
    const ordered = [byId.get(final.home.match), byId.get(final.away.match)]
    if (ordered.every((match) => match !== undefined)) semis = ordered as KnockoutMatch[]
  } else {
    semis.sort((a, b) => (a.kickoff ?? a.date).localeCompare(b.kickoff ?? b.date) || a.id.localeCompare(b.id))
  }

  const tieById = new Map(ties.map((entry) => [entry.tie.id, entry]))
  const feederIds = semis.flatMap((match) => [match.home, match.away].map((slot) =>
    slot.type === 'match-winner' ? slot.match : null,
  ))
  const pathsKnown = semis.length === 2 && ties.length === 4 && feederIds.length === 4 &&
    feederIds.every((id) => id !== null && tieById.has(id)) && new Set(feederIds).size === 4
  const orderedTies = pathsKnown
    ? feederIds.map((id) => tieById.get(id!)!)
    : ties

  return {
    quarterFinals: Array.from({ length: 4 }, (_, index) => orderedTies[index] ?? null),
    semiFinals: Array.from({ length: 2 }, (_, index) => semis[index] ?? null),
    final,
    thirdPlace,
    pathsKnown,
  }
}
