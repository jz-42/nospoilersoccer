import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { tournaments } from '../data'
import { ChampionMoment } from './Champion'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const wc2026 = tournaments.wc2026
const wc2022 = tournaments.wc2022
const spain = wc2026.teams.ESP
const argentina = wc2022.teams.ARG
const championSource = readFileSync(new URL('./Champion.tsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

const standardChampion = renderToStaticMarkup(
  <ChampionMoment t={wc2026} team={spain} />,
)
const messiChampion = renderToStaticMarkup(
  <ChampionMoment t={wc2022} team={argentina} />,
)

assert(
  standardChampion.includes('class="champion-trophy"'),
  'standard champion renders the photographic trophy image',
)
assert(
  standardChampion.includes('alt=""') && standardChampion.includes('aria-hidden="true"'),
  'photographic trophy is decorative for assistive technology',
)
assert(
  !messiChampion.includes('class="champion-trophy"') && messiChampion.includes('<svg'),
  '2022 Argentina keeps the special Messi lift artwork',
)
assert(
  championSource.includes("new URL('../assets/world-cup-trophy.png', import.meta.url).href"),
  'standard trophy is bundled through the Vite asset pipeline',
)
assert(
  /\.b-champ\s*\{[^}]*?top:\s*8px;/.test(appCss),
  'special champion artwork keeps its original position',
)
assert(
  /\.b-champ:has\(\.champion-trophy\)\s*\{[^}]*?top:\s*34px;/.test(appCss),
  'collapsed detail control leaves space above the champion',
)
assert(
  /\.ko-detail\.is-open\s*\+\s*\.b-champ:has\(\.champion-trophy\)\s*\{[^}]*?top:\s*112px;/.test(
    appCss,
  ),
  'expanded detail key moves the champion farther down',
)
assert(
  /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.b-champ\s*\{[\s\S]*?transition:\s*none;[\s\S]*?animation:\s*none;/.test(
    appCss,
  ),
  'champion movement respects reduced-motion preferences',
)

console.log('champion smoke tests passed')
