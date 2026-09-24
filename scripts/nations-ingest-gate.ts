import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { unl2026 } from '../src/data/nations/unl-2026'
import { buildWindowReport, parseMatchKickoffs } from '../cloudflare-scheduler/index.mjs'

export function shouldRunNationsIngest(input: {
  insideWindow: boolean
  pendingStageCount: number
  cycle: number
  now: Date
}): boolean {
  return input.insideWindow || (
    input.pendingStageCount > 0 && input.cycle === 1 && input.now.getUTCHours() % 6 === 0
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cycle = Number(process.argv[2])
  if (!Number.isSafeInteger(cycle) || cycle < 1) throw new Error('expected a positive updater cycle number')
  const now = new Date()
  const source = readFileSync(new URL('../src/data/nations/unl-2026.ts', import.meta.url), 'utf8')
  const insideWindow = buildWindowReport(parseMatchKickoffs(source, 'unl-2026'), now).insideWindow
  const pendingStageCount = unl2026.knockoutTracks?.reduce(
    (count, track) => count + (track.pendingStages?.length ?? 0), 0,
  ) ?? 0
  process.exitCode = shouldRunNationsIngest({ insideWindow, pendingStageCount, cycle, now }) ? 0 : 1
}
