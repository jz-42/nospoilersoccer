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
const watchdogWorkflow = readFileSync(
  new URL('../.github/workflows/update-watchdog.yml', import.meta.url),
  'utf8',
)

assert.match(watchdogWorkflow, /cron: ['"]2\/5 \* \* \* \*['"]/, 'an independent five-minute watchdog runs around the clock')
assert.match(
  watchdogWorkflow,
  /workflow_run:[\s\S]*?workflows: \[Update World Cup data\][\s\S]*?types: \[completed\]/,
  'updater completion also triggers the watchdog without waiting for a scheduled run',
)
assert.match(watchdogWorkflow, /actions: write/, 'the watchdog can dispatch the updater')
assert.match(
  watchdogWorkflow,
  /workflow_runs[\s\S]*?status != "completed"[\s\S]*?if \[ "\$active" -eq 0 \]; then[\s\S]*?gh workflow run update-results\.yml --ref main/,
  'the watchdog dispatches only when the updater is idle',
)

assert.match(
  workflow,
  /if \[ "\$core_scan_pending" -eq 1 \]; then[\s\S]*?npx tsx scripts\/curate-videos\.ts[\s\S]*?fi\n\n {12}core_ok=/,
  'World Cup deep highlight scan runs until its first publish succeeds',
)
assert.match(
  workflow,
  /NATIONS_BACKUP_ROOT:[\s\S]*?nations_step\(\)[\s\S]*?scripts\/espn-nations\.ts[\s\S]*?scripts\/espn-nations\.smoke\.ts[\s\S]*?nations_restore/,
  'Nations League updates are validated atomically with last-known-good restoration',
)
assert.match(
  workflow,
  /nations_gate_cycle=\$cycle[\s\S]*?if \[ "\$nations_scan_pending" -eq 1 \]; then nations_gate_cycle=1; fi[\s\S]*?npx tsx scripts\/nations-ingest-gate\.ts "\$nations_gate_cycle"[\s\S]*?if nations_step/,
  'Nations League retry preserves the first-cycle off-window draw discovery opportunity',
)
assert.match(
  workflow,
  /if \[ "\$club_scan_pending" -eq 1 \]; then[\s\S]*?club_step "\$season videos"[\s\S]*?curate-club-videos\.ts --competition "\$competition"[\s\S]*?fi/,
  'club deep highlight scans run until their first publish succeeds',
)
assert.match(
  workflow,
  /if \[ "\$club_scan_pending" -eq 1 \]; then[\s\S]*?curate-club-videos\.ts --competition "\$competition"[\s\S]*?elif \[ "\$competition" = "esp1" \]; then[\s\S]*?--competition esp1[\s\S]*?--source espndeportes[\s\S]*?--scan-depth 50/,
  'later cycles run only the bounded one-page La Liga fallback scan',
)
assert.match(
  curateWorkflow,
  /grep -Rqs --fixed-strings "youtubeId: '\$VIDEO_ID'" src\/data\/wc2026-videos\.ts src\/data\/club\/\*-videos\.ts src\/data\/nations\/unl-2026-videos\.ts[\s\S]*?status=accepted/,
  'an already-persisted candidate must acknowledge accepted after a lost callback',
)
assert.match(
  curateWorkflow,
  /- foxsoccer[\s\S]*?foxnations\|foxsoccer\|tudn\)[\s\S]*?curate-nations-videos\.ts --video-id "\$VIDEO_ID"/,
  'targeted FOX Soccer candidates route through the Nations League curator',
)
assert.match(
  curateWorkflow,
  /- foxnations[\s\S]*?foxnations\|foxsoccer\|tudn\)[\s\S]*?curate-nations-videos\.ts --video-id "\$VIDEO_ID"/,
  'targeted FOX Sports Nations League candidates route through the Nations curator',
)
assert.match(
  curateWorkflow,
  /- tudn[\s\S]*?foxnations\|foxsoccer\|tudn\)[\s\S]*?curate-nations-videos\.ts --video-id "\$VIDEO_ID"/,
  'targeted TUDN USA candidates route through the Nations League curator',
)
assert.match(
  workflow,
  /if \[ "\$nations_highlight_scan" = 1 \]; then[\s\S]*?curate-nations-videos\.ts --scan tudn[\s\S]*?keeping the result update[\s\S]*?nations_highlight_scan=\$nations_scan_pending/,
  'TUDN playlist catch-up runs until its first publish and a scan failure keeps the result update',
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

assert.doesNotMatch(workflow, /git pull --rebase/, 'the updater must rebuild generated data rather than rebase it')
assert.doesNotMatch(curateWorkflow, /git pull --rebase/, 'targeted highlights must rebuild rather than rebase generated data')
assert.match(
  workflow,
  /restart_cycle_after_publish_collision\(\) \{[\s\S]*?git reset --hard origin\/main[\s\S]*?\}\n[\s\S]*?if ! publish_main; then[\s\S]*?restart_cycle_after_publish_collision[\s\S]*?continue/,
  'a publish collision rebuilds the updater cycle from current main',
)
assert.match(
  curateWorkflow,
  /for attempt in \$\(seq 1 [2-9]\)[\s\S]*?if publish_main; then[\s\S]*?git reset --hard origin\/main[\s\S]*?curate_targeted/,
  'a targeted highlight retries curation from current main in the same run',
)
assert.doesNotMatch(
  curateWorkflow,
  /group: update-data/,
  'highlights never wait behind the long-running updater',
)

console.log('update workflow smoke tests passed')
