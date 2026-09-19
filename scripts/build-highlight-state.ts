import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { eng1_2026 } from '../src/data/club/eng1-2026'
import { esp1_2026 } from '../src/data/club/esp1-2026'
import { ucl_2026 } from '../src/data/club/ucl-2026'
import { tournaments } from '../src/data'
import {
  buildRuntimeHighlightState,
  parseRuntimeHighlightState,
  type RuntimeHighlightState,
} from '../src/data/highlight-state'
import type { Tournament } from '../src/data/types'

const outputDirectory = 'public/api/highlights'
const tournamentList: Tournament[] = [tournaments.wc2026, eng1_2026, esp1_2026, ucl_2026]

function versionFor(tournament: Tournament): number {
  const provisional = buildRuntimeHighlightState(tournament, 0, '')
  const digest = createHash('sha256').update(JSON.stringify(provisional.matches)).digest('hex')
  return Number.parseInt(digest.slice(0, 12), 16)
}

function existingState(path: string): RuntimeHighlightState | null {
  try {
    return parseRuntimeHighlightState(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

mkdirSync(outputDirectory, { recursive: true })
for (const tournament of tournamentList) {
  const output = `${outputDirectory}/${tournament.id}.json`
  const version = versionFor(tournament)
  const existing = existingState(output)
  if (existing?.version === version) {
    console.log(`unchanged ${output}`)
    continue
  }
  const state = buildRuntimeHighlightState(tournament, version)
  writeFileSync(output, `${JSON.stringify(state, null, 2)}\n`)
  console.log(`wrote ${output}`)
}
