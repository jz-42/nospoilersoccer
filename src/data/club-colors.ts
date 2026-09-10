import type { TeamId } from './types'

/**
 * Per-club identity palettes. Same `[lead, accent, deep?]` shape and the same
 * rules as `./team-colors.ts` — read that file's header first, it defines the
 * system. This file only records what is *different* about clubs.
 *
 * Four things make club colour harder than country colour:
 *
 * 1. **The register has to match, or the World Cup and the leagues look like
 *    two products.** Brand hex is built for print on white (Liverpool #C8102E,
 *    Dortmund #FDE100); dropped onto the dark modal it screams next to
 *    England's #e0544e. Every value here is pulled into the same muted,
 *    mid-luminance band the national palettes live in. Nothing is a raw kit
 *    hex, and that is deliberate.
 *
 * 2. **White clubs.** White is never stored — light lives in the glow layer.
 *    Real Madrid, Spurs, Fulham, Leeds, Valencia, Rayo, Racing, LASK, RB
 *    Leipzig and Stuttgart all lead with a pale platinum given a cast (cool
 *    for Spurs and Real, warm-neutral for Fulham and Valencia) and are told
 *    apart by their cap, not their field. That is the same move the national
 *    table makes with `#c0c6d2` for England's and Denmark's white.
 *
 * 3. **Pile-ups.** The Premier League has six red clubs and five blue ones;
 *    La Liga has six blue-and-white sides. Hue alone cannot separate them
 *    inside this narrow register, so separation is carried by (a) small
 *    luminance steps along a deliberate red ramp and blue ramp, (b) distinct
 *    accents, and (c) the collision rule in `matchTint`, which is exactly the
 *    Spain–Austria case at club scale. Pairwise is what the modal shows, and
 *    pairwise is what was checked: Manchester, Merseyside, North London,
 *    Tyne–Wear, El Clásico, both Madrid clubs, Seville, Basque.
 *
 * 4. **Inside a pile-up, every cap sits in the same light band.** Accents are
 *    caps, never bands — that is the rule the national table sets, and it is
 *    why Atlético's stripes and Barcelona's stripes cannot meet and produce
 *    plaid. But which cap is which turns out to matter too, and this one is
 *    not cosmetic. `matchTint` resolves a collision by scoring every
 *    lead/accent combination on ΔE, so an accent is not decoration — it is the
 *    colour a club actually wears whenever it meets a near neighbour. A first
 *    pass gave some of the reds near-black or navy caps, and the effect was
 *    that a light-capped side meeting a dark-capped one scored best when
 *    *both* swapped: Arsenal v Bournemouth came out silver against black,
 *    Bayern v Liverpool blue against gold, Inter v Porto black against silver.
 *    Neither club was on the screen any more. The national table avoids this
 *    the same way — Germany's black is a `deep`, never an accent — so within
 *    the reds every dark second colour moved to `deep`, and the white cap is
 *    one shared `#c9cfda` so ties break cleanly to the home side rather than
 *    by hex ordering. Dark caps survive only where the club's lead is nowhere
 *    near another club's: the yellow-and-black and white-and-black sides
 *    (Dortmund, Bodø/Glimt, Hull, AEK, LASK, Shakhtar, Fulham, Sabah), where
 *    black really is the second colour and no pile-up can reach it.
 *
 * That is why `deep` carries thirteen clubs rather than the handful you would
 * expect. Four are there because a genuinely different hue at depth is the
 * identity — Leeds (white → yellow → Leeds blue), Real Madrid (white → gold →
 * crest navy), Villarreal (yellow → blue), Dortmund (yellow → black). The
 * other nine — Bournemouth, Athletic, Atlético, Osasuna, Bayern, Feyenoord,
 * Lille, Inter, Club Brugge — are reds and blues whose second colour is dark,
 * and dark belongs at depth rather than in the cap.
 *
 * Keyed by the slug ids of `./club/clubs.ts` (contract §3), so a club that
 * plays in two competitions is coloured once. The core lookup is
 * `clubColors[id] ?? teamColors[id]`; a club with no entry renders a neutral
 * modal, so the failure mode is plain, not broken.
 */
export const clubColors: Record<
  TeamId,
  readonly [string, string] | readonly [string, string, string]
