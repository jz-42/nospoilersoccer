import type { Team, TeamId } from '../types'

/**
 * Every club across the three club competitions, defined exactly once.
 *
 * A club that plays in two competitions has ONE id: Arsenal in the Premier
 * League and Arsenal in the Champions League are both `arsenal`, so colours,
 * crests and progress can never drift apart between competitions. Season files
 * select from this registry rather than redefining teams.
 *
 * Ids are lowercase ASCII slugs, diacritics folded, no club-type suffixes, and
 * the shortest unambiguous common name (`tottenham`, not
 * `tottenham-hotspur-fc`). They are human-authored on purpose — a reviewer can
 * check `liverpool: [...]` in club-colors.ts, but not `espn-364: [...]` — and
 * crest filenames match the slug.
 *
 * `espnId` is ESPN's numeric team id and is the only thing the ingest matches
 * on, so a club renaming itself upstream can't silently create a second team.
 * This file is hand-maintained: `npx tsx scripts/espn-club.ts --registry`
 * prints ready-to-paste entries for any club ESPN knows about and we don't,
 * but a human picks the slug.
 */
export const clubs: Record<TeamId, Team> = {
  // --- England ------------------------------------------------------------
  arsenal: { id: 'arsenal', name: 'Arsenal', shortName: 'ARS', espnId: '359' },
  'aston-villa': { id: 'aston-villa', name: 'Aston Villa', shortName: 'AVL', espnId: '362' },
  bournemouth: { id: 'bournemouth', name: 'Bournemouth', shortName: 'BOU', espnId: '349' },
  brentford: { id: 'brentford', name: 'Brentford', shortName: 'BRE', espnId: '337' },
  brighton: { id: 'brighton', name: 'Brighton', shortName: 'BHA', espnId: '331' },
  chelsea: { id: 'chelsea', name: 'Chelsea', shortName: 'CHE', espnId: '363' },
  coventry: { id: 'coventry', name: 'Coventry City', shortName: 'COV', espnId: '388' },
  'crystal-palace': { id: 'crystal-palace', name: 'Crystal Palace', shortName: 'CRY', espnId: '384' },
  everton: { id: 'everton', name: 'Everton', shortName: 'EVE', espnId: '368' },
  fulham: { id: 'fulham', name: 'Fulham', shortName: 'FUL', espnId: '370' },
  hull: { id: 'hull', name: 'Hull City', shortName: 'HUL', espnId: '306' },
  ipswich: { id: 'ipswich', name: 'Ipswich Town', shortName: 'IPS', espnId: '373' },
  leeds: { id: 'leeds', name: 'Leeds United', shortName: 'LEE', espnId: '357' },
  liverpool: { id: 'liverpool', name: 'Liverpool', shortName: 'LIV', espnId: '364' },
  'manchester-city': { id: 'manchester-city', name: 'Manchester City', shortName: 'MCI', espnId: '382' },
  'manchester-united': { id: 'manchester-united', name: 'Manchester United', shortName: 'MUN', espnId: '360' },
  newcastle: { id: 'newcastle', name: 'Newcastle United', shortName: 'NEW', espnId: '361' },
  'nottingham-forest': { id: 'nottingham-forest', name: 'Nottingham Forest', shortName: 'NFO', espnId: '393' },
  sunderland: { id: 'sunderland', name: 'Sunderland', shortName: 'SUN', espnId: '366' },
  tottenham: { id: 'tottenham', name: 'Tottenham', shortName: 'TOT', espnId: '367' },

  // --- Spain --------------------------------------------------------------
  alaves: { id: 'alaves', name: 'Alavés', shortName: 'ALA', espnId: '96' },
  'athletic-club': { id: 'athletic-club', name: 'Athletic Club', shortName: 'ATH', espnId: '93' },
  'atletico-madrid': { id: 'atletico-madrid', name: 'Atlético Madrid', shortName: 'ATM', espnId: '1068' },
  barcelona: { id: 'barcelona', name: 'Barcelona', shortName: 'BAR', espnId: '83' },
  'celta-vigo': { id: 'celta-vigo', name: 'Celta Vigo', shortName: 'CEL', espnId: '85' },
  deportivo: { id: 'deportivo', name: 'Deportivo', shortName: 'DEP', espnId: '90' },
  elche: { id: 'elche', name: 'Elche', shortName: 'ELC', espnId: '3751' },
  espanyol: { id: 'espanyol', name: 'Espanyol', shortName: 'ESP', espnId: '88' },
  getafe: { id: 'getafe', name: 'Getafe', shortName: 'GET', espnId: '2922' },
  levante: { id: 'levante', name: 'Levante', shortName: 'LEV', espnId: '1538' },
  malaga: { id: 'malaga', name: 'Málaga', shortName: 'MAL', espnId: '99' },
  osasuna: { id: 'osasuna', name: 'Osasuna', shortName: 'OSA', espnId: '97' },
  'racing-santander': { id: 'racing-santander', name: 'Racing Santander', shortName: 'RAC', espnId: '87' },
  'rayo-vallecano': { id: 'rayo-vallecano', name: 'Rayo Vallecano', shortName: 'RAY', espnId: '101' },
  'real-betis': { id: 'real-betis', name: 'Real Betis', shortName: 'BET', espnId: '244' },
  'real-madrid': { id: 'real-madrid', name: 'Real Madrid', shortName: 'RMA', espnId: '86' },
  'real-sociedad': { id: 'real-sociedad', name: 'Real Sociedad', shortName: 'RSO', espnId: '89' },
  sevilla: { id: 'sevilla', name: 'Sevilla', shortName: 'SEV', espnId: '243' },
  valencia: { id: 'valencia', name: 'Valencia', shortName: 'VAL', espnId: '94' },
  villarreal: { id: 'villarreal', name: 'Villarreal', shortName: 'VIL', espnId: '102' },

  // --- Rest of Europe (Champions League) ----------------------------------
  'aek-athens': { id: 'aek-athens', name: 'AEK Athens', shortName: 'AEK', espnId: '887' },
  'bayern-munich': { id: 'bayern-munich', name: 'Bayern Munich', shortName: 'BAY', espnId: '132' },
  'bodo-glimt': { id: 'bodo-glimt', name: 'Bodø/Glimt', shortName: 'BOD', espnId: '2980' },
  'club-brugge': { id: 'club-brugge', name: 'Club Brugge', shortName: 'BRU', espnId: '570' },
  como: { id: 'como', name: 'Como', shortName: 'COM', espnId: '2572' },
  dortmund: { id: 'dortmund', name: 'Borussia Dortmund', shortName: 'DOR', espnId: '124' },
  fenerbahce: { id: 'fenerbahce', name: 'Fenerbahçe', shortName: 'FEN', espnId: '436' },
  feyenoord: { id: 'feyenoord', name: 'Feyenoord', shortName: 'FEY', espnId: '142' },
  galatasaray: { id: 'galatasaray', name: 'Galatasaray', shortName: 'GAL', espnId: '432' },
  inter: { id: 'inter', name: 'Inter Milan', shortName: 'INT', espnId: '110' },
  lask: { id: 'lask', name: 'LASK', shortName: 'LAS', espnId: '4411' },
  lens: { id: 'lens', name: 'Lens', shortName: 'LEN', espnId: '175' },
  lille: { id: 'lille', name: 'Lille', shortName: 'LIL', espnId: '166' },
  napoli: { id: 'napoli', name: 'Napoli', shortName: 'NAP', espnId: '114' },
  porto: { id: 'porto', name: 'Porto', shortName: 'POR', espnId: '437' },
  psg: { id: 'psg', name: 'Paris Saint-Germain', shortName: 'PSG', espnId: '160' },
  psv: { id: 'psv', name: 'PSV Eindhoven', shortName: 'PSV', espnId: '148' },
  'rb-leipzig': { id: 'rb-leipzig', name: 'RB Leipzig', shortName: 'RBL', espnId: '11420' },
  roma: { id: 'roma', name: 'Roma', shortName: 'ROM', espnId: '104' },
  sabah: { id: 'sabah', name: 'Sabah', shortName: 'SAB', espnId: '21922' },
  shakhtar: { id: 'shakhtar', name: 'Shakhtar Donetsk', shortName: 'SHK', espnId: '493' },
  'slavia-prague': { id: 'slavia-prague', name: 'Slavia Prague', shortName: 'SLA', espnId: '494' },
  'slovan-bratislava': { id: 'slovan-bratislava', name: 'Slovan Bratislava', shortName: 'SLO', espnId: '521' },
  'sporting-cp': { id: 'sporting-cp', name: 'Sporting CP', shortName: 'SPO', espnId: '2250' },
  stuttgart: { id: 'stuttgart', name: 'Stuttgart', shortName: 'STU', espnId: '134' },
  viking: { id: 'viking', name: 'Viking', shortName: 'VIK', espnId: '510' },
}

