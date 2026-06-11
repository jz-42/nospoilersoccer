import type { Tournament } from './types'

/**
 * FIFA World Cup Qatar 2022 — complete results.
 * Knockout match ids follow FIFA's official numbering (49–64).
 * Highlight videos are curated separately and filled in over time.
 */
export const wc2022: Tournament = {
  id: 'wc2022',
  name: 'World Cup 2022',
  year: 2022,
  advancingRanks: [1, 2],

  teams: {
    QAT: { id: 'QAT', name: 'Qatar', flag: '🇶🇦' },
    ECU: { id: 'ECU', name: 'Ecuador', flag: '🇪🇨' },
    SEN: { id: 'SEN', name: 'Senegal', flag: '🇸🇳' },
    NED: { id: 'NED', name: 'Netherlands', flag: '🇳🇱' },
    ENG: { id: 'ENG', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    IRN: { id: 'IRN', name: 'Iran', flag: '🇮🇷' },
    USA: { id: 'USA', name: 'United States', flag: '🇺🇸' },
    WAL: { id: 'WAL', name: 'Wales', flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
    ARG: { id: 'ARG', name: 'Argentina', flag: '🇦🇷' },
    KSA: { id: 'KSA', name: 'Saudi Arabia', flag: '🇸🇦' },
    MEX: { id: 'MEX', name: 'Mexico', flag: '🇲🇽' },
    POL: { id: 'POL', name: 'Poland', flag: '🇵🇱' },
    FRA: { id: 'FRA', name: 'France', flag: '🇫🇷' },
    AUS: { id: 'AUS', name: 'Australia', flag: '🇦🇺' },
    DEN: { id: 'DEN', name: 'Denmark', flag: '🇩🇰' },
    TUN: { id: 'TUN', name: 'Tunisia', flag: '🇹🇳' },
    ESP: { id: 'ESP', name: 'Spain', flag: '🇪🇸' },
    CRC: { id: 'CRC', name: 'Costa Rica', flag: '🇨🇷' },
    GER: { id: 'GER', name: 'Germany', flag: '🇩🇪' },
    JPN: { id: 'JPN', name: 'Japan', flag: '🇯🇵' },
    BEL: { id: 'BEL', name: 'Belgium', flag: '🇧🇪' },
    CAN: { id: 'CAN', name: 'Canada', flag: '🇨🇦' },
    MAR: { id: 'MAR', name: 'Morocco', flag: '🇲🇦' },
    CRO: { id: 'CRO', name: 'Croatia', flag: '🇭🇷' },
    BRA: { id: 'BRA', name: 'Brazil', flag: '🇧🇷' },
    SRB: { id: 'SRB', name: 'Serbia', flag: '🇷🇸' },
    SUI: { id: 'SUI', name: 'Switzerland', flag: '🇨🇭' },
    CMR: { id: 'CMR', name: 'Cameroon', flag: '🇨🇲' },
    POR: { id: 'POR', name: 'Portugal', flag: '🇵🇹' },
    GHA: { id: 'GHA', name: 'Ghana', flag: '🇬🇭' },
    URU: { id: 'URU', name: 'Uruguay', flag: '🇺🇾' },
    KOR: { id: 'KOR', name: 'South Korea', flag: '🇰🇷' },
  },

  groups: [
    { id: 'A', teams: ['QAT', 'ECU', 'SEN', 'NED'] },
    { id: 'B', teams: ['ENG', 'IRN', 'USA', 'WAL'] },
    { id: 'C', teams: ['ARG', 'KSA', 'MEX', 'POL'] },
    { id: 'D', teams: ['FRA', 'AUS', 'DEN', 'TUN'] },
    { id: 'E', teams: ['ESP', 'CRC', 'GER', 'JPN'] },
    { id: 'F', teams: ['BEL', 'CAN', 'MAR', 'CRO'] },
    { id: 'G', teams: ['BRA', 'SRB', 'SUI', 'CMR'] },
    { id: 'H', teams: ['POR', 'GHA', 'URU', 'KOR'] },
  ],

  groupMatches: [
    // Group A
    { id: 'A1', group: 'A', matchday: 1, date: '2022-11-20', home: 'QAT', away: 'ECU', score: { home: 0, away: 2 } },
    { id: 'A2', group: 'A', matchday: 1, date: '2022-11-21', home: 'SEN', away: 'NED', score: { home: 0, away: 2 } },
    { id: 'A3', group: 'A', matchday: 2, date: '2022-11-25', home: 'QAT', away: 'SEN', score: { home: 1, away: 3 } },
    { id: 'A4', group: 'A', matchday: 2, date: '2022-11-25', home: 'NED', away: 'ECU', score: { home: 1, away: 1 } },
    { id: 'A5', group: 'A', matchday: 3, date: '2022-11-29', home: 'ECU', away: 'SEN', score: { home: 1, away: 2 } },
    { id: 'A6', group: 'A', matchday: 3, date: '2022-11-29', home: 'NED', away: 'QAT', score: { home: 2, away: 0 } },
    // Group B
    { id: 'B1', group: 'B', matchday: 1, date: '2022-11-21', home: 'ENG', away: 'IRN', score: { home: 6, away: 2 } },
    { id: 'B2', group: 'B', matchday: 1, date: '2022-11-21', home: 'USA', away: 'WAL', score: { home: 1, away: 1 } },
    { id: 'B3', group: 'B', matchday: 2, date: '2022-11-25', home: 'WAL', away: 'IRN', score: { home: 0, away: 2 } },
    { id: 'B4', group: 'B', matchday: 2, date: '2022-11-25', home: 'ENG', away: 'USA', score: { home: 0, away: 0 } },
    { id: 'B5', group: 'B', matchday: 3, date: '2022-11-29', home: 'WAL', away: 'ENG', score: { home: 0, away: 3 } },
    { id: 'B6', group: 'B', matchday: 3, date: '2022-11-29', home: 'IRN', away: 'USA', score: { home: 0, away: 1 } },
    // Group C
    { id: 'C1', group: 'C', matchday: 1, date: '2022-11-22', home: 'ARG', away: 'KSA', score: { home: 1, away: 2 } },
    { id: 'C2', group: 'C', matchday: 1, date: '2022-11-22', home: 'MEX', away: 'POL', score: { home: 0, away: 0 } },
    { id: 'C3', group: 'C', matchday: 2, date: '2022-11-26', home: 'POL', away: 'KSA', score: { home: 2, away: 0 } },
    { id: 'C4', group: 'C', matchday: 2, date: '2022-11-26', home: 'ARG', away: 'MEX', score: { home: 2, away: 0 } },
    { id: 'C5', group: 'C', matchday: 3, date: '2022-11-30', home: 'POL', away: 'ARG', score: { home: 0, away: 2 } },
    { id: 'C6', group: 'C', matchday: 3, date: '2022-11-30', home: 'KSA', away: 'MEX', score: { home: 1, away: 2 } },
    // Group D
    { id: 'D1', group: 'D', matchday: 1, date: '2022-11-22', home: 'DEN', away: 'TUN', score: { home: 0, away: 0 } },
    { id: 'D2', group: 'D', matchday: 1, date: '2022-11-22', home: 'FRA', away: 'AUS', score: { home: 4, away: 1 } },
    { id: 'D3', group: 'D', matchday: 2, date: '2022-11-26', home: 'TUN', away: 'AUS', score: { home: 0, away: 1 } },
    { id: 'D4', group: 'D', matchday: 2, date: '2022-11-26', home: 'FRA', away: 'DEN', score: { home: 2, away: 1 } },
    { id: 'D5', group: 'D', matchday: 3, date: '2022-11-30', home: 'AUS', away: 'DEN', score: { home: 1, away: 0 } },
    { id: 'D6', group: 'D', matchday: 3, date: '2022-11-30', home: 'TUN', away: 'FRA', score: { home: 1, away: 0 } },
    // Group E
    { id: 'E1', group: 'E', matchday: 1, date: '2022-11-23', home: 'GER', away: 'JPN', score: { home: 1, away: 2 } },
    { id: 'E2', group: 'E', matchday: 1, date: '2022-11-23', home: 'ESP', away: 'CRC', score: { home: 7, away: 0 } },
    { id: 'E3', group: 'E', matchday: 2, date: '2022-11-27', home: 'JPN', away: 'CRC', score: { home: 0, away: 1 } },
    { id: 'E4', group: 'E', matchday: 2, date: '2022-11-27', home: 'ESP', away: 'GER', score: { home: 1, away: 1 } },
    { id: 'E5', group: 'E', matchday: 3, date: '2022-12-01', home: 'JPN', away: 'ESP', score: { home: 2, away: 1 } },
    { id: 'E6', group: 'E', matchday: 3, date: '2022-12-01', home: 'CRC', away: 'GER', score: { home: 2, away: 4 } },
    // Group F
    { id: 'F1', group: 'F', matchday: 1, date: '2022-11-23', home: 'MAR', away: 'CRO', score: { home: 0, away: 0 } },
    { id: 'F2', group: 'F', matchday: 1, date: '2022-11-23', home: 'BEL', away: 'CAN', score: { home: 1, away: 0 } },
    { id: 'F3', group: 'F', matchday: 2, date: '2022-11-27', home: 'BEL', away: 'MAR', score: { home: 0, away: 2 } },
    { id: 'F4', group: 'F', matchday: 2, date: '2022-11-27', home: 'CRO', away: 'CAN', score: { home: 4, away: 1 } },
    { id: 'F5', group: 'F', matchday: 3, date: '2022-12-01', home: 'CRO', away: 'BEL', score: { home: 0, away: 0 } },
    { id: 'F6', group: 'F', matchday: 3, date: '2022-12-01', home: 'CAN', away: 'MAR', score: { home: 1, away: 2 } },
    // Group G
    { id: 'G1', group: 'G', matchday: 1, date: '2022-11-24', home: 'SUI', away: 'CMR', score: { home: 1, away: 0 } },
    { id: 'G2', group: 'G', matchday: 1, date: '2022-11-24', home: 'BRA', away: 'SRB', score: { home: 2, away: 0 } },
    { id: 'G3', group: 'G', matchday: 2, date: '2022-11-28', home: 'CMR', away: 'SRB', score: { home: 3, away: 3 } },
    { id: 'G4', group: 'G', matchday: 2, date: '2022-11-28', home: 'BRA', away: 'SUI', score: { home: 1, away: 0 } },
    { id: 'G5', group: 'G', matchday: 3, date: '2022-12-02', home: 'SRB', away: 'SUI', score: { home: 2, away: 3 } },
    { id: 'G6', group: 'G', matchday: 3, date: '2022-12-02', home: 'CMR', away: 'BRA', score: { home: 1, away: 0 } },
    // Group H
    { id: 'H1', group: 'H', matchday: 1, date: '2022-11-24', home: 'URU', away: 'KOR', score: { home: 0, away: 0 } },
    { id: 'H2', group: 'H', matchday: 1, date: '2022-11-24', home: 'POR', away: 'GHA', score: { home: 3, away: 2 } },
    { id: 'H3', group: 'H', matchday: 2, date: '2022-11-28', home: 'KOR', away: 'GHA', score: { home: 2, away: 3 } },
    { id: 'H4', group: 'H', matchday: 2, date: '2022-11-28', home: 'POR', away: 'URU', score: { home: 2, away: 0 } },
    { id: 'H5', group: 'H', matchday: 3, date: '2022-12-02', home: 'GHA', away: 'URU', score: { home: 0, away: 2 } },
    { id: 'H6', group: 'H', matchday: 3, date: '2022-12-02', home: 'KOR', away: 'POR', score: { home: 2, away: 1 } },
  ],

  knockoutRounds: [
    {
      id: 'r16',
      name: 'Round of 16',
      matches: [
        {
          id: 'm49', date: '2022-12-03',
          home: { type: 'group-rank', group: 'A', rank: 1 }, away: { type: 'group-rank', group: 'B', rank: 2 },
          homeTeam: 'NED', awayTeam: 'USA', score: { home: 3, away: 1 },
        },
        {
          id: 'm50', date: '2022-12-03',
          home: { type: 'group-rank', group: 'C', rank: 1 }, away: { type: 'group-rank', group: 'D', rank: 2 },
          homeTeam: 'ARG', awayTeam: 'AUS', score: { home: 2, away: 1 },
        },
        {
          id: 'm51', date: '2022-12-04',
          home: { type: 'group-rank', group: 'D', rank: 1 }, away: { type: 'group-rank', group: 'C', rank: 2 },
          homeTeam: 'FRA', awayTeam: 'POL', score: { home: 3, away: 1 },
        },
        {
          id: 'm52', date: '2022-12-04',
          home: { type: 'group-rank', group: 'B', rank: 1 }, away: { type: 'group-rank', group: 'A', rank: 2 },
          homeTeam: 'ENG', awayTeam: 'SEN', score: { home: 3, away: 0 },
        },
        {
          id: 'm53', date: '2022-12-05',
          home: { type: 'group-rank', group: 'E', rank: 1 }, away: { type: 'group-rank', group: 'F', rank: 2 },
          homeTeam: 'JPN', awayTeam: 'CRO', score: { home: 1, away: 1 },
          afterExtraTime: true, penalties: { home: 1, away: 3 },
        },
        {
          id: 'm54', date: '2022-12-05',
          home: { type: 'group-rank', group: 'G', rank: 1 }, away: { type: 'group-rank', group: 'H', rank: 2 },
          homeTeam: 'BRA', awayTeam: 'KOR', score: { home: 4, away: 1 },
        },
        {
          id: 'm55', date: '2022-12-06',
          home: { type: 'group-rank', group: 'F', rank: 1 }, away: { type: 'group-rank', group: 'E', rank: 2 },
          homeTeam: 'MAR', awayTeam: 'ESP', score: { home: 0, away: 0 },
          afterExtraTime: true, penalties: { home: 3, away: 0 },
        },
        {
          id: 'm56', date: '2022-12-06',
          home: { type: 'group-rank', group: 'H', rank: 1 }, away: { type: 'group-rank', group: 'G', rank: 2 },
          homeTeam: 'POR', awayTeam: 'SUI', score: { home: 6, away: 1 },
        },
      ],
    },
    {
      id: 'qf',
      name: 'Quarter-finals',
      matches: [
        {
          id: 'm57', date: '2022-12-09',
          home: { type: 'match-winner', match: 'm53' }, away: { type: 'match-winner', match: 'm54' },
          homeTeam: 'CRO', awayTeam: 'BRA', score: { home: 1, away: 1 },
          afterExtraTime: true, penalties: { home: 4, away: 2 },
        },
        {
          id: 'm58', date: '2022-12-09',
          home: { type: 'match-winner', match: 'm49' }, away: { type: 'match-winner', match: 'm50' },
          homeTeam: 'NED', awayTeam: 'ARG', score: { home: 2, away: 2 },
          afterExtraTime: true, penalties: { home: 3, away: 4 },
        },
        {
          id: 'm59', date: '2022-12-10',
          home: { type: 'match-winner', match: 'm55' }, away: { type: 'match-winner', match: 'm56' },
          homeTeam: 'MAR', awayTeam: 'POR', score: { home: 1, away: 0 },
        },
        {
          id: 'm60', date: '2022-12-10',
          home: { type: 'match-winner', match: 'm52' }, away: { type: 'match-winner', match: 'm51' },
          homeTeam: 'ENG', awayTeam: 'FRA', score: { home: 1, away: 2 },
        },
      ],
    },
    {
      id: 'sf',
      name: 'Semi-finals',
      matches: [
        {
          id: 'm61', date: '2022-12-13',
          home: { type: 'match-winner', match: 'm58' }, away: { type: 'match-winner', match: 'm57' },
          homeTeam: 'ARG', awayTeam: 'CRO', score: { home: 3, away: 0 },
        },
        {
          id: 'm62', date: '2022-12-14',
          home: { type: 'match-winner', match: 'm60' }, away: { type: 'match-winner', match: 'm59' },
          homeTeam: 'FRA', awayTeam: 'MAR', score: { home: 2, away: 0 },
        },
      ],
    },
    {
      id: 'third-place',
      name: 'Third-place play-off',
      matches: [
        {
          id: 'm63', date: '2022-12-17',
          home: { type: 'match-loser', match: 'm61' }, away: { type: 'match-loser', match: 'm62' },
          homeTeam: 'CRO', awayTeam: 'MAR', score: { home: 2, away: 1 },
        },
      ],
    },
    {
      id: 'final',
      name: 'Final',
      matches: [
        {
          id: 'm64', date: '2022-12-18',
          home: { type: 'match-winner', match: 'm61' }, away: { type: 'match-winner', match: 'm62' },
          homeTeam: 'ARG', awayTeam: 'FRA', score: { home: 3, away: 3 },
          afterExtraTime: true, penalties: { home: 4, away: 2 },
          videos: [{ youtubeId: 'Mxkg3qLIPC8', kind: 'normal', durationSeconds: 299 }],
        },
      ],
    },
  ],
}