> = {
  // ---- Premier League ------------------------------------------------
  // The red ramp, darkest to warmest: Forest, Bournemouth, Liverpool,
  // Sunderland, Arsenal, Brentford, United. Six of them share the league, so
  // each one's cap is the thing that actually names it.
  arsenal: ['#cd323c', '#c9cfda'], // red body, white sleeve
  'aston-villa': ['#8c2b46', '#8fbcdf'], // claret and sky
  bournemouth: ['#b93340', '#c9cfda', '#1e2026'], // cherry red, white, black at depth
  brentford: ['#cf3f42', '#dfb648'], // red, bee gold
  brighton: ['#3768c6', '#c9cfda'],
  chelsea: ['#2b52ab', '#d3ab4b'], // royal blue, the gold lion
  coventry: ['#77b0dd', '#20355f'],
  'crystal-palace': ['#3050ab', '#d0424a'], // the only red-and-blue side
  everton: ['#26479a', '#c9cfda'], // deepest of the four royals
  fulham: ['#ccced4', '#23262c'],
  hull: ['#dc9a34', '#23262c'], // amber and black
  ipswich: ['#2f5cb5', '#c9cfda'],
  // White, yellow, Leeds blue — the one club whose three colours are all
  // load-bearing, so the third goes to depth rather than being dropped.
  leeds: ['#c9ceda', '#e2c455', '#2a4c93'],
  liverpool: ['#c22b40', '#cba54e'], // crimson, not scarlet; the deep trim gold
  'manchester-city': ['#8ec4ea', '#152a55'], // sky over navy
  'manchester-united': ['#d43c30', '#e2c268'], // warm end of the red ramp; a lighter gold than Liverpool's
  // The one monochrome side in the app. Graphite rather than black so it still
  // reads as paint against the panel, with the white of the stripes arriving
  // through the glow layer as it does for every other side.
  newcastle: ['#2c313b', '#ccd2dd'],
  'nottingham-forest': ['#b02f3e', '#c9cfda'], // Garibaldi red, the darkest
  sunderland: ['#c93a44', '#c9cfda'],
  tottenham: ['#bfc8dd', '#1e2a52'], // cool white over navy

  // ---- La Liga -------------------------------------------------------
  // The blue ramp, deepest to lightest: Getafe, Alavés, Levante, Barcelona,
  // Real Sociedad, Espanyol, Deportivo, Málaga, Celta.
  alaves: ['#2a4fa4', '#c9cfda'],
  'athletic-club': ['#c53a3e', '#c9cfda', '#1d1f25'], // rojiblanco, black shorts at depth
  // Same red-and-white stripes as Athletic; the navy cap is what separates
  // them, and it is real — Atlético's shorts and sleeves have always been blue.
  'atletico-madrid': ['#c8393f', '#c9cfda', '#1d3a70'],
  barcelona: ['#2c4d95', '#9c2a45'], // blau leads, grana caps
  'celta-vigo': ['#7fb6e0', '#c8494f'],
  deportivo: ['#3b83cf', '#c9cfda'],
  elche: ['#288a5c', '#c9cfda'],
  espanyol: ['#3271c6', '#c9cfda'],
  getafe: ['#213f7d', '#8a2745'], // the deepest blue in the league, off Levante's royal
  levante: ['#2c55af', '#9b2740'], // blue and granate
  malaga: ['#4b9adc', '#c9cfda'],
  osasuna: ['#c4353f', '#c9cfda', '#1e2f6b'],
  'racing-santander': ['#c9ced8', '#2f9e63'], // white with the green
  'rayo-vallecano': ['#ccd1dc', '#cf3f45'], // white with the red sash
  'real-betis': ['#2f9c62', '#c9cfda'], // verdiblancos, green leading
  // White, gold, and the navy of the crest at depth.
  'real-madrid': ['#c8cedc', '#d5b45c', '#2a2f5c'],
  'real-sociedad': ['#3060bb', '#c9cfda'],
  // Sevilla lead red rather than white so the derby is red against Betis
  // green, and so La Liga is not six pale sides. The white is in the cap.
  sevilla: ['#c4373c', '#c9cfda'],
  valencia: ['#d0d0cc', '#dd8236'], // warm white, the orange of the bat
  villarreal: ['#e3d05c', '#3169bf', '#22417f'], // the Yellow Submarine

  // ---- Champions League ----------------------------------------------
  // (Arsenal, Aston Villa, Liverpool, both Manchester clubs, Atlético,
  // Barcelona, Betis, Real Madrid and Villarreal are already above — one club,
  // one id, one palette, in both competitions.)
  'aek-athens': ['#d2b83e', '#23262c'],
  'bayern-munich': ['#c62e3f', '#c9cfda', '#243d80'], // red, white, Bavarian blue at depth
  'bodo-glimt': ['#d3cc46', '#23262c'], // a cooler, limier yellow than Dortmund
  dortmund: ['#e0cd3d', '#23262c', '#1a1a1e'],
  'club-brugge': ['#3a82d2', '#c9cfda', '#191b21'],
  como: ['#3a63bd', '#c9cfda'],
  fenerbahce: ['#dcc23f', '#1a2758'], // canary over navy
  feyenoord: ['#c2303c', '#c9cfda', '#1d1f25'], // red-and-white halves, black shorts
  galatasaray: ['#bc2f2f', '#e0a63a'], // deep red, orange-gold
  inter: ['#2c3f8f', '#c9a961', '#16171e'], // nerazzurri, the badge's gold ring
  lask: ['#c9ced8', '#22252b'],
  lens: ['#cd3f3c', '#e3c94e'], // sang et or — brighter and lemony next to Gala
  lille: ['#c33139', '#c9cfda', '#1d2c5c'],
  napoli: ['#39a0da', '#c9cfda'], // azzurri
  porto: ['#2b4aa8', '#c9cfda'],
  psg: ['#22346a', '#c53a44'], // navy with the Hechter red
  psv: ['#d0402f', '#c9cfda'], // more orange than Feyenoord's red
  'rb-leipzig': ['#c9cfdc', '#cf3646'], // RB red runs crimson, not scarlet
  roma: ['#912c34', '#d8b447'], // giallorossi
  // The Pink-Blacks. Leading pink rather than black: the badge is equally
  // both, Newcastle already holds the one monochrome slot, and a charcoal side
  // reads as "no team" against the panel.
  sabah: ['#c05fae', '#23262c'],
  shakhtar: ['#dd7a33', '#22252b'],
  'slavia-prague': ['#c93542', '#c9cfda'],
  'slovan-bratislava': ['#4f96d8', '#c9cfda'],
  'sporting-cp': ['#26875a', '#c9cfda'], // bottle green, deeper than Betis
  stuttgart: ['#cfd0cf', '#c9433a'], // white with the red Brustring
  viking: ['#25396f', '#c9cfda'], // de Mørkeblå
}
