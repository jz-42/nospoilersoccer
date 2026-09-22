/**
 * Vendor the Nations League flags from flag-icons (MIT), deterministically.
 * Existing assets are never overwritten unless --force is supplied.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { nationsLeagueTeamIds } from '../src/data/national-teams'

const isoCode: Record<(typeof nationsLeagueTeamIds)[number], string> = {
  FRA: 'fr', ITA: 'it', BEL: 'be', TUR: 'tr', GER: 'de', NED: 'nl', SRB: 'rs', GRE: 'gr',
  ESP: 'es', CRO: 'hr', ENG: 'gb-eng', CZE: 'cz', POR: 'pt', DEN: 'dk', NOR: 'no', WAL: 'gb-wls',
  SCO: 'gb-sct', SUI: 'ch', SVN: 'si', MKD: 'mk', HUN: 'hu', UKR: 'ua', GEO: 'ge', NIR: 'gb-nir',
  ISR: 'il', AUT: 'at', IRL: 'ie', KOS: 'xk', POL: 'pl', BIH: 'ba', ROU: 'ro', SWE: 'se',
  ALB: 'al', FIN: 'fi', BLR: 'by', SMR: 'sm', MNE: 'me', ARM: 'am', CYP: 'cy', LVA: 'lv',
  KAZ: 'kz', SVK: 'sk', FRO: 'fo', MDA: 'md', ISL: 'is', BUL: 'bg', EST: 'ee', LUX: 'lu',
  GIB: 'gi', MLT: 'mt', AND: 'ad', LTU: 'lt', AZE: 'az', LIE: 'li',
}

const force = process.argv.includes('--force')
const flagsDirectory = fileURLToPath(new URL('../src/assets/flags/', import.meta.url))
await mkdir(flagsDirectory, { recursive: true })

let downloaded = 0
for (const id of nationsLeagueTeamIds) {
  const path = `${flagsDirectory}/${id}.svg`
  if (existsSync(path) && !force) continue

  const url = `https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/${isoCode[id]}.svg`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${id}: ${response.status} fetching ${url}`)
  const svg = await response.text()
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('svg') && !svg.trimStart().startsWith('<svg')) {
    throw new Error(`${id}: rejected non-SVG response from ${url}`)
  }
  if (!svg.includes('<svg')) throw new Error(`${id}: response does not contain an SVG element`)
  await writeFile(path, svg.endsWith('\n') ? svg : `${svg}\n`, 'utf8')
  downloaded++
}

for (const id of nationsLeagueTeamIds) {
  const path = `${flagsDirectory}/${id}.svg`
  const svg = await readFile(path, 'utf8')
  if (!svg.includes('<svg')) throw new Error(`${id}: invalid vendored flag`)
}

console.log(`all ${nationsLeagueTeamIds.length} Nations League flags present (${downloaded} downloaded)`)
