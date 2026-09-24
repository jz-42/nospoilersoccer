import { existsSync } from 'node:fs'
import { nationalTeams, nationsLeagueTeamIds } from './national-teams'
import { wc2022 } from './wc2022'
import { wc2026 } from './wc2026'

function assert(value: unknown, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const values = Object.values(nationalTeams)
assert(new Set(values.map((team) => team.id)).size === values.length, 'national ids are unique')
assert(
  new Set(values.flatMap((team) => team.espnId ? [team.espnId] : [])).size === values.filter((team) => team.espnId).length,
  'national ESPN ids are unique',
)
assert(nationsLeagueTeamIds.length === 54, 'Nations League has all 54 associations')
assert(new Set(nationsLeagueTeamIds).size === 54, 'Nations League association ids are unique')

for (const id of nationsLeagueTeamIds) {
  assert(Boolean(nationalTeams[id]?.espnId), `${id} has an ESPN id`)
  assert(existsSync(new URL(`../assets/flags/${id}.svg`, import.meta.url)), `${id} has a flag asset`)
}

for (const tournament of [wc2022, wc2026]) {
  for (const id of Object.keys(tournament.teams)) {
    assert(tournament.teams[id] === nationalTeams[id], `${tournament.id} reuses ${id}`)
  }
}

console.log('NATIONAL TEAM REGISTRY TESTS PASS')
