import type { Tournament } from './types'

/**
 * FIFA World Cup 2026 (Canada/Mexico/United States) — 48 teams, 12 groups,
 * round of 32 with 8 best third-placed teams advancing.
 *
 * Knockout match ids follow FIFA's official numbering (73–104).
 * Sources: Wikipedia knockout-stage bracket (cross-checked with FOX/ESPN),
 * ESPN fixture schedule for group dates. No results yet — scores and
 * knockout teams are filled in as the tournament progresses.
 */
export const wc2026: Tournament = {
  id: 'wc2026',
  name: 'World Cup 2026',
  year: 2026,
  advancingRanks: [1, 2],
  bestThirdCount: 8,

  teams: {
    // Group A
    MEX: { id: 'MEX', name: 'Mexico', flag: '🇲🇽' },
    RSA: { id: 'RSA', name: 'South Africa', flag: '🇿🇦' },
    KOR: { id: 'KOR', name: 'South Korea', flag: '🇰🇷' },
    CZE: { id: 'CZE', name: 'Czechia', flag: '🇨🇿' },
    // Group B
    CAN: { id: 'CAN', name: 'Canada', flag: '🇨🇦' },
    BIH: { id: 'BIH', name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
    QAT: { id: 'QAT', name: 'Qatar', flag: '🇶🇦' },
    SUI: { id: 'SUI', name: 'Switzerland', flag: '🇨🇭' },
    // Group C
    BRA: { id: 'BRA', name: 'Brazil', flag: '🇧🇷' },
    MAR: { id: 'MAR', name: 'Morocco', flag: '🇲🇦' },
    HAI: { id: 'HAI', name: 'Haiti', flag: '🇭🇹' },
    SCO: { id: 'SCO', name: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
    // Group D
    USA: { id: 'USA', name: 'United States', flag: '🇺🇸' },
    PAR: { id: 'PAR', name: 'Paraguay', flag: '🇵🇾' },
    AUS: { id: 'AUS', name: 'Australia', flag: '🇦🇺' },
    TUR: { id: 'TUR', name: 'Türkiye', flag: '🇹🇷' },
    // Group E
    GER: { id: 'GER', name: 'Germany', flag: '🇩🇪' },
    CUW: { id: 'CUW', name: 'Curaçao', flag: '🇨🇼' },
    CIV: { id: 'CIV', name: 'Ivory Coast', flag: '🇨🇮' },
    ECU: { id: 'ECU', name: 'Ecuador', flag: '🇪🇨' },
    // Group F
    NED: { id: 'NED', name: 'Netherlands', flag: '🇳🇱' },
    JPN: { id: 'JPN', name: 'Japan', flag: '🇯🇵' },
    SWE: { id: 'SWE', name: 'Sweden', flag: '🇸🇪' },
    TUN: { id: 'TUN', name: 'Tunisia', flag: '🇹🇳' },
    // Group G
    BEL: { id: 'BEL', name: 'Belgium', flag: '🇧🇪' },
    EGY: { id: 'EGY', name: 'Egypt', flag: '🇪🇬' },
    IRN: { id: 'IRN', name: 'Iran', flag: '🇮🇷' },
    NZL: { id: 'NZL', name: 'New Zealand', flag: '🇳🇿' },
    // Group H
    ESP: { id: 'ESP', name: 'Spain', flag: '🇪🇸' },
    CPV: { id: 'CPV', name: 'Cape Verde', flag: '🇨🇻' },
    KSA: { id: 'KSA', name: 'Saudi Arabia', flag: '🇸🇦' },
    URU: { id: 'URU', name: 'Uruguay', flag: '🇺🇾' },
    // Group I
    FRA: { id: 'FRA', name: 'France', flag: '🇫🇷' },
    SEN: { id: 'SEN', name: 'Senegal', flag: '🇸🇳' },
    IRQ: { id: 'IRQ', name: 'Iraq', flag: '🇮🇶' },
    NOR: { id: 'NOR', name: 'Norway', flag: '🇳🇴' },
    // Group J
    ARG: { id: 'ARG', name: 'Argentina', flag: '🇦🇷' },
    ALG: { id: 'ALG', name: 'Algeria', flag: '🇩🇿' },
    AUT: { id: 'AUT', name: 'Austria', flag: '🇦🇹' },
    JOR: { id: 'JOR', name: 'Jordan', flag: '🇯🇴' },
    // Group K
    POR: { id: 'POR', name: 'Portugal', flag: '🇵🇹' },
    COD: { id: 'COD', name: 'DR Congo', flag: '🇨🇩' },
    UZB: { id: 'UZB', name: 'Uzbekistan', flag: '🇺🇿' },
    COL: { id: 'COL', name: 'Colombia', flag: '🇨🇴' },
    // Group L
    ENG: { id: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    CRO: { id: 'CRO', name: 'Croatia', flag: '🇭🇷' },
    GHA: { id: 'GHA', name: 'Ghana', flag: '🇬🇭' },
    PAN: { id: 'PAN', name: 'Panama', flag: '🇵🇦' },
  },

  groups: [
    { id: 'A', teams: ['MEX', 'RSA', 'KOR', 'CZE'] },
    { id: 'B', teams: ['CAN', 'BIH', 'QAT', 'SUI'] },
    { id: 'C', teams: ['BRA', 'MAR', 'HAI', 'SCO'] },
    { id: 'D', teams: ['USA', 'PAR', 'AUS', 'TUR'] },
    { id: 'E', teams: ['GER', 'CUW', 'CIV', 'ECU'] },
    { id: 'F', teams: ['NED', 'JPN', 'SWE', 'TUN'] },
    { id: 'G', teams: ['BEL', 'EGY', 'IRN', 'NZL'] },
    { id: 'H', teams: ['ESP', 'CPV', 'KSA', 'URU'] },
    { id: 'I', teams: ['FRA', 'SEN', 'IRQ', 'NOR'] },
    { id: 'J', teams: ['ARG', 'ALG', 'AUT', 'JOR'] },
    { id: 'K', teams: ['POR', 'COD', 'UZB', 'COL'] },
    { id: 'L', teams: ['ENG', 'CRO', 'GHA', 'PAN'] },
  ],

  groupMatches: [
    // Group A
    { id: 'A1', group: 'A', matchday: 1, date: '2026-06-11', home: 'MEX', away: 'RSA' },
    { id: 'A2', group: 'A', matchday: 1, date: '2026-06-11', home: 'KOR', away: 'CZE' },
    { id: 'A3', group: 'A', matchday: 2, date: '2026-06-18', home: 'CZE', away: 'RSA' },
    { id: 'A4', group: 'A', matchday: 2, date: '2026-06-18', home: 'MEX', away: 'KOR' },
    { id: 'A5', group: 'A', matchday: 3, date: '2026-06-24', home: 'CZE', away: 'MEX' },
    { id: 'A6', group: 'A', matchday: 3, date: '2026-06-24', home: 'RSA', away: 'KOR' },
    // Group B
    { id: 'B1', group: 'B', matchday: 1, date: '2026-06-12', home: 'CAN', away: 'BIH' },
    { id: 'B2', group: 'B', matchday: 1, date: '2026-06-12', home: 'QAT', away: 'SUI' },
    { id: 'B3', group: 'B', matchday: 2, date: '2026-06-18', home: 'SUI', away: 'BIH' },
    { id: 'B4', group: 'B', matchday: 2, date: '2026-06-18', home: 'CAN', away: 'QAT' },
    { id: 'B5', group: 'B', matchday: 3, date: '2026-06-24', home: 'SUI', away: 'CAN' },
    { id: 'B6', group: 'B', matchday: 3, date: '2026-06-24', home: 'BIH', away: 'QAT' },
    // Group C
    { id: 'C1', group: 'C', matchday: 1, date: '2026-06-13', home: 'BRA', away: 'MAR' },
    { id: 'C2', group: 'C', matchday: 1, date: '2026-06-13', home: 'HAI', away: 'SCO' },
    { id: 'C3', group: 'C', matchday: 2, date: '2026-06-19', home: 'SCO', away: 'MAR' },
    { id: 'C4', group: 'C', matchday: 2, date: '2026-06-19', home: 'BRA', away: 'HAI' },
    { id: 'C5', group: 'C', matchday: 3, date: '2026-06-24', home: 'SCO', away: 'BRA' },
    { id: 'C6', group: 'C', matchday: 3, date: '2026-06-24', home: 'MAR', away: 'HAI' },
    // Group D
    { id: 'D1', group: 'D', matchday: 1, date: '2026-06-12', home: 'USA', away: 'PAR' },
    { id: 'D2', group: 'D', matchday: 1, date: '2026-06-13', home: 'AUS', away: 'TUR' },
    { id: 'D3', group: 'D', matchday: 2, date: '2026-06-19', home: 'USA', away: 'AUS' },
    { id: 'D4', group: 'D', matchday: 2, date: '2026-06-19', home: 'TUR', away: 'PAR' },
    { id: 'D5', group: 'D', matchday: 3, date: '2026-06-25', home: 'TUR', away: 'USA' },
    { id: 'D6', group: 'D', matchday: 3, date: '2026-06-25', home: 'PAR', away: 'AUS' },
    // Group E
    { id: 'E1', group: 'E', matchday: 1, date: '2026-06-14', home: 'GER', away: 'CUW' },
    { id: 'E2', group: 'E', matchday: 1, date: '2026-06-14', home: 'CIV', away: 'ECU' },
    { id: 'E3', group: 'E', matchday: 2, date: '2026-06-20', home: 'GER', away: 'CIV' },
    { id: 'E4', group: 'E', matchday: 2, date: '2026-06-20', home: 'ECU', away: 'CUW' },
    { id: 'E5', group: 'E', matchday: 3, date: '2026-06-25', home: 'ECU', away: 'GER' },
    { id: 'E6', group: 'E', matchday: 3, date: '2026-06-25', home: 'CUW', away: 'CIV' },
    // Group F
    { id: 'F1', group: 'F', matchday: 1, date: '2026-06-14', home: 'NED', away: 'JPN' },
    { id: 'F2', group: 'F', matchday: 1, date: '2026-06-14', home: 'SWE', away: 'TUN' },
    { id: 'F3', group: 'F', matchday: 2, date: '2026-06-20', home: 'NED', away: 'SWE' },
    { id: 'F4', group: 'F', matchday: 2, date: '2026-06-20', home: 'TUN', away: 'JPN' },
    { id: 'F5', group: 'F', matchday: 3, date: '2026-06-25', home: 'JPN', away: 'SWE' },
    { id: 'F6', group: 'F', matchday: 3, date: '2026-06-25', home: 'TUN', away: 'NED' },
    // Group G
    { id: 'G1', group: 'G', matchday: 1, date: '2026-06-15', home: 'BEL', away: 'EGY' },
    { id: 'G2', group: 'G', matchday: 1, date: '2026-06-15', home: 'IRN', away: 'NZL' },
    { id: 'G3', group: 'G', matchday: 2, date: '2026-06-21', home: 'BEL', away: 'IRN' },
    { id: 'G4', group: 'G', matchday: 2, date: '2026-06-21', home: 'NZL', away: 'EGY' },
    { id: 'G5', group: 'G', matchday: 3, date: '2026-06-26', home: 'EGY', away: 'IRN' },
    { id: 'G6', group: 'G', matchday: 3, date: '2026-06-26', home: 'NZL', away: 'BEL' },
    // Group H
    { id: 'H1', group: 'H', matchday: 1, date: '2026-06-15', home: 'ESP', away: 'CPV' },
    { id: 'H2', group: 'H', matchday: 1, date: '2026-06-15', home: 'KSA', away: 'URU' },
    { id: 'H3', group: 'H', matchday: 2, date: '2026-06-21', home: 'ESP', away: 'KSA' },
    { id: 'H4', group: 'H', matchday: 2, date: '2026-06-21', home: 'URU', away: 'CPV' },
    { id: 'H5', group: 'H', matchday: 3, date: '2026-06-26', home: 'CPV', away: 'KSA' },
    { id: 'H6', group: 'H', matchday: 3, date: '2026-06-26', home: 'URU', away: 'ESP' },
    // Group I
    { id: 'I1', group: 'I', matchday: 1, date: '2026-06-16', home: 'FRA', away: 'SEN' },
    { id: 'I2', group: 'I', matchday: 1, date: '2026-06-16', home: 'IRQ', away: 'NOR' },
    { id: 'I3', group: 'I', matchday: 2, date: '2026-06-22', home: 'FRA', away: 'IRQ' },
    { id: 'I4', group: 'I', matchday: 2, date: '2026-06-22', home: 'NOR', away: 'SEN' },
    { id: 'I5', group: 'I', matchday: 3, date: '2026-06-26', home: 'NOR', away: 'FRA' },
    { id: 'I6', group: 'I', matchday: 3, date: '2026-06-26', home: 'SEN', away: 'IRQ' },
    // Group J
    { id: 'J1', group: 'J', matchday: 1, date: '2026-06-16', home: 'ARG', away: 'ALG' },
    { id: 'J2', group: 'J', matchday: 1, date: '2026-06-16', home: 'AUT', away: 'JOR' },
    { id: 'J3', group: 'J', matchday: 2, date: '2026-06-22', home: 'ARG', away: 'AUT' },
    { id: 'J4', group: 'J', matchday: 2, date: '2026-06-22', home: 'JOR', away: 'ALG' },
    { id: 'J5', group: 'J', matchday: 3, date: '2026-06-27', home: 'ALG', away: 'AUT' },
    { id: 'J6', group: 'J', matchday: 3, date: '2026-06-27', home: 'JOR', away: 'ARG' },
    // Group K
    { id: 'K1', group: 'K', matchday: 1, date: '2026-06-17', home: 'POR', away: 'COD' },
    { id: 'K2', group: 'K', matchday: 1, date: '2026-06-17', home: 'UZB', away: 'COL' },
    { id: 'K3', group: 'K', matchday: 2, date: '2026-06-23', home: 'POR', away: 'UZB' },
    { id: 'K4', group: 'K', matchday: 2, date: '2026-06-23', home: 'COL', away: 'COD' },
    { id: 'K5', group: 'K', matchday: 3, date: '2026-06-27', home: 'COL', away: 'POR' },
    { id: 'K6', group: 'K', matchday: 3, date: '2026-06-27', home: 'COD', away: 'UZB' },
    // Group L
    { id: 'L1', group: 'L', matchday: 1, date: '2026-06-17', home: 'ENG', away: 'CRO' },
    { id: 'L2', group: 'L', matchday: 1, date: '2026-06-17', home: 'GHA', away: 'PAN' },
    { id: 'L3', group: 'L', matchday: 2, date: '2026-06-23', home: 'ENG', away: 'GHA' },
    { id: 'L4', group: 'L', matchday: 2, date: '2026-06-23', home: 'PAN', away: 'CRO' },
    { id: 'L5', group: 'L', matchday: 3, date: '2026-06-27', home: 'PAN', away: 'ENG' },
    { id: 'L6', group: 'L', matchday: 3, date: '2026-06-27', home: 'CRO', away: 'GHA' },
  ],

  knockoutRounds: [
    {
      id: 'r32',
      name: 'Round of 32',
      matches: [
        { id: 'm73', date: '2026-06-28', home: { type: 'group-rank', group: 'A', rank: 2 }, away: { type: 'group-rank', group: 'B', rank: 2 } },
        { id: 'm74', date: '2026-06-29', home: { type: 'group-rank', group: 'E', rank: 1 }, away: { type: 'best-third', groups: ['A', 'B', 'C', 'D', 'F'] } },
        { id: 'm75', date: '2026-06-29', home: { type: 'group-rank', group: 'F', rank: 1 }, away: { type: 'group-rank', group: 'C', rank: 2 } },
        { id: 'm76', date: '2026-06-29', home: { type: 'group-rank', group: 'C', rank: 1 }, away: { type: 'group-rank', group: 'F', rank: 2 } },
        { id: 'm77', date: '2026-06-30', home: { type: 'group-rank', group: 'I', rank: 1 }, away: { type: 'best-third', groups: ['C', 'D', 'F', 'G', 'H'] } },
        { id: 'm78', date: '2026-06-30', home: { type: 'group-rank', group: 'E', rank: 2 }, away: { type: 'group-rank', group: 'I', rank: 2 } },
        { id: 'm79', date: '2026-06-30', home: { type: 'group-rank', group: 'A', rank: 1 }, away: { type: 'best-third', groups: ['C', 'E', 'F', 'H', 'I'] } },
        { id: 'm80', date: '2026-07-01', home: { type: 'group-rank', group: 'L', rank: 1 }, away: { type: 'best-third', groups: ['E', 'H', 'I', 'J', 'K'] } },
        { id: 'm81', date: '2026-07-01', home: { type: 'group-rank', group: 'D', rank: 1 }, away: { type: 'best-third', groups: ['B', 'E', 'F', 'I', 'J'] } },
        { id: 'm82', date: '2026-07-01', home: { type: 'group-rank', group: 'G', rank: 1 }, away: { type: 'best-third', groups: ['A', 'E', 'H', 'I', 'J'] } },
        { id: 'm83', date: '2026-07-02', home: { type: 'group-rank', group: 'K', rank: 2 }, away: { type: 'group-rank', group: 'L', rank: 2 } },
        { id: 'm84', date: '2026-07-02', home: { type: 'group-rank', group: 'H', rank: 1 }, away: { type: 'group-rank', group: 'J', rank: 2 } },
        { id: 'm85', date: '2026-07-02', home: { type: 'group-rank', group: 'B', rank: 1 }, away: { type: 'best-third', groups: ['E', 'F', 'G', 'I', 'J'] } },
        { id: 'm86', date: '2026-07-03', home: { type: 'group-rank', group: 'J', rank: 1 }, away: { type: 'group-rank', group: 'H', rank: 2 } },
        { id: 'm87', date: '2026-07-03', home: { type: 'group-rank', group: 'K', rank: 1 }, away: { type: 'best-third', groups: ['D', 'E', 'I', 'J', 'L'] } },
        { id: 'm88', date: '2026-07-03', home: { type: 'group-rank', group: 'D', rank: 2 }, away: { type: 'group-rank', group: 'G', rank: 2 } },
      ],
    },
    {
      id: 'r16',
      name: 'Round of 16',
      matches: [
        { id: 'm89', date: '2026-07-04', home: { type: 'match-winner', match: 'm74' }, away: { type: 'match-winner', match: 'm77' } },
        { id: 'm90', date: '2026-07-04', home: { type: 'match-winner', match: 'm73' }, away: { type: 'match-winner', match: 'm75' } },
        { id: 'm91', date: '2026-07-05', home: { type: 'match-winner', match: 'm76' }, away: { type: 'match-winner', match: 'm78' } },
        { id: 'm92', date: '2026-07-05', home: { type: 'match-winner', match: 'm79' }, away: { type: 'match-winner', match: 'm80' } },
        { id: 'm93', date: '2026-07-06', home: { type: 'match-winner', match: 'm83' }, away: { type: 'match-winner', match: 'm84' } },
        { id: 'm94', date: '2026-07-06', home: { type: 'match-winner', match: 'm81' }, away: { type: 'match-winner', match: 'm82' } },
        { id: 'm95', date: '2026-07-07', home: { type: 'match-winner', match: 'm86' }, away: { type: 'match-winner', match: 'm88' } },
        { id: 'm96', date: '2026-07-07', home: { type: 'match-winner', match: 'm85' }, away: { type: 'match-winner', match: 'm87' } },
      ],
    },
    {
      id: 'qf',
      name: 'Quarter-finals',
      matches: [
        { id: 'm97', date: '2026-07-09', home: { type: 'match-winner', match: 'm89' }, away: { type: 'match-winner', match: 'm90' } },
        { id: 'm98', date: '2026-07-10', home: { type: 'match-winner', match: 'm93' }, away: { type: 'match-winner', match: 'm94' } },
        { id: 'm99', date: '2026-07-11', home: { type: 'match-winner', match: 'm91' }, away: { type: 'match-winner', match: 'm92' } },
        { id: 'm100', date: '2026-07-11', home: { type: 'match-winner', match: 'm95' }, away: { type: 'match-winner', match: 'm96' } },
      ],
    },
    {
      id: 'sf',
      name: 'Semi-finals',
      matches: [
        { id: 'm101', date: '2026-07-14', home: { type: 'match-winner', match: 'm97' }, away: { type: 'match-winner', match: 'm98' } },
        { id: 'm102', date: '2026-07-15', home: { type: 'match-winner', match: 'm99' }, away: { type: 'match-winner', match: 'm100' } },
      ],
    },
    {
      id: 'third-place',
      name: 'Third-place play-off',
      matches: [
        { id: 'm103', date: '2026-07-18', home: { type: 'match-loser', match: 'm101' }, away: { type: 'match-loser', match: 'm102' } },
      ],
    },
    {
      id: 'final',
      name: 'Final',
      matches: [
        { id: 'm104', date: '2026-07-19', home: { type: 'match-winner', match: 'm101' }, away: { type: 'match-winner', match: 'm102' } },
      ],
    },
  ],
}
