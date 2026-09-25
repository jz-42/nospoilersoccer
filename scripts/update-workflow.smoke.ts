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
  /NATIONS_BACKUP_ROOT:[\s\S]*?nations_step\(\)[\s\S]*?scripts\/espn-nations\.ts[\s\S]*?scripts\/espn-nations\.smoke\.ts[\s\S]*?nations_restore/,
  'Nations League updates are validated atomically with last-known-good restoration',
)
assert.match(
  workflow,
  /npx tsx scripts\/nations-ingest-gate\.ts "\$cycle"[\s\S]*?if nations_step/,
  'Nations League ingest includes off-window draw discovery before the validated step',
)
assert.match(
  workflow,
  /if \[ "\$cycle" -eq 1 \]; then[\s\S]*?club_step "\$season videos"[\s\S]*?curate-club-videos\.ts --competition "\$competition"[\s\S]*?fi/,
  'club deep highlight scans must run only once per updater hour',
)
assert.match(
  workflow,
  /if \[ "\$cycle" -eq 1 \]; then[\s\S]*?curate-club-videos\.ts --competition "\$competition"[\s\S]*?elif \[ "\$competition" = "esp1" \]; then[\s\S]*?--competition esp1[\s\S]*?--source espndeportes[\s\S]*?--scan-depth 50/,
  'later cycles run only the bounded one-page La Liga fallback scan',
)
assert.match(
  curateWorkflow,
  /grep -Rqs --fixed-strings "youtubeId: '\$VIDEO_ID'" src\/data\/wc2026-videos\.ts src\/data\/club\/\*-videos\.ts src\/data\/nations\/unl-2026-videos\.ts[\s\S]*?status=accepted/,
  'an already-persisted candidate must acknowledge accepted after a lost callback',
)
assert.match(
  curateWorkflow,
  /- foxsoccer[\s\S]*?foxsoccer\)[\s\S]*?curate-nations-videos\.ts --video-id "\$VIDEO_ID"/,
  'targeted FOX Soccer candidates route through the Nations League curator',
)
assert.match(
  curateWorkflow,
  /- foxnations[\s\S]*?foxnations\|foxsoccer\)[\s\S]*?curate-nations-videos\.ts --video-id "\$VIDEO_ID"/,
  'targeted FOX Sports Nations League candidates route through the Nations curator',
)
assert.match(
  curateWorkflow,
  /- espndeportes[\s\S]*?espnfc\|espndeportes\)[\s\S]*?--competition esp1 --video-id "\$VIDEO_ID"/,
  'targeted ESPN Deportes candidates route through the La Liga curator',
)
assert.match(
  curateWorkflow,
  /HIGHLIGHT_RESULT_FILE:[\s\S]*?status="\$\(cat "\$HIGHLIGHT_RESULT_FILE"\)"[\s\S]*?accepted\|retry\|quarantined/,
  'targeted curation persists an explicit accepted, retry, or quarantined disposition',
)

console.log('update workflow smoke tests passed')
