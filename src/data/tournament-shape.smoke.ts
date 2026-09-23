import { wc2026 } from './wc2026'
import type { Tournament } from './types'

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const shaped: Tournament = {
  id: 'shape',
  name: 'Shape',
  year: 2026,
  advancingRanks: [],
  teams: {},
  groups: [],
  groupMatches: [],
  knockoutRounds: [],
  groupSections: [{ id: 'A', label: 'League A', groupIds: ['A1'] }],
  qualificationSections: [
    {
      sectionId: 'A',
      rules: [{ groupRank: 1, outcome: { kind: 'qualify', label: 'Quarter-finals' } }],
    },
  ],
  knockoutTracks: [
    {
      id: 'championship',
      label: 'Championship',
      roundIds: ['qf', 'sf', 'third-place', 'final'],
      pendingStages: [
        {
          id: 'qf-draw',
          label: 'Quarter-finals',
          window: '25–30 Mar 2027',
          pools: [{ label: 'Group winners' }, { label: 'Group runners-up' }],
        },
      ],
    },
  ],
}

assert(shaped.groupSections?.[0].groupIds[0] === 'A1', 'group sections are typed')
assert(shaped.knockoutTracks?.[0].pendingStages?.[0].pools.length === 2, 'pending stages are typed')
assert(wc2026.groupSections === undefined, 'existing tournaments need no new fields')

console.log('TOURNAMENT SHAPE TESTS PASS')
