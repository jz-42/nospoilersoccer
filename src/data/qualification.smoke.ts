import { positionOutcome } from './qualification'
import type { GroupMatch, Team, Tournament } from './types'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const teams: Record<string, Team> = {}
const groups: Tournament['groups'] = []
const groupMatches: GroupMatch[] = []

for (let groupNumber = 1; groupNumber <= 4; groupNumber++) {
  const group = `A${groupNumber}`
  const ids = ['a', 'b', 'c', 'd'].map((letter) => `${group}${letter}`)
  ids.forEach((id, teamIndex) => { teams[id] = { id, name: id, accessRank: (groupNumber - 1) * 4 + teamIndex + 1 } })
  groups.push({ id: group, sectionId: 'A', teams: ids })
  const pairings: Array<[number, number]> = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
  pairings.forEach(([home, away], index) => {
    groupMatches.push({
      id: `${group}-${index + 1}`,
      group,
      matchday: index + 1,
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      home: ids[home],
      away: ids[away],
      score: { home: 1, away: 0 },
    })
  })
}

for (const section of ['B', 'C']) {
  const id = `${section}1`
  const ids = [1, 2, 3, 4].map((rank) => `${id}-${rank}`)
  ids.forEach((teamId, index) => { teams[teamId] = { id: teamId, name: teamId, accessRank: 20 + index } })
  groups.push({ id, sectionId: section, teams: ids })
}
teams['D1-1'] = { id: 'D1-1', name: 'D1-1', accessRank: 50 }
teams['D1-2'] = { id: 'D1-2', name: 'D1-2', accessRank: 51 }
teams['D1-3'] = { id: 'D1-3', name: 'D1-3', accessRank: 52 }
groups.push({ id: 'D1', sectionId: 'D', teams: ['D1-1', 'D1-2', 'D1-3'] })

const tournament: Tournament = {
  id: 'qualification-test', name: 'Qualification test', year: 2026, advancingRanks: [],
  teams, groups, groupMatches, knockoutRounds: [],
  groupSections: [
    { id: 'A', label: 'League A', groupIds: ['A1', 'A2', 'A3', 'A4'] },
    { id: 'B', label: 'League B', groupIds: ['B1'] },
    { id: 'C', label: 'League C', groupIds: ['C1'] },
    { id: 'D', label: 'League D', groupIds: ['D1'] },
  ],
  qualificationSections: [
    { sectionId: 'A', rules: [
      { groupRank: 1, outcome: { kind: 'qualify', label: 'Quarter-finals' } },
      { groupRank: 2, outcome: { kind: 'qualify', label: 'Quarter-finals' } },
      { groupRank: 3, outcome: { kind: 'stay', label: 'Stay in League A' }, crossGroup: {
        top: 2,
        topOutcome: { kind: 'stay', label: 'Stay in League A' },
        bottomOutcome: { kind: 'playoff', label: 'A/B play-off' },
      } },
      { groupRank: 4, outcome: { kind: 'relegate', label: 'Relegated to League B' }, crossGroup: {
        top: 2,
        topOutcome: { kind: 'playoff', label: 'A/B play-off' },
        bottomOutcome: { kind: 'relegate', label: 'Relegated to League B' },
      } },
    ] },
    { sectionId: 'B', rules: [
      { groupRank: 1, outcome: { kind: 'promote', label: 'Promoted to League A' } },
      { groupRank: 2, outcome: { kind: 'playoff', label: 'A/B play-off' } },
      { groupRank: 3, outcome: { kind: 'stay', label: 'Stay in League B' } },
      { groupRank: 4, outcome: { kind: 'playoff', label: 'B/C play-off' } },
    ] },
    { sectionId: 'C', rules: [
      { groupRank: 1, outcome: { kind: 'promote', label: 'Promoted to League B' } },
      { groupRank: 2, outcome: { kind: 'playoff', label: 'B/C play-off' } },
      { groupRank: 3, outcome: { kind: 'stay', label: 'Stay in League C' } },
      { groupRank: 4, outcome: { kind: 'stay', label: 'Stay in League C' } },
    ] },
    { sectionId: 'D', rules: [1, 2, 3].map((groupRank) => ({
      groupRank,
      outcome: { kind: 'promote' as const, label: 'Promoted to League C' },
    })) },
  ],
}

const allRevealed = () => true
const onlyA1Revealed = (matchId: string) => matchId.startsWith('A1-')
const outcome = (group: string, rank: number, include = allRevealed) =>
  positionOutcome(tournament, group, rank, include)?.label

assert(outcome('A1', 1) === 'Quarter-finals', 'A winner reaches QF')
assert(outcome('A1', 3) === 'Stay in League A', 'top A third stays')
assert(outcome('A4', 3) === 'A/B play-off', 'bottom A third enters play-off')
assert(outcome('A1', 4) === 'A/B play-off', 'top A fourth enters play-off')
assert(outcome('A4', 4) === 'Relegated to League B', 'bottom A fourth drops')
assert(outcome('B1', 1) === 'Promoted to League A', 'B winner promotes')
assert(outcome('C1', 2) === 'B/C play-off', 'C runner-up enters play-off')
assert(outcome('D1', 3) === 'Promoted to League C', 'every D team promotes')
assert(positionOutcome(tournament, 'A1', 3, onlyA1Revealed) === null, 'cross-group outcome waits for all four groups')
assert(positionOutcome(tournament, 'missing', 1, allRevealed) === null, 'unknown groups fail closed')

console.log('QUALIFICATION TESTS PASS')