/**
 * Letters that stand alone rather than decomposing into base + diacritic, so
 * NFD can't fold them. Without these, "Bodø/Glimt" normalises to `bodglimt`
 * and never matches ESPN's "Bodo/Glimt".
 */
const STANDALONE_FOLDS: Record<string, string> = {
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
}

/**
 * Fold a club name to a comparison key: lowercase, diacritics stripped, and
 * every separator removed. "Man. City", "Man City" and "man-city" all collapse
 * to `mancity`, so punctuation drift upstream costs us nothing.
 */
export function normalizeClubName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[øđðłßæœþ]/g, (c) => STANDALONE_FOLDS[c] ?? c)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Names that don't fold onto a club's registry name. Two sources feed this:
 * ESPN's `displayName` (e.g. "Internazionale") and CBS Golazo's video titles
 * (e.g. "Man. City", "Dortmund", "Spurs").
 *
 * Keep it conservative. An alias that is ambiguous across European football —
 * "Milan", which means AC Milan to CBS but reads like Inter Milan here — must
 * not be added: a wrong alias could attach a highlight to the wrong fixture,
 * and there is no reviewer downstream to catch it.
 */
const ALIAS_NAMES: Record<string, TeamId> = {
  // ESPN display names
  'AFC Bournemouth': 'bournemouth',
  'Brighton & Hove Albion': 'brighton',
  'Tottenham Hotspur': 'tottenham',
  Internazionale: 'inter',
  'FC Porto': 'porto',
  'AS Roma': 'roma',
  'Sabah FK': 'sabah',
  'Viking FK': 'viking',
  'LASK Linz': 'lask',
  'Feyenoord Rotterdam': 'feyenoord',
  'VfB Stuttgart': 'stuttgart',
  'Bodo/Glimt': 'bodo-glimt',
  'Real Betis Balompie': 'real-betis',

  // CBS Golazo title shorthands
  'Man City': 'manchester-city',
  'Man. City': 'manchester-city',
  'Man United': 'manchester-united',
  'Man. United': 'manchester-united',
  'Man Utd': 'manchester-united',
  Spurs: 'tottenham',
  Forest: 'nottingham-forest',
  'Nottm Forest': 'nottingham-forest',
  Dortmund: 'dortmund',
  'Borussia Dortmund': 'dortmund',
  PSG: 'psg',
  'Paris SG': 'psg',
  Inter: 'inter',
  Bayern: 'bayern-munich',
  Sporting: 'sporting-cp',
  'Sporting Lisbon': 'sporting-cp',
  Brugge: 'club-brugge',
  Leipzig: 'rb-leipzig',
  Betis: 'real-betis',
  Atletico: 'atletico-madrid',
  Atleti: 'atletico-madrid',
  Barca: 'barcelona',
  'Athletic Bilbao': 'athletic-club',
  Athletic: 'athletic-club',
  Celta: 'celta-vigo',
  Rayo: 'rayo-vallecano',
  Racing: 'racing-santander',
  Shakhtar: 'shakhtar',
  Slavia: 'slavia-prague',
  Slovan: 'slovan-bratislava',
  Sociedad: 'real-sociedad',
  PSV: 'psv',
  'Slavia Praha': 'slavia-prague',
  'Atletico de Madrid': 'atletico-madrid',
  'Celta de Vigo': 'celta-vigo',
  Newcastle: 'newcastle',
  Leeds: 'leeds',
  Ipswich: 'ipswich',
  Hull: 'hull',
  Coventry: 'coventry',
}

const byNormalizedName = new Map<string, TeamId>()
for (const club of Object.values(clubs)) byNormalizedName.set(normalizeClubName(club.name), club.id)
for (const [name, id] of Object.entries(ALIAS_NAMES)) byNormalizedName.set(normalizeClubName(name), id)

const byEspnId = new Map<string, TeamId>()
for (const club of Object.values(clubs)) {
  if (club.espnId) byEspnId.set(club.espnId, club.id)
}

/** The club ESPN calls `espnId`, or null when we've never registered it. */
export function clubIdByEspnId(espnId: string): TeamId | null {
  return byEspnId.get(espnId) ?? null
}

/**
 * The club a display name refers to, or null. Fails closed: an unrecognised
 * name is never guessed at, because the only consumer that can't verify its
 * answer downstream is the highlight curator.
 */
export function clubIdByName(name: string): TeamId | null {
  return byNormalizedName.get(normalizeClubName(name)) ?? null
}
