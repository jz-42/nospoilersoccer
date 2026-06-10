import { tournaments } from './index'
import { validateTournament } from './validate'

let failures = 0
for (const t of Object.values(tournaments)) {
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
