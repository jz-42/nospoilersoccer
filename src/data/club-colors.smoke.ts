import { readdirSync, readFileSync } from 'node:fs'
import { clubColors } from './club-colors'
import { clubs } from './club/clubs'
import { matchTint } from './team-colors'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`ok - ${message}`)
}

const HEX = /^#[0-9a-f]{6}$/

// ---- every club is coloured, and coloured to the house rules --------------
//
// The registry is the roster: club seasons are lazy chunks, but a club that
// plays anywhere is in `clubs`, and a club in two competitions is one entry.
const ids = Object.keys(clubs)
assert(ids.length > 0, `the club registry is populated (${ids.length} clubs)`)

for (const id of ids) {
  const palette = clubColors[id]
  assert(Boolean(palette), `${id} (${clubs[id].name}) has a colour palette`)
  assert(
    palette.every((hex) => HEX.test(hex)),
    `${id} palette is all lowercase #rrggbb`,
  )
  assert(palette[0] !== palette[1], `${id} lead and accent differ`)
  if (palette.length === 3) {
    assert(
      palette[2] !== palette[0] && palette[2] !== palette[1],
      `${id} deep is a third tone, not a repeat`,
    )
  }
}

for (const id of Object.keys(clubColors)) {
  assert(Boolean(clubs[id]), `colour entry ${id} matches a registry slug`)
}

// White is never stored — light lives in the glow layer, not in paint. The
// pale sides (Real Madrid, Spurs, Fulham, Leeds, Valencia, Rayo, Racing, LASK,
// Leipzig, Stuttgart) lead with a platinum given a cast, so nothing may reach
// the top of the ramp.
for (const [id, palette] of Object.entries(clubColors)) {
  for (const hex of palette) {
    const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    assert(Math.min(...channels) < 0xe4, `${id}: ${hex} is paint, not white`)
  }
}

// No two clubs may resolve to the same field, anywhere. The registry is small
// enough to check exhaustively, and this is the one property the whole palette
// exists to have: whatever pair the modal draws, it draws two colours.
let same = 0
for (let i = 0; i < ids.length; i += 1) {
  for (let j = i + 1; j < ids.length; j += 1) {
    const tint = matchTint(ids[i], ids[j])
    if (tint['--home-1'] === tint['--away-1']) {
      console.error(`  ${ids[i]} v ${ids[j]} -> ${tint['--home-1']}`)
      same += 1
    }
  }
}
assert(same === 0, `all ${(ids.length * (ids.length - 1)) / 2} club pairings resolve to two fields`)

// The reds are the crowded end of the table, and the collision rule scores on
// ΔE alone — so a red club with a dark cap meeting a red club with a light one
// scores best when *both* sides swap, and neither club is on the screen any
// more. That is why every red's cap sits in the same light band and the dark
// tones live in `deep` (see the header of club-colors.ts). These are the pairs
// that were broken by the first pass.
const reds: [string, string][] = [
  ['arsenal', 'bournemouth'],
  ['bayern-munich', 'liverpool'],
  ['atletico-madrid', 'liverpool'],
  ['athletic-club', 'sevilla'],
  ['psv', 'feyenoord'],
  ['inter', 'porto'],
  ['club-brugge', 'napoli'],
]
for (const [home, away] of reds) {
  const tint = matchTint(home, away)
  assert(
    tint['--home-1'] === clubColors[home][0] || tint['--away-1'] === clubColors[away][0],
    `${home} v ${away}: one side keeps its own lead (no double swap)`,
  )
}

// ---- crests --------------------------------------------------------------
//
// Crest filenames are the slug, so the glob in Flag.tsx finds them by team id
// with no mapping table in between.
const crestDir = new URL('../assets/crests/', import.meta.url)
const crestFiles = readdirSync(crestDir).filter((f) => f.endsWith('.svg'))

for (const id of ids) {
  assert(crestFiles.includes(`${id}.svg`), `${id} has a crest at src/assets/crests/${id}.svg`)
}
for (const file of crestFiles) {
  assert(Boolean(clubs[file.replace(/\.svg$/, '')]), `crest ${file} matches a registry slug`)
}

for (const file of crestFiles) {
  const svg = readFileSync(new URL(file, crestDir), 'utf8')
  assert(svg.includes('viewBox="0 0 64 64"'), `${file} is square, so contain-fit never letterboxes`)
  // Everything but the SVG namespace declaration: no raster, no fetch, no
  // font, so a crest paints the same offline as on.
  const body = svg.replace('xmlns="http://www.w3.org/2000/svg"', '')
  assert(
    !body.includes('<image') && !body.includes('href') && !body.includes('http'),
    `${file} is self-contained (no external or raster references)`,
  )
}

// The monogram is the last rung of Flag.tsx's fallback chain, so every club
// needs the label it renders.
for (const id of ids) {
  assert(Boolean(clubs[id].shortName), `${id} has a shortName for the monogram fallback`)
}

// ---- pairings ------------------------------------------------------------
//
// The modal is always pairwise, so pairwise is what matters: within a
// competition no two clubs may resolve to the same field. These are the
// derbies where getting it wrong is most obvious.
const derbies: [string, string, string][] = [
  ['manchester-united', 'manchester-city', 'Manchester derby'],
  ['liverpool', 'everton', 'Merseyside derby'],
  ['arsenal', 'tottenham', 'North London derby'],
  ['newcastle', 'sunderland', 'Tyne–Wear derby'],
  ['real-madrid', 'barcelona', 'El Clásico'],
  ['real-madrid', 'atletico-madrid', 'Madrid derby'],
  ['sevilla', 'real-betis', 'Seville derby'],
  ['athletic-club', 'real-sociedad', 'Basque derby'],
  // Inter's only Italian company in the 2026-27 league phase — AC Milan
  // didn't qualify, so there is no Milan derby to check.
  ['inter', 'napoli', 'Inter–Napoli'],
]
for (const [home, away, name] of derbies) {
  const tint = matchTint(home, away)
  assert(tint['--home-1'] !== tint['--away-1'], `${name} renders as two different fields`)
}

// The clubs whose one colour is the whole point keep it when they meet their
// rival, rather than being the side the collision rule moves.
const merseyside = matchTint('liverpool', 'everton')
assert(merseyside['--home-1'] === clubColors.liverpool[0], 'Liverpool stays red on Merseyside')

const bigOne = matchTint('liverpool', 'manchester-united')
assert(
  bigOne['--home-1'] === clubColors.liverpool[0] &&
    bigOne['--away-1'] === clubColors['manchester-united'][1],
  'Liverpool v United: Liverpool keeps the red, United drops to its gold',
)

const clasico = matchTint('real-madrid', 'barcelona')
assert(
  clasico['--home-1'] === clubColors['real-madrid'][0] &&
    clasico['--away-1'] === clubColors.barcelona[0],
  'El Clásico is white against blaugrana, no swap needed',
)

// Stripes against stripes: two red-and-white sides can never both stay red,
// and neither may end up wearing the other's cap.
const stripes = matchTint('athletic-club', 'atletico-madrid')
assert(
  stripes['--home-1'] === clubColors['athletic-club'][0] &&
    stripes['--away-1'] === clubColors['atletico-madrid'][1],
  'Athletic v Atlético resolves to red against white',
)

// A curated deep only survives while the side still leads with its curated
// lead, so a swapped club must not pool into the wrong hue underneath.
assert(
  stripes['--away-deep'] !== clubColors['atletico-madrid'][2],
  'a club moved to its accent drops its curated deep',
)

console.log('ALL PASS')
