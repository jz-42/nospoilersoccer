import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'

const workflow = readFileSync(
  new URL('../.github/workflows/update-results.yml', import.meta.url),
  'utf8',
)
const curateWorkflow = readFileSync(
  new URL('../.github/workflows/curate-highlight.yml', import.meta.url),
  'utf8',
)

assert.match(
  workflow,
  /if \[ "\$cycle" -eq 1 \]; then[\s\S]*?npx tsx scripts\/curate-videos\.ts[\s\S]*?fi\n\n {12}core_ok=/,
  'World Cup deep highlight scan must run only once per updater hour',
)
assert.match(
  workflow,
  /if \[ "\$cycle" -eq 1 \]; then[\s\S]*?club_step "\$season videos"[\s\S]*?curate-club-videos\.ts --competition "\$competition"[\s\S]*?fi/,
  'club deep highlight scans must run only once per updater hour',
)
assert.match(
  curateWorkflow,
  /grep -Rqs --fixed-strings "youtubeId: '\$VIDEO_ID'" src\/data\/wc2026-videos\.ts src\/data\/club\/\*-videos\.ts[\s\S]*?status=accepted/,
  'an already-persisted candidate must acknowledge accepted after a lost callback',
)

console.log('update workflow smoke tests passed')
