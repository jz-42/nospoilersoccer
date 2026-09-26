import assert from 'node:assert/strict'
import test from 'node:test'
import type { GroupMatch } from '../data/types'
import { matchLiveStatus } from './status'

const match: GroupMatch = {
  id: 'unl-401861062',
  group: 'A1',
  matchday: 1,
  date: '2026-09-26',
  kickoff: '2026-09-26T18:45Z',
  home: 'ALB',
  away: 'BLR',
  liveStatus: { kind: 'live' },
}
const view = { marks: {}, revealed: new Set<string>() }

test('live badge expires when a group match snapshot remains live past 150 minutes', () => {
  const target = { kind: 'group' as const, match }
  assert.deepEqual(matchLiveStatus(target, view, new Date('2026-09-26T21:14Z')), { kind: 'live' })
  assert.equal(matchLiveStatus(target, view, new Date('2026-09-26T21:20Z')), undefined)
})

test('a delayed match is not mistaken for a long-running live match', () => {
  const target = { kind: 'group' as const, match: { ...match, liveStatus: { kind: 'delayed' as const } } }
  assert.deepEqual(matchLiveStatus(target, view, new Date('2026-09-26T21:20Z')), { kind: 'delayed' })
})
