import { tournaments } from './index'
import { matchTint, teamColors } from './team-colors'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const HEX = /^#[0-9a-f]{6}$/

// Every team in every tournament must have a palette, or its modal renders
// untinted. This is the guard that keeps the table in step with the rosters.
for (const t of Object.values(tournaments)) {
  for (const id of Object.keys(t.teams)) {
    const palette = teamColors[id]
    assert(Boolean(palette), `${t.year}: ${id} (${t.teams[id].name}) has a color palette`)
    assert(
      palette[0] !== palette[1],
      `${id} primary and secondary differ (gives the side some depth)`,
    )
  }
}

for (const [id, palette] of Object.entries(teamColors)) {
  assert(HEX.test(palette[0]) && HEX.test(palette[1]), `${id} palette is two #rrggbb hexes`)
}

// matchTint only sets the variables for sides whose team is known, so an
// undecided knockout slot stays neutral until it's revealed.
const both = matchTint('PAR', 'FRA')
assert(
  both['--home-1'] === teamColors.PAR[0] && both['--away-1'] === teamColors.FRA[0],
  'a distinct matchup keeps both primaries as field colors',
)

// Collision rule: when both primaries read as the same color, one side drops
// to its secondary (its cap shows the primary instead) so the matchup always
// renders as two colors — the Apple Sports alternate-kit behavior.
const espAut = matchTint('ESP', 'AUT')
assert(
  espAut['--home-1'] === teamColors.ESP[1] && espAut['--home-2'] === teamColors.ESP[0],
  'Spain–Austria (red vs red) moves Spain to gold, cap flips to red',
)
assert(espAut['--away-1'] === teamColors.AUT[0], 'Austria keeps its red field')

const usaBih = matchTint('USA', 'BIH')
assert(
  usaBih['--home-1'] !== usaBih['--away-1'],
  'USA–Bosnia (blue vs blue) resolves to two distinct fields',
)

const qatSui = matchTint('QAT', 'SUI')
assert(
  qatSui['--home-1'] === teamColors.QAT[0] && qatSui['--away-1'] === teamColors.SUI[0],
  'Qatar–Switzerland (dark maroon vs bright red) is distinct enough to keep both primaries',
)

const homeOnly = matchTint('BRA', null)
assert(
  homeOnly['--home-1'] === teamColors.BRA[0] && !('--away-1' in homeOnly),
  'a half-resolved matchup tints only the known side',
)

assert(Object.keys(matchTint(null, null)).length === 0, 'an unknown matchup yields no tint')

console.log('ALL PASS')
