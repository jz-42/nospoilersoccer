import { mkdirSync, writeFileSync } from 'node:fs'

import { eng1_2026 } from '../src/data/club/eng1-2026'
import { esp1_2026 } from '../src/data/club/esp1-2026'
import { ucl_2026 } from '../src/data/club/ucl-2026'
import { buildTournamentHotState } from '../src/data/hot-state'
import { wc2026 } from '../src/data/wc2026'

const tournaments = [wc2026, eng1_2026, esp1_2026, ucl_2026]
const outputDirectory = 'public/api/hot-state'

mkdirSync(outputDirectory, { recursive: true })
for (const tournament of tournaments) {
  const output = `${outputDirectory}/${tournament.id}.json`
  writeFileSync(output, `${JSON.stringify(buildTournamentHotState(tournament), null, 2)}\n`)
  console.log(`wrote ${output}`)
}
