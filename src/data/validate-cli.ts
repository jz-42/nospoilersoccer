/**
 * Validates every dataset in the repo, not just the ones the app bundles.
 *
 * `tournaments` holds only what ships eagerly (the World Cup); club seasons
 * are lazy chunks and 2022 is archived out of the app entirely. All of them
 * still have to be consistent — an unvalidated season is one that breaks the
 * first time someone selects it — so they're imported directly here. Adding a
 * season means adding it to this list.
 */
import { eng1_2026 } from './club/eng1-2026'
import { esp1_2026 } from './club/esp1-2026'
import { ucl_2026 } from './club/ucl-2026'
import { tournaments } from './index'
import type { Tournament } from './types'
import { validateTournament } from './validate'
import { wc2022 } from './wc2022'

const datasets: Tournament[] = [
  ...Object.values(tournaments),
  wc2022,
  ucl_2026,
  eng1_2026,
  esp1_2026,
]

let failures = 0
for (const t of datasets) {
  const errors = validateTournament(t)
  const matches = t.groupMatches.length + t.knockoutRounds.reduce((n, r) => n + r.matches.length, 0)
  if (errors.length === 0) {
    console.log(`✓ ${t.id}: ${Object.keys(t.teams).length} teams, ${matches} matches, consistent`)
  } else {
    failures += errors.length
    console.error(`✗ ${t.id}: ${errors.length} problem(s)`)
    for (const e of errors) console.error(`  - ${e}`)
  }
}
if (failures > 0) throw new Error(`${failures} data problem(s) found`)
