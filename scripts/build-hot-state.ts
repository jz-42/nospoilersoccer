import { mkdirSync, writeFileSync } from 'node:fs'

import { buildTournamentHotState } from '../src/data/hot-state'
import { wc2026 } from '../src/data/wc2026'

const OUTPUT = 'public/api/hot-state/wc2026.json'

mkdirSync('public/api/hot-state', { recursive: true })
writeFileSync(OUTPUT, `${JSON.stringify(buildTournamentHotState(wc2026), null, 2)}\n`)
console.log(`wrote ${OUTPUT}`)
