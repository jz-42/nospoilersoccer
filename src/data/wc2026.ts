import type { Tournament } from './types'
import { WC2026_BEST_THIRD_ALLOCATION } from './wc2026-third-place'

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
  bestThirdAllocation: WC2026_BEST_THIRD_ALLOCATION,

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
    { id: 'A1', group: 'A', matchday: 1, date: '2026-06-11', kickoff: '2026-06-11T19:00Z', home: 'MEX', away: 'RSA', odds: { home: 0.685, draw: 0.215, away: 0.105, url: 'https://polymarket.com/event/fifwc-mex-rsa-2026-06-11' }, score: { home: 2, away: 0 }, goals: [{ team: 'MEX', player: "Julián Quiñones", minute: "9'" }, { team: 'MEX', player: "Raúl Jiménez", minute: "67'" }], videos: [{ youtubeId: 'r1Afsds3ZD0', kind: 'extended', durationSeconds: 1400 }] },
    { id: 'A2', group: 'A', matchday: 1, date: '2026-06-11', kickoff: '2026-06-12T02:00Z', home: 'KOR', away: 'CZE', score: { home: 2, away: 1 }, goals: [{ team: 'CZE', player: "Ladislav Krejcí", minute: "59'" }, { team: 'KOR', player: "Hwang In-Beom", minute: "67'" }, { team: 'KOR', player: "Oh Hyeon-Gyu", minute: "80'" }] , videos: [{ youtubeId: 'QWoDfCkh7f8', kind: 'extended', durationSeconds: 1335 }] },
    { id: 'A3', group: 'A', matchday: 2, date: '2026-06-18', kickoff: '2026-06-18T16:00Z', home: 'CZE', away: 'RSA', score: { home: 1, away: 1 }, goals: [{ team: 'CZE', player: "Michal Sadílek", minute: "6'" }, { team: 'RSA', player: "Teboho Mokoena", minute: "83'", penalty: true }], odds: { home: 0.595, draw: 0.235, away: 0.175, url: 'https://polymarket.com/event/fifwc-cze-rsa-2026-06-18' } },
    { id: 'A4', group: 'A', matchday: 2, date: '2026-06-18', kickoff: '2026-06-19T01:00Z', home: 'MEX', away: 'KOR', score: { home: 1, away: 0 }, goals: [{ team: 'MEX', player: "Luis Romo", minute: "50'" }] },
    { id: 'A5', group: 'A', matchday: 3, date: '2026-06-24', kickoff: '2026-06-25T01:00Z', home: 'CZE', away: 'MEX', score: { home: 0, away: 3 }, goals: [{ team: 'MEX', player: "Mateo Chávez", minute: "55'" }, { team: 'MEX', player: "Julián Quiñones", minute: "61'" }, { team: 'MEX', player: "Álvaro Fidalgo", minute: "90'+4'" }], odds: { home: 0.205, draw: 0.265, away: 0.535, url: 'https://polymarket.com/event/fifwc-cze-mex-2026-06-24' } },
    { id: 'A6', group: 'A', matchday: 3, date: '2026-06-24', kickoff: '2026-06-25T01:00Z', home: 'RSA', away: 'KOR', score: { home: 1, away: 0 }, goals: [{ team: 'RSA', player: "Thapelo Maseko", minute: "63'" }] },
    // Group B
    { id: 'B1', group: 'B', matchday: 1, date: '2026-06-12', kickoff: '2026-06-12T19:00Z', home: 'CAN', away: 'BIH', score: { home: 1, away: 1 }, goals: [{ team: 'BIH', player: "Jovo Lukic", minute: "21'" }, { team: 'CAN', player: "Cyle Larin", minute: "78'" }], odds: { home: 0.525, draw: 0.265, away: 0.215, url: 'https://polymarket.com/event/fifwc-can-bih-2026-06-12' }, videos: [{ youtubeId: 'cPwJaA22gWc', kind: 'extended', durationSeconds: 1262 }, { youtubeId: 'n5qkHOWhFAc', kind: 'normal', durationSeconds: 257 }] },
    { id: 'B2', group: 'B', matchday: 1, date: '2026-06-13', kickoff: '2026-06-13T19:00Z', home: 'QAT', away: 'SUI', odds: { home: 0.054, draw: 0.115, away: 0.825, url: 'https://polymarket.com/event/fifwc-qat-che-2026-06-13' }, score: { home: 1, away: 1 }, goals: [{ team: 'SUI', player: "Breel Embolo", minute: "17'", penalty: true }, { team: 'QAT', player: "Boualem Khoukhi", minute: "90'+4'" }], videos: [{ youtubeId: 'jSJs2nPJeLo', kind: 'extended', durationSeconds: 1268 }, { youtubeId: 'CUo5J7CUnCo', kind: 'normal', durationSeconds: 526 }] },
    { id: 'B3', group: 'B', matchday: 2, date: '2026-06-18', kickoff: '2026-06-18T19:00Z', home: 'SUI', away: 'BIH', score: { home: 4, away: 1 }, goals: [{ team: 'SUI', player: "Johan Manzambi", minute: "74'" }, { team: 'SUI', player: "Rubén Vargas", minute: "84'" }, { team: 'SUI', player: "Johan Manzambi", minute: "90'" }, { team: 'BIH', player: "Ermin Mahmic", minute: "90'+3'" }, { team: 'SUI', player: "Granit Xhaka", minute: "90'+7'", penalty: true }], odds: { home: 0.615, draw: 0.235, away: 0.155, url: 'https://polymarket.com/event/fifwc-che-bih-2026-06-18' } },
    { id: 'B4', group: 'B', matchday: 2, date: '2026-06-18', kickoff: '2026-06-18T22:00Z', home: 'CAN', away: 'QAT', score: { home: 6, away: 0 }, goals: [{ team: 'CAN', player: "Cyle Larin", minute: "16'" }, { team: 'CAN', player: "Jonathan David", minute: "29'" }, { team: 'CAN', player: "Jonathan David", minute: "45'+3'" }, { team: 'CAN', player: "Nathan Saliba", minute: "64'" }, { team: 'CAN', player: "Mohamed Manai", minute: "75'", ownGoal: true }, { team: 'CAN', player: "Jonathan David", minute: "90'+2'" }], odds: { home: 0.745, draw: 0.175, away: 0.085, url: 'https://polymarket.com/event/fifwc-can-qat-2026-06-18' } },
    { id: 'B5', group: 'B', matchday: 3, date: '2026-06-24', kickoff: '2026-06-24T19:00Z', home: 'SUI', away: 'CAN', score: { home: 2, away: 1 }, goals: [{ team: 'SUI', player: "Rubén Vargas", minute: "46'" }, { team: 'SUI', player: "Johan Manzambi", minute: "57'" }, { team: 'CAN', player: "Promise David", minute: "76'" }], odds: { home: 0.445, draw: 0.285, away: 0.275, url: 'https://polymarket.com/event/fifwc-che-can-2026-06-24' } },
    { id: 'B6', group: 'B', matchday: 3, date: '2026-06-24', kickoff: '2026-06-24T19:00Z', home: 'BIH', away: 'QAT', score: { home: 3, away: 1 }, goals: [{ team: 'BIH', player: "Kerim Alajbegovic", minute: "29'" }, { team: 'BIH', player: "Mahmoud Abunada", minute: "34'", ownGoal: true }, { team: 'QAT', player: "Hassan Al-Haydos", minute: "42'" }, { team: 'BIH', player: "Ermin Mahmic", minute: "80'" }], odds: { home: 0.585, draw: 0.255, away: 0.155, url: 'https://polymarket.com/event/fifwc-bih-qat-2026-06-24' } },
    // Group C
    { id: 'C1', group: 'C', matchday: 1, date: '2026-06-13', kickoff: '2026-06-13T22:00Z', home: 'BRA', away: 'MAR', score: { home: 1, away: 1 }, goals: [{ team: 'MAR', player: "Ismael Saibari", minute: "21'" }, { team: 'BRA', player: "Vinícius Júnior", minute: "32'" }], odds: { home: 0.585, draw: 0.245, away: 0.165, url: 'https://polymarket.com/event/fifwc-bra-mar-2026-06-13' }, videos: [{ youtubeId: '0rih2fCaXF4', kind: 'extended', durationSeconds: 1278 }, { youtubeId: 'DX5wBEslnQI', kind: 'normal', durationSeconds: 488 }] },
    { id: 'C2', group: 'C', matchday: 1, date: '2026-06-13', kickoff: '2026-06-14T01:00Z', home: 'HAI', away: 'SCO', score: { home: 0, away: 1 }, goals: [{ team: 'SCO', player: "John McGinn", minute: "28'" }], odds: { home: 0.155, draw: 0.225, away: 0.615, url: 'https://polymarket.com/event/fifwc-hai-sco-2026-06-13' }, videos: [{ youtubeId: 'J_2Y34vSbBA', kind: 'extended', durationSeconds: 1222 }, { youtubeId: 'IW2BuhWuTqs', kind: 'normal', durationSeconds: 497 }] },
    { id: 'C3', group: 'C', matchday: 2, date: '2026-06-19', kickoff: '2026-06-19T22:00Z', home: 'SCO', away: 'MAR', score: { home: 0, away: 1 }, goals: [{ team: 'MAR', player: "Ismael Saibari", minute: "2'" }], odds: { home: 0.225, draw: 0.285, away: 0.495, url: 'https://polymarket.com/event/fifwc-sco-mar-2026-06-19' } },
    { id: 'C4', group: 'C', matchday: 2, date: '2026-06-19', kickoff: '2026-06-20T00:30Z', home: 'BRA', away: 'HAI', score: { home: 3, away: 0 }, goals: [{ team: 'BRA', player: "Matheus Cunha", minute: "23'" }, { team: 'BRA', player: "Matheus Cunha", minute: "36'" }, { team: 'BRA', player: "Vinícius Júnior", minute: "45'+3'" }], odds: { home: 0.905, draw: 0.0615, away: 0.034, url: 'https://polymarket.com/event/fifwc-bra-hai-2026-06-19' } },
    { id: 'C5', group: 'C', matchday: 3, date: '2026-06-24', kickoff: '2026-06-24T22:00Z', home: 'SCO', away: 'BRA', score: { home: 0, away: 3 }, goals: [{ team: 'BRA', player: "Vinícius Júnior", minute: "7'" }, { team: 'BRA', player: "Vinícius Júnior", minute: "45'+3'" }, { team: 'BRA', player: "Matheus Cunha", minute: "60'" }], odds: { home: 0.155, draw: 0.195, away: 0.665, url: 'https://polymarket.com/event/fifwc-sco-bra-2026-06-24' } },
    { id: 'C6', group: 'C', matchday: 3, date: '2026-06-24', kickoff: '2026-06-24T22:00Z', home: 'MAR', away: 'HAI', score: { home: 4, away: 2 }, goals: [{ team: 'HAI', player: "Yassine Bounou", minute: "10'", ownGoal: true }, { team: 'MAR', player: "Achraf Hakimi", minute: "39'" }, { team: 'HAI', player: "Wilson Isidor", minute: "43'" }, { team: 'MAR', player: "Ismael Saibari", minute: "45'+1'" }, { team: 'MAR', player: "Soufiane Rahimi", minute: "78'" }, { team: 'MAR', player: "Gessime Yassine", minute: "89'" }], odds: { home: 0.735, draw: 0.175, away: 0.085, url: 'https://polymarket.com/event/fifwc-mar-hai-2026-06-24' } },
    // Group D
    { id: 'D1', group: 'D', matchday: 1, date: '2026-06-12', kickoff: '2026-06-13T01:00Z', home: 'USA', away: 'PAR', score: { home: 4, away: 1 }, goals: [{ team: 'USA', player: "Damián Bobadilla", minute: "7'", ownGoal: true }, { team: 'USA', player: "Folarin Balogun", minute: "31'" }, { team: 'USA', player: "Folarin Balogun", minute: "45'+5'" }, { team: 'PAR', player: "Maurício", minute: "73'" }, { team: 'USA', player: "Giovanni Reyna", minute: "90'+8'" }], odds: { home: 0.495, draw: 0.275, away: 0.225, url: 'https://polymarket.com/event/fifwc-usa-par-2026-06-12' }, videos: [{ youtubeId: 'lpDZwAxVkc4', kind: 'extended', durationSeconds: 1403 }, { youtubeId: 'BXD1_mhODBU', kind: 'normal', durationSeconds: 287 }] },
    { id: 'D2', group: 'D', matchday: 1, date: '2026-06-14', kickoff: '2026-06-14T04:00Z', home: 'AUS', away: 'TUR', odds: { home: 0.175, draw: 0.265, away: 0.565, url: 'https://polymarket.com/event/fifwc-aus-tur-2026-06-14' }, score: { home: 2, away: 0 }, goals: [{ team: 'AUS', player: "Nestory Irankunda", minute: "27'" }, { team: 'AUS', player: "Connor Metcalfe", minute: "75'" }], videos: [{ youtubeId: 'LgT_qQktvjw', kind: 'extended', durationSeconds: 1276 }, { youtubeId: 'xyKJHekC7io', kind: 'normal', durationSeconds: 499 }] },
    { id: 'D3', group: 'D', matchday: 2, date: '2026-06-19', kickoff: '2026-06-19T19:00Z', home: 'USA', away: 'AUS', score: { home: 2, away: 0 }, goals: [{ team: 'USA', player: "Cameron Burgess", minute: "11'", ownGoal: true }, { team: 'USA', player: "Alex Freeman", minute: "43'" }], odds: { home: 0.565, draw: 0.245, away: 0.205, url: 'https://polymarket.com/event/fifwc-usa-aus-2026-06-19' } },
    { id: 'D4', group: 'D', matchday: 2, date: '2026-06-19', kickoff: '2026-06-20T03:00Z', home: 'TUR', away: 'PAR', score: { home: 0, away: 1 }, goals: [{ team: 'PAR', player: "Matías Galarza", minute: "2'" }], odds: { home: 0.435, draw: 0.305, away: 0.275, url: 'https://polymarket.com/event/fifwc-tur-par-2026-06-19' } },
    { id: 'D5', group: 'D', matchday: 3, date: '2026-06-25', kickoff: '2026-06-26T02:00Z', home: 'TUR', away: 'USA', score: { home: 3, away: 2 }, goals: [{ team: 'USA', player: "Auston Trusty", minute: "3'" }, { team: 'TUR', player: "Arda Güler", minute: "10'" }, { team: 'TUR', player: "Baris Alper Yilmaz", minute: "31'" }, { team: 'USA', player: "Sebastian Berhalter", minute: "49'" }, { team: 'TUR', player: "Kaan Ayhan", minute: "90'+8'" }], odds: { home: 0.375, draw: 0.265, away: 0.375, url: 'https://polymarket.com/event/fifwc-tur-usa-2026-06-25' } },
    { id: 'D6', group: 'D', matchday: 3, date: '2026-06-25', kickoff: '2026-06-26T02:00Z', home: 'PAR', away: 'AUS', score: { home: 0, away: 0 }, goals: [], odds: { home: 0.455, draw: 0.305, away: 0.26, url: 'https://polymarket.com/event/fifwc-par-aus-2026-06-25' } },
    // Group E
    { id: 'E1', group: 'E', matchday: 1, date: '2026-06-14', kickoff: '2026-06-14T17:00Z', home: 'GER', away: 'CUW', odds: { home: 0.941, draw: 0.04, away: 0.024, url: 'https://polymarket.com/event/fifwc-ger-kor-2026-06-14' }, score: { home: 7, away: 1 }, goals: [{ team: 'GER', player: "Felix Nmecha", minute: "6'" }, { team: 'CUW', player: "Livano Comenencia", minute: "21'" }, { team: 'GER', player: "Nico Schlotterbeck", minute: "38'" }, { team: 'GER', player: "Kai Havertz", minute: "45'+5'", penalty: true }, { team: 'GER', player: "Jamal Musiala", minute: "47'" }, { team: 'GER', player: "Nathaniel Brown", minute: "68'" }, { team: 'GER', player: "Deniz Undav", minute: "78'" }, { team: 'GER', player: "Kai Havertz", minute: "88'" }], videos: [{ youtubeId: 'xHtIzadh4Lg', kind: 'extended', durationSeconds: 1459 }, { youtubeId: 'cGKWqfsRDgo', kind: 'normal', durationSeconds: 530 }] },
    { id: 'E2', group: 'E', matchday: 1, date: '2026-06-14', kickoff: '2026-06-14T23:00Z', home: 'CIV', away: 'ECU', score: { home: 1, away: 0 }, goals: [{ team: 'CIV', player: "Amad Diallo", minute: "90'" }], odds: { home: 0.275, draw: 0.335, away: 0.385, url: 'https://polymarket.com/event/fifwc-civ-ecu-2026-06-14' } },
    { id: 'E3', group: 'E', matchday: 2, date: '2026-06-20', kickoff: '2026-06-20T20:00Z', home: 'GER', away: 'CIV', score: { home: 2, away: 1 }, goals: [{ team: 'CIV', player: "Franck Kessié", minute: "30'" }, { team: 'GER', player: "Deniz Undav", minute: "68'" }, { team: 'GER', player: "Deniz Undav", minute: "90'+4'" }], odds: { home: 0.625, draw: 0.205, away: 0.165, url: 'https://polymarket.com/event/fifwc-ger-civ-2026-06-20' } },
    { id: 'E4', group: 'E', matchday: 2, date: '2026-06-20', kickoff: '2026-06-21T00:00Z', home: 'ECU', away: 'CUW', score: { home: 0, away: 0 }, goals: [], odds: { home: 0.855, draw: 0.105, away: 0.048, url: 'https://polymarket.com/event/fifwc-ecu-kor-2026-06-20' } },
    { id: 'E5', group: 'E', matchday: 3, date: '2026-06-25', kickoff: '2026-06-25T20:00Z', home: 'ECU', away: 'GER', score: { home: 2, away: 1 }, goals: [{ team: 'GER', player: "Leroy Sané", minute: "2'" }, { team: 'ECU', player: "Nilson Angulo", minute: "9'" }, { team: 'ECU', player: "Gonzalo Plata", minute: "77'" }], odds: { home: 0.195, draw: 0.255, away: 0.565, url: 'https://polymarket.com/event/fifwc-ecu-ger-2026-06-25' } },
    { id: 'E6', group: 'E', matchday: 3, date: '2026-06-25', kickoff: '2026-06-25T20:00Z', home: 'CUW', away: 'CIV', score: { home: 0, away: 2 }, goals: [{ team: 'CIV', player: "Nicolas Pépé", minute: "7'" }, { team: 'CIV', player: "Nicolas Pépé", minute: "64'" }], odds: { home: 0.065, draw: 0.115, away: 0.815, url: 'https://polymarket.com/event/fifwc-kor-civ-2026-06-25' } },
    // Group F
    { id: 'F1', group: 'F', matchday: 1, date: '2026-06-14', kickoff: '2026-06-14T20:00Z', home: 'NED', away: 'JPN', score: { home: 2, away: 2 }, goals: [{ team: 'NED', player: "Virgil van Dijk", minute: "51'" }, { team: 'JPN', player: "Keito Nakamura", minute: "57'" }, { team: 'NED', player: "Crysencio Summerville", minute: "64'" }, { team: 'JPN', player: "Daichi Kamada", minute: "88'" }] , odds: { home: 0.485, draw: 0.275, away: 0.245, url: 'https://polymarket.com/event/fifwc-nld-jpn-2026-06-14' } },
    { id: 'F2', group: 'F', matchday: 1, date: '2026-06-14', kickoff: '2026-06-15T02:00Z', home: 'SWE', away: 'TUN', score: { home: 5, away: 1 }, goals: [{ team: 'SWE', player: "Yasin Ayari", minute: "7'" }, { team: 'SWE', player: "Alexander Isak", minute: "30'" }, { team: 'TUN', player: "Omar Rekik", minute: "43'" }, { team: 'SWE', player: "Viktor Gyökeres", minute: "59'" }, { team: 'SWE', player: "Mattias Svanberg", minute: "84'" }, { team: 'SWE', player: "Yasin Ayari", minute: "90'+6'" }], odds: { home: 0.505, draw: 0.275, away: 0.215, url: 'https://polymarket.com/event/fifwc-swe-tun-2026-06-14' } },
    { id: 'F3', group: 'F', matchday: 2, date: '2026-06-20', kickoff: '2026-06-20T17:00Z', home: 'NED', away: 'SWE', score: { home: 5, away: 1 }, goals: [{ team: 'NED', player: "Brian Brobbey", minute: "5'" }, { team: 'NED', player: "Brian Brobbey", minute: "17'" }, { team: 'NED', player: "Cody Gakpo", minute: "47'" }, { team: 'NED', player: "Cody Gakpo", minute: "54'" }, { team: 'SWE', player: "Anthony Elanga", minute: "59'" }, { team: 'NED', player: "Crysencio Summerville", minute: "89'" }], odds: { home: 0.595, draw: 0.235, away: 0.175, url: 'https://polymarket.com/event/fifwc-nld-swe-2026-06-20' } },
    { id: 'F4', group: 'F', matchday: 2, date: '2026-06-21', kickoff: '2026-06-21T04:00Z', home: 'TUN', away: 'JPN', score: { home: 0, away: 4 }, goals: [{ team: 'JPN', player: "Daichi Kamada", minute: "4'" }, { team: 'JPN', player: "Ayase Ueda", minute: "31'" }, { team: 'JPN', player: "Junya Ito", minute: "69'" }, { team: 'JPN', player: "Ayase Ueda", minute: "83'" }], odds: { home: 0.155, draw: 0.265, away: 0.585, url: 'https://polymarket.com/event/fifwc-tun-jpn-2026-06-21' } },
    { id: 'F5', group: 'F', matchday: 3, date: '2026-06-25', kickoff: '2026-06-25T23:00Z', home: 'JPN', away: 'SWE', score: { home: 1, away: 1 }, goals: [{ team: 'JPN', player: "Daizen Maeda", minute: "56'" }, { team: 'SWE', player: "Anthony Elanga", minute: "62'" }], odds: { home: 0.475, draw: 0.275, away: 0.27, url: 'https://polymarket.com/event/fifwc-jpn-swe-2026-06-25' } },
    { id: 'F6', group: 'F', matchday: 3, date: '2026-06-25', kickoff: '2026-06-25T23:00Z', home: 'TUN', away: 'NED', score: { home: 1, away: 3 }, goals: [{ team: 'NED', player: "Ellyes Skhiri", minute: "3'", ownGoal: true }, { team: 'NED', player: "Brian Brobbey", minute: "7'" }, { team: 'TUN', player: "Hazem Mastouri", minute: "54'" }, { team: 'NED', player: "Jan Paul van Hecke", minute: "62'" }], odds: { home: 0.135, draw: 0.215, away: 0.665, url: 'https://polymarket.com/event/fifwc-tun-nld-2026-06-25' } },
    // Group G
    { id: 'G1', group: 'G', matchday: 1, date: '2026-06-15', kickoff: '2026-06-15T19:00Z', home: 'BEL', away: 'EGY', score: { home: 1, away: 1 }, goals: [{ team: 'EGY', player: "Emam Ashour", minute: "19'" }, { team: 'BEL', player: "Mohamed Hany", minute: "66'", ownGoal: true }], odds: { home: 0.595, draw: 0.245, away: 0.165, url: 'https://polymarket.com/event/fifwc-bel-egy-2026-06-15' } },
    { id: 'G2', group: 'G', matchday: 1, date: '2026-06-15', kickoff: '2026-06-16T01:00Z', home: 'IRN', away: 'NZL', score: { home: 2, away: 2 }, goals: [{ team: 'NZL', player: "Elijah Just", minute: "7'" }, { team: 'IRN', player: "Ramin Rezaeian", minute: "32'" }, { team: 'NZL', player: "Elijah Just", minute: "54'" }, { team: 'IRN', player: "Mohammad Mohebbi", minute: "64'" }], odds: { home: 0.525, draw: 0.275, away: 0.195, url: 'https://polymarket.com/event/fifwc-irn-nzl-2026-06-15' } },
    { id: 'G3', group: 'G', matchday: 2, date: '2026-06-21', kickoff: '2026-06-21T19:00Z', home: 'BEL', away: 'IRN', score: { home: 0, away: 0 }, goals: [], odds: { home: 0.685, draw: 0.2, away: 0.115, url: 'https://polymarket.com/event/fifwc-bel-irn-2026-06-21' } },
    { id: 'G4', group: 'G', matchday: 2, date: '2026-06-21', kickoff: '2026-06-22T01:00Z', home: 'NZL', away: 'EGY', score: { home: 1, away: 3 }, goals: [{ team: 'NZL', player: "Finn Surman", minute: "15'" }, { team: 'EGY', player: "Mostafa Zico", minute: "58'" }, { team: 'EGY', player: "Mohamed Salah", minute: "67'" }, { team: 'EGY', player: "Trézéguet", minute: "82'" }], odds: { home: 0.205, draw: 0.255, away: 0.545, url: 'https://polymarket.com/event/fifwc-nzl-egy-2026-06-21' } },
    { id: 'G5', group: 'G', matchday: 3, date: '2026-06-26', kickoff: '2026-06-27T03:00Z', home: 'EGY', away: 'IRN', score: { home: 1, away: 1 }, goals: [{ team: 'EGY', player: "Mahmoud Saber", minute: "5'" }, { team: 'IRN', player: "Ramin Rezaeian", minute: "14'" }], odds: { home: 0.435, draw: 0.32, away: 0.27, url: 'https://polymarket.com/event/fifwc-egy-irn-2026-06-26' } },
    { id: 'G6', group: 'G', matchday: 3, date: '2026-06-26', kickoff: '2026-06-27T03:00Z', home: 'NZL', away: 'BEL', score: { home: 1, away: 5 }, goals: [{ team: 'BEL', player: "Leandro Trossard", minute: "28'" }, { team: 'BEL', player: "Leandro Trossard", minute: "50'" }, { team: 'BEL', player: "Kevin De Bruyne", minute: "66'" }, { team: 'NZL', player: "Elijah Just", minute: "84'" }, { team: 'BEL', player: "Romelu Lukaku", minute: "86'" }, { team: 'BEL', player: "Alexis Saelemaekers", minute: "90'+4'" }], odds: { home: 0.085, draw: 0.16, away: 0.765, url: 'https://polymarket.com/event/fifwc-nzl-bel-2026-06-26' } },
    // Group H
    { id: 'H1', group: 'H', matchday: 1, date: '2026-06-15', kickoff: '2026-06-15T16:00Z', home: 'ESP', away: 'CPV', score: { home: 0, away: 0 }, goals: [], odds: { home: 0.915, draw: 0.06, away: 0.029, url: 'https://polymarket.com/event/fifwc-esp-cvi-2026-06-15' } },
    { id: 'H2', group: 'H', matchday: 1, date: '2026-06-15', kickoff: '2026-06-15T22:00Z', home: 'KSA', away: 'URU', score: { home: 1, away: 1 }, goals: [{ team: 'KSA', player: "Abdulelah Al-Amri", minute: "41'" }, { team: 'URU', player: "Maxi Araújo", minute: "80'" }], odds: { home: 0.115, draw: 0.215, away: 0.655, url: 'https://polymarket.com/event/fifwc-ksa-ury-2026-06-15' } },
    { id: 'H3', group: 'H', matchday: 2, date: '2026-06-21', kickoff: '2026-06-21T16:00Z', home: 'ESP', away: 'KSA', score: { home: 4, away: 0 }, goals: [{ team: 'ESP', player: "Lamine Yamal", minute: "10'" }, { team: 'ESP', player: "Mikel Oyarzabal", minute: "21'" }, { team: 'ESP', player: "Mikel Oyarzabal", minute: "24'" }, { team: 'ESP', player: "Hassan Al-Tambakti", minute: "49'", ownGoal: true }], odds: { home: 0.875, draw: 0.085, away: 0.042, url: 'https://polymarket.com/event/fifwc-esp-ksa-2026-06-21' } },
    { id: 'H4', group: 'H', matchday: 2, date: '2026-06-21', kickoff: '2026-06-21T22:00Z', home: 'URU', away: 'CPV', score: { home: 2, away: 2 }, goals: [{ team: 'CPV', player: "Kevin Pina", minute: "21'" }, { team: 'URU', player: "Maxi Araújo", minute: "44'" }, { team: 'URU', player: "Agustín Cano", minute: "45'+6'" }, { team: 'CPV', player: "Hélio Varela", minute: "61'" }], odds: { home: 0.685, draw: 0.205, away: 0.115, url: 'https://polymarket.com/event/fifwc-ury-cvi-2026-06-21' } },
    { id: 'H5', group: 'H', matchday: 3, date: '2026-06-26', kickoff: '2026-06-27T00:00Z', home: 'CPV', away: 'KSA', score: { home: 0, away: 0 }, goals: [], odds: { home: 0.375, draw: 0.255, away: 0.365, url: 'https://polymarket.com/event/fifwc-cvi-ksa-2026-06-26' } },
    { id: 'H6', group: 'H', matchday: 3, date: '2026-06-26', kickoff: '2026-06-27T00:00Z', home: 'URU', away: 'ESP', score: { home: 0, away: 1 }, goals: [{ team: 'ESP', player: "Álex Baena", minute: "42'" }], odds: { home: 0.175, draw: 0.245, away: 0.595, url: 'https://polymarket.com/event/fifwc-ury-esp-2026-06-26' } },
    // Group I
    { id: 'I1', group: 'I', matchday: 1, date: '2026-06-16', kickoff: '2026-06-16T19:00Z', home: 'FRA', away: 'SEN', score: { home: 3, away: 1 }, goals: [{ team: 'FRA', player: "Kylian Mbappé", minute: "66'" }, { team: 'FRA', player: "Bradley Barcola", minute: "82'" }, { team: 'SEN', player: "Ibrahim Mbaye", minute: "90'+5'" }, { team: 'FRA', player: "Kylian Mbappé", minute: "90'+6'" }], odds: { home: 0.665, draw: 0.215, away: 0.125, url: 'https://polymarket.com/event/fifwc-fra-sen-2026-06-16' } },
    { id: 'I2', group: 'I', matchday: 1, date: '2026-06-16', kickoff: '2026-06-16T22:00Z', home: 'IRQ', away: 'NOR', score: { home: 1, away: 4 }, goals: [{ team: 'NOR', player: "Erling Haaland", minute: "29'" }, { team: 'IRQ', player: "Aymen Hussein", minute: "39'" }, { team: 'NOR', player: "Erling Haaland", minute: "43'" }, { team: 'NOR', player: "Leo Østigard", minute: "76'" }, { team: 'NOR', player: "Aymen Hussein", minute: "90'+6'", ownGoal: true }], odds: { home: 0.065, draw: 0.135, away: 0.815, url: 'https://polymarket.com/event/fifwc-irq-nor-2026-06-16' } },
    { id: 'I3', group: 'I', matchday: 2, date: '2026-06-22', kickoff: '2026-06-22T21:00Z', home: 'FRA', away: 'IRQ', score: { home: 3, away: 0 }, goals: [{ team: 'FRA', player: "Kylian Mbappé", minute: "14'" }, { team: 'FRA', player: "Kylian Mbappé", minute: "54'" }, { team: 'FRA', player: "Ousmane Dembélé", minute: "66'" }], odds: { home: 0.865, draw: 0.095, away: 0.0345, url: 'https://polymarket.com/event/fifwc-fra-irq-2026-06-22' } },
    { id: 'I4', group: 'I', matchday: 2, date: '2026-06-22', kickoff: '2026-06-23T00:00Z', home: 'NOR', away: 'SEN', score: { home: 3, away: 2 }, goals: [{ team: 'NOR', player: "Marcus Holmgren Pedersen", minute: "43'" }, { team: 'NOR', player: "Erling Haaland", minute: "48'" }, { team: 'SEN', player: "Ismaïla Sarr", minute: "53'" }, { team: 'NOR', player: "Erling Haaland", minute: "58'" }, { team: 'SEN', player: "Ismaïla Sarr", minute: "90'+3'" }], odds: { home: 0.445, draw: 0.275, away: 0.285, url: 'https://polymarket.com/event/fifwc-nor-sen-2026-06-22' } },
    { id: 'I5', group: 'I', matchday: 3, date: '2026-06-26', kickoff: '2026-06-26T19:00Z', home: 'NOR', away: 'FRA', score: { home: 1, away: 4 }, goals: [{ team: 'FRA', player: "Ousmane Dembélé", minute: "7'" }, { team: 'FRA', player: "Ousmane Dembélé", minute: "20'" }, { team: 'NOR', player: "Thelo Aasgaard", minute: "21'" }, { team: 'FRA', player: "Ousmane Dembélé", minute: "32'" }, { team: 'FRA', player: "Désiré Doué", minute: "90'+4'" }], odds: { home: 0.225, draw: 0.265, away: 0.525, url: 'https://polymarket.com/event/fifwc-nor-fra-2026-06-26' } },
    { id: 'I6', group: 'I', matchday: 3, date: '2026-06-26', kickoff: '2026-06-26T19:00Z', home: 'SEN', away: 'IRQ', score: { home: 5, away: 0 }, goals: [{ team: 'SEN', player: "Habib Diarra", minute: "4'" }, { team: 'SEN', player: "Ismaïla Sarr", minute: "56'" }, { team: 'SEN', player: "Pape Gueye", minute: "59'" }, { team: 'SEN', player: "Pape Gueye", minute: "71'" }, { team: 'SEN', player: "Iliman Ndiaye", minute: "82'" }], odds: { home: 0.695, draw: 0.205, away: 0.105, url: 'https://polymarket.com/event/fifwc-sen-irq-2026-06-26' } },
    // Group J
    { id: 'J1', group: 'J', matchday: 1, date: '2026-06-16', kickoff: '2026-06-17T01:00Z', home: 'ARG', away: 'ALG', score: { home: 3, away: 0 }, goals: [{ team: 'ARG', player: "Lionel Messi", minute: "17'" }, { team: 'ARG', player: "Lionel Messi", minute: "60'" }, { team: 'ARG', player: "Lionel Messi", minute: "76'" }], odds: { home: 0.695, draw: 0.205, away: 0.105, url: 'https://polymarket.com/event/fifwc-arg-alg-2026-06-16' } },
    { id: 'J2', group: 'J', matchday: 1, date: '2026-06-17', kickoff: '2026-06-17T04:00Z', home: 'AUT', away: 'JOR', score: { home: 3, away: 1 }, goals: [{ team: 'AUT', player: "Romano Schmid", minute: "21'" }, { team: 'JOR', player: "Ali Olwan", minute: "50'" }, { team: 'AUT', player: "Yazan Al-Arab", minute: "76'", ownGoal: true }, { team: 'AUT', player: "Marko Arnautovic", minute: "90'+12'", penalty: true }], odds: { home: 0.725, draw: 0.175, away: 0.105, url: 'https://polymarket.com/event/fifwc-aut-jor-2026-06-17' } },
    { id: 'J3', group: 'J', matchday: 2, date: '2026-06-22', kickoff: '2026-06-22T17:00Z', home: 'ARG', away: 'AUT', score: { home: 2, away: 0 }, goals: [{ team: 'ARG', player: "Lionel Messi", minute: "38'" }, { team: 'ARG', player: "Lionel Messi", minute: "90'+5'" }], odds: { home: 0.605, draw: 0.235, away: 0.165, url: 'https://polymarket.com/event/fifwc-arg-aut-2026-06-22' } },
    { id: 'J4', group: 'J', matchday: 2, date: '2026-06-22', kickoff: '2026-06-23T03:00Z', home: 'JOR', away: 'ALG', score: { home: 1, away: 2 }, goals: [{ team: 'JOR', player: "Nizar Al-Rashdan", minute: "36'" }, { team: 'ALG', player: "Nadhir Benbouali", minute: "69'" }, { team: 'ALG', player: "Amine Gouiri", minute: "82'" }], odds: { home: 0.145, draw: 0.205, away: 0.655, url: 'https://polymarket.com/event/fifwc-jor-alg-2026-06-22' } },
    { id: 'J5', group: 'J', matchday: 3, date: '2026-06-27', kickoff: '2026-06-28T02:00Z', home: 'ALG', away: 'AUT', score: { home: 3, away: 3 }, goals: [{ team: 'AUT', player: "Marko Arnautovic", minute: "28'" }, { team: 'ALG', player: "Rafik Belghali", minute: "45'" }, { team: 'AUT', player: "Marcel Sabitzer", minute: "55'" }, { team: 'ALG', player: "Riyad Mahrez", minute: "60'" }, { team: 'ALG', player: "Riyad Mahrez", minute: "90'+3'" }, { team: 'AUT', player: "Sasa Kalajdzic", minute: "90'+6'" }], odds: { home: 0.255, draw: 0.315, away: 0.445, url: 'https://polymarket.com/event/fifwc-alg-aut-2026-06-27' } },
    { id: 'J6', group: 'J', matchday: 3, date: '2026-06-27', kickoff: '2026-06-28T02:00Z', home: 'JOR', away: 'ARG', score: { home: 1, away: 3 }, goals: [{ team: 'ARG', player: "Giovani Lo Celso", minute: "19'" }, { team: 'ARG', player: "Lautaro Martínez", minute: "31'", penalty: true }, { team: 'JOR', player: "Mousa Al-Tamari", minute: "55'" }, { team: 'ARG', player: "Lionel Messi", minute: "80'" }], odds: { home: 0.0665, draw: 0.115, away: 0.825, url: 'https://polymarket.com/event/fifwc-jor-arg-2026-06-27' } },
    // Group K
    { id: 'K1', group: 'K', matchday: 1, date: '2026-06-17', kickoff: '2026-06-17T17:00Z', home: 'POR', away: 'COD', score: { home: 1, away: 1 }, goals: [{ team: 'POR', player: "João Neves", minute: "6'" }, { team: 'COD', player: "Yoane Wissa", minute: "45'+5'" }], odds: { home: 0.765, draw: 0.165, away: 0.075, url: 'https://polymarket.com/event/fifwc-prt-cdr-2026-06-17' } },
    { id: 'K2', group: 'K', matchday: 1, date: '2026-06-17', kickoff: '2026-06-18T02:00Z', home: 'UZB', away: 'COL', score: { home: 1, away: 3 }, goals: [{ team: 'COL', player: "Daniel Muñoz", minute: "40'" }, { team: 'UZB', player: "Abbosbek Fayzullaev", minute: "60'" }, { team: 'COL', player: "Luis Díaz", minute: "65'" }, { team: 'COL', player: "Jáminton Campaz", minute: "90'+9'" }], odds: { home: 0.095, draw: 0.205, away: 0.705, url: 'https://polymarket.com/event/fifwc-uzb-col-2026-06-17' } },
    { id: 'K3', group: 'K', matchday: 2, date: '2026-06-23', kickoff: '2026-06-23T17:00Z', home: 'POR', away: 'UZB', score: { home: 5, away: 0 }, goals: [{ team: 'POR', player: "Cristiano Ronaldo", minute: "6'" }, { team: 'POR', player: "Nuno Mendes", minute: "17'" }, { team: 'POR', player: "Cristiano Ronaldo", minute: "39'" }, { team: 'POR', player: "Abduvohid Nematov", minute: "60'", ownGoal: true }, { team: 'POR', player: "Rafael Leão", minute: "87'" }], odds: { home: 0.795, draw: 0.135, away: 0.075, url: 'https://polymarket.com/event/fifwc-prt-uzb-2026-06-23' } },
    { id: 'K4', group: 'K', matchday: 2, date: '2026-06-23', kickoff: '2026-06-24T02:00Z', home: 'COL', away: 'COD', score: { home: 1, away: 0 }, goals: [{ team: 'COL', player: "Daniel Muñoz", minute: "76'" }], odds: { home: 0.675, draw: 0.215, away: 0.125, url: 'https://polymarket.com/event/fifwc-col-cdr-2026-06-23' } },
    { id: 'K5', group: 'K', matchday: 3, date: '2026-06-27', kickoff: '2026-06-27T23:30Z', home: 'COL', away: 'POR', score: { home: 0, away: 0 }, goals: [], odds: { home: 0.255, draw: 0.275, away: 0.47, url: 'https://polymarket.com/event/fifwc-col-prt-2026-06-27' } },
    { id: 'K6', group: 'K', matchday: 3, date: '2026-06-27', kickoff: '2026-06-27T23:30Z', home: 'COD', away: 'UZB', score: { home: 3, away: 1 }, goals: [{ team: 'UZB', player: "Eldor Shomurodov", minute: "10'" }, { team: 'COD', player: "Yoane Wissa", minute: "68'", penalty: true }, { team: 'COD', player: "Fiston Mayele", minute: "78'" }, { team: 'COD', player: "Yoane Wissa", minute: "90'+1'" }], odds: { home: 0.405, draw: 0.29, away: 0.31, url: 'https://polymarket.com/event/fifwc-cdr-uzb-2026-06-27' } },
    // Group L
    { id: 'L1', group: 'L', matchday: 1, date: '2026-06-17', kickoff: '2026-06-17T20:00Z', home: 'ENG', away: 'CRO', score: { home: 4, away: 2 }, goals: [{ team: 'ENG', player: "Harry Kane", minute: "12'", penalty: true }, { team: 'CRO', player: "Martin Baturina", minute: "36'" }, { team: 'ENG', player: "Harry Kane", minute: "42'" }, { team: 'CRO', player: "Petar Musa", minute: "45'+5'" }, { team: 'ENG', player: "Jude Bellingham", minute: "47'" }, { team: 'ENG', player: "Marcus Rashford", minute: "85'" }], odds: { home: 0.565, draw: 0.255, away: 0.185, url: 'https://polymarket.com/event/fifwc-eng-hrv-2026-06-17' } },
    { id: 'L2', group: 'L', matchday: 1, date: '2026-06-17', kickoff: '2026-06-17T23:00Z', home: 'GHA', away: 'PAN', score: { home: 1, away: 0 }, goals: [{ team: 'GHA', player: "Caleb Yirenkyi", minute: "90'+5'" }], odds: { home: 0.445, draw: 0.275, away: 0.275, url: 'https://polymarket.com/event/fifwc-gha-pan-2026-06-17' } },
    { id: 'L3', group: 'L', matchday: 2, date: '2026-06-23', kickoff: '2026-06-23T20:00Z', home: 'ENG', away: 'GHA', score: { home: 0, away: 0 }, goals: [], odds: { home: 0.745, draw: 0.165, away: 0.1, url: 'https://polymarket.com/event/fifwc-eng-gha-2026-06-23' } },
    { id: 'L4', group: 'L', matchday: 2, date: '2026-06-23', kickoff: '2026-06-23T23:00Z', home: 'PAN', away: 'CRO', score: { home: 0, away: 1 }, goals: [{ team: 'CRO', player: "Ante Budimir", minute: "54'" }], odds: { home: 0.145, draw: 0.235, away: 0.625, url: 'https://polymarket.com/event/fifwc-pan-hrv-2026-06-23' } },
    { id: 'L5', group: 'L', matchday: 3, date: '2026-06-27', kickoff: '2026-06-27T21:00Z', home: 'PAN', away: 'ENG', score: { home: 0, away: 2 }, goals: [{ team: 'ENG', player: "Jude Bellingham", minute: "62'" }, { team: 'ENG', player: "Harry Kane", minute: "67'" }], odds: { home: 0.105, draw: 0.155, away: 0.755, url: 'https://polymarket.com/event/fifwc-pan-eng-2026-06-27' } },
    { id: 'L6', group: 'L', matchday: 3, date: '2026-06-27', kickoff: '2026-06-27T21:00Z', home: 'CRO', away: 'GHA', score: { home: 2, away: 1 }, goals: [{ team: 'CRO', player: "Petar Sucic", minute: "31'" }, { team: 'GHA', player: "Derrick Luckassen", minute: "73'" }, { team: 'CRO', player: "Nikola Vlasic", minute: "83'" }], odds: { home: 0.585, draw: 0.25, away: 0.16, url: 'https://polymarket.com/event/fifwc-hrv-gha-2026-06-27' } },
  ],

  knockoutRounds: [
    {
      id: 'r32',
      name: 'Round of 32',
      matches: [
        { id: 'm73', date: '2026-06-28', home: { type: 'group-rank', group: 'A', rank: 2 }, away: { type: 'group-rank', group: 'B', rank: 2 }, kickoff: '2026-06-28T19:00Z', homeTeam: 'RSA', awayTeam: 'CAN', score: { home: 0, away: 1 }, goals: [{ team: 'CAN', player: "Stephen Eustáquio", minute: "90'+2'" }] , odds: { home: 0.185, draw: 0.285, away: 0.525, url: 'https://polymarket.com/event/fifwc-rsa-can-2026-06-28' } },
        { id: 'm74', date: '2026-06-29', home: { type: 'group-rank', group: 'E', rank: 1 }, away: { type: 'best-third', groups: ['A', 'B', 'C', 'D', 'F'] }, kickoff: '2026-06-29T20:30Z', homeTeam: 'GER', awayTeam: 'PAR', score: { home: 1, away: 1 }, afterExtraTime: true, penalties: { home: 3, away: 4 }, goals: [{ team: 'PAR', player: "Julio Enciso", minute: "42'" }, { team: 'GER', player: "Kai Havertz", minute: "54'" }] , odds: { home: 0.735, draw: 0.185, away: 0.085, url: 'https://polymarket.com/event/fifwc-ger-par-2026-06-29' } },
        { id: 'm75', date: '2026-06-29', home: { type: 'group-rank', group: 'F', rank: 1 }, away: { type: 'group-rank', group: 'C', rank: 2 }, odds: { home: 0.405, draw: 0.315, away: 0.285, url: 'https://polymarket.com/event/fifwc-nld-mar-2026-06-29' }, kickoff: '2026-06-30T01:00Z', homeTeam: 'NED', awayTeam: 'MAR', score: { home: 1, away: 1 }, afterExtraTime: true, penalties: { home: 2, away: 3 }, goals: [{ team: 'NED', player: "Cody Gakpo", minute: "72'" }, { team: 'MAR', player: "Issa Diop", minute: "90'+1'" }] },
        { id: 'm76', date: '2026-06-29', home: { type: 'group-rank', group: 'C', rank: 1 }, away: { type: 'group-rank', group: 'F', rank: 2 }, kickoff: '2026-06-29T17:00Z', homeTeam: 'BRA', awayTeam: 'JPN', score: { home: 2, away: 1 }, goals: [{ team: 'JPN', player: "Kaishu Sano", minute: "29'" }, { team: 'BRA', player: "Casemiro", minute: "56'" }, { team: 'BRA', player: "Gabriel Martinelli", minute: "90'+5'" }] , odds: { home: 0.545, draw: 0.275, away: 0.185, url: 'https://polymarket.com/event/fifwc-bra-jpn-2026-06-29' } },
        { id: 'm77', date: '2026-06-30', home: { type: 'group-rank', group: 'I', rank: 1 }, away: { type: 'best-third', groups: ['C', 'D', 'F', 'G', 'H'] }, odds: { home: 0.765, draw: 0.155, away: 0.075, url: 'https://polymarket.com/event/fifwc-fra-swe-2026-06-30' }, kickoff: '2026-06-30T21:00Z', homeTeam: 'FRA', awayTeam: 'SWE', score: { home: 3, away: 0 }, goals: [{ team: 'FRA', player: "Kylian Mbappé", minute: "45'" }, { team: 'FRA', player: "Bradley Barcola", minute: "53'" }, { team: 'FRA', player: "Kylian Mbappé", minute: "74'" }] },
        { id: 'm78', date: '2026-06-30', home: { type: 'group-rank', group: 'E', rank: 2 }, away: { type: 'group-rank', group: 'I', rank: 2 }, odds: { home: 0.255, draw: 0.295, away: 0.445, url: 'https://polymarket.com/event/fifwc-civ-nor-2026-06-30' }, kickoff: '2026-06-30T17:00Z', homeTeam: 'CIV', awayTeam: 'NOR', score: { home: 1, away: 2 }, goals: [{ team: 'NOR', player: "Antonio Nusa", minute: "39'" }, { team: 'CIV', player: "Amad Diallo", minute: "74'" }, { team: 'NOR', player: "Erling Haaland", minute: "86'" }] },
        { id: 'm79', date: '2026-06-30', home: { type: 'group-rank', group: 'A', rank: 1 }, away: { type: 'best-third', groups: ['C', 'E', 'F', 'H', 'I'] }, odds: { home: 0.415, draw: 0.355, away: 0.225, url: 'https://polymarket.com/event/fifwc-mex-ecu-2026-06-30' }, kickoff: '2026-07-01T01:00Z', homeTeam: 'MEX', awayTeam: 'ECU', score: { home: 2, away: 0 }, goals: [{ team: 'MEX', player: "Julián Quiñones", minute: "22'" }, { team: 'MEX', player: "Raúl Jiménez", minute: "31'" }] },
        { id: 'm80', date: '2026-07-01', home: { type: 'group-rank', group: 'L', rank: 1 }, away: { type: 'best-third', groups: ['E', 'H', 'I', 'J', 'K'] }, odds: { home: 0.755, draw: 0.185, away: 0.055, url: 'https://polymarket.com/event/fifwc-eng-cdr-2026-07-01' }, kickoff: '2026-07-01T16:00Z', homeTeam: 'ENG', awayTeam: 'COD', score: { home: 2, away: 1 }, goals: [{ team: 'COD', player: "Brian Cipenga", minute: "7'" }, { team: 'ENG', player: "Harry Kane", minute: "75'" }, { team: 'ENG', player: "Harry Kane", minute: "86'" }] },
        { id: 'm81', date: '2026-07-01', home: { type: 'group-rank', group: 'D', rank: 1 }, away: { type: 'best-third', groups: ['B', 'E', 'F', 'I', 'J'] }, odds: { home: 0.715, draw: 0.185, away: 0.095, url: 'https://polymarket.com/event/fifwc-usa-bih-2026-07-01' }, kickoff: '2026-07-02T00:00Z', homeTeam: 'USA', awayTeam: 'BIH', score: { home: 2, away: 0 }, goals: [{ team: 'USA', player: "Folarin Balogun", minute: "45'" }, { team: 'USA', player: "Malik Tillman", minute: "82'" }] },
        { id: 'm82', date: '2026-07-01', home: { type: 'group-rank', group: 'G', rank: 1 }, away: { type: 'best-third', groups: ['A', 'E', 'H', 'I', 'J'] }, odds: { home: 0.505, draw: 0.275, away: 0.225, url: 'https://polymarket.com/event/fifwc-bel-sen-2026-07-01' }, kickoff: '2026-07-01T20:00Z', homeTeam: 'BEL', awayTeam: 'SEN', score: { home: 3, away: 2 }, afterExtraTime: true, goals: [{ team: 'SEN', player: "Habib Diarra", minute: "25'" }, { team: 'SEN', player: "Ismaïla Sarr", minute: "51'" }, { team: 'BEL', player: "Romelu Lukaku", minute: "86'" }, { team: 'BEL', player: "Youri Tielemans", minute: "89'" }, { team: 'BEL', player: "Youri Tielemans", minute: "120'+5'", penalty: true }] },
        { id: 'm83', date: '2026-07-02', kickoff: '2026-07-02T23:00Z', home: { type: 'group-rank', group: 'K', rank: 2 }, away: { type: 'group-rank', group: 'L', rank: 2 }, homeTeam: 'POR', awayTeam: 'CRO' , odds: { home: 0.564, draw: 0.261, away: 0.179, url: 'https://polymarket.com/event/fifwc-prt-hrv-2026-07-02' } },
        { id: 'm84', date: '2026-07-02', kickoff: '2026-07-02T19:00Z', home: { type: 'group-rank', group: 'H', rank: 1 }, away: { type: 'group-rank', group: 'J', rank: 2 }, homeTeam: 'ESP', awayTeam: 'AUT' , odds: { home: 0.761, draw: 0.174, away: 0.076, url: 'https://polymarket.com/event/fifwc-esp-aut-2026-07-02' } },
        { id: 'm85', date: '2026-07-02', kickoff: '2026-07-03T03:00Z', home: { type: 'group-rank', group: 'B', rank: 1 }, away: { type: 'best-third', groups: ['E', 'F', 'G', 'I', 'J'] }, homeTeam: 'SUI', awayTeam: 'ALG' , odds: { home: 0.479, draw: 0.299, away: 0.224, url: 'https://polymarket.com/event/fifwc-che-alg-2026-07-02' } },
        { id: 'm86', date: '2026-07-03', kickoff: '2026-07-03T22:00Z', home: { type: 'group-rank', group: 'J', rank: 1 }, away: { type: 'group-rank', group: 'H', rank: 2 }, homeTeam: 'ARG', awayTeam: 'CPV' , odds: { home: 0.845, draw: 0.115, away: 0.043, url: 'https://polymarket.com/event/fifwc-arg-cvi-2026-07-03' } },
        { id: 'm87', date: '2026-07-03', kickoff: '2026-07-04T01:30Z', home: { type: 'group-rank', group: 'K', rank: 1 }, away: { type: 'best-third', groups: ['D', 'E', 'I', 'J', 'L'] }, homeTeam: 'COL', awayTeam: 'GHA' , odds: { home: 0.645, draw: 0.245, away: 0.115, url: 'https://polymarket.com/event/fifwc-col-gha-2026-07-03' } },
        { id: 'm88', date: '2026-07-03', kickoff: '2026-07-03T18:00Z', home: { type: 'group-rank', group: 'D', rank: 2 }, away: { type: 'group-rank', group: 'G', rank: 2 }, homeTeam: 'AUS', awayTeam: 'EGY' , odds: { home: 0.285, draw: 0.335, away: 0.385, url: 'https://polymarket.com/event/fifwc-aus-egy-2026-07-03' } },
      ],
    },
    {
      id: 'r16',
      name: 'Round of 16',
      matches: [
        { id: 'm89', date: '2026-07-04', kickoff: '2026-07-04T21:00Z', home: { type: 'match-winner', match: 'm74' }, away: { type: 'match-winner', match: 'm77' } , odds: { home: 0.045, draw: 0.125, away: 0.835, url: 'https://polymarket.com/event/fifwc-par-fra-2026-07-04' } },
        { id: 'm90', date: '2026-07-04', kickoff: '2026-07-04T17:00Z', home: { type: 'match-winner', match: 'm73' }, away: { type: 'match-winner', match: 'm75' } , odds: { home: 0.185, draw: 0.275, away: 0.545, url: 'https://polymarket.com/event/fifwc-can-mar-2026-07-04' } },
        { id: 'm91', date: '2026-07-05', kickoff: '2026-07-05T20:00Z', home: { type: 'match-winner', match: 'm76' }, away: { type: 'match-winner', match: 'm78' } , odds: { home: 0.515, draw: 0.265, away: 0.225, url: 'https://polymarket.com/event/fifwc-bra-nor-2026-07-05' } },
        { id: 'm92', date: '2026-07-05', kickoff: '2026-07-06T00:00Z', home: { type: 'match-winner', match: 'm79' }, away: { type: 'match-winner', match: 'm80' } , odds: { home: 0.305, draw: 0.295, away: 0.395, url: 'https://polymarket.com/event/fifwc-mex-eng-2026-07-05' } },
        { id: 'm93', date: '2026-07-06', kickoff: '2026-07-06T19:00Z', home: { type: 'match-winner', match: 'm83' }, away: { type: 'match-winner', match: 'm84' } },
        { id: 'm94', date: '2026-07-06', kickoff: '2026-07-07T00:00Z', home: { type: 'match-winner', match: 'm81' }, away: { type: 'match-winner', match: 'm82' } , odds: { home: 0.375, draw: 0.285, away: 0.35, url: 'https://polymarket.com/event/fifwc-usa-bel-2026-07-06' } },
        { id: 'm95', date: '2026-07-07', kickoff: '2026-07-07T16:00Z', home: { type: 'match-winner', match: 'm86' }, away: { type: 'match-winner', match: 'm88' } },
        { id: 'm96', date: '2026-07-07', kickoff: '2026-07-07T20:00Z', home: { type: 'match-winner', match: 'm85' }, away: { type: 'match-winner', match: 'm87' } },
      ],
    },
    {
      id: 'qf',
      name: 'Quarter-finals',
      matches: [
        { id: 'm97', date: '2026-07-09', kickoff: '2026-07-09T20:00Z', home: { type: 'match-winner', match: 'm89' }, away: { type: 'match-winner', match: 'm90' } },
        { id: 'm98', date: '2026-07-10', kickoff: '2026-07-10T19:00Z', home: { type: 'match-winner', match: 'm93' }, away: { type: 'match-winner', match: 'm94' } },
        { id: 'm99', date: '2026-07-11', kickoff: '2026-07-11T21:00Z', home: { type: 'match-winner', match: 'm91' }, away: { type: 'match-winner', match: 'm92' } },
        { id: 'm100', date: '2026-07-11', kickoff: '2026-07-12T01:00Z', home: { type: 'match-winner', match: 'm95' }, away: { type: 'match-winner', match: 'm96' } },
      ],
    },
    {
      id: 'sf',
      name: 'Semi-finals',
      matches: [
        { id: 'm101', date: '2026-07-14', kickoff: '2026-07-14T19:00Z', home: { type: 'match-winner', match: 'm97' }, away: { type: 'match-winner', match: 'm98' } },
        { id: 'm102', date: '2026-07-15', kickoff: '2026-07-15T19:00Z', home: { type: 'match-winner', match: 'm99' }, away: { type: 'match-winner', match: 'm100' } },
      ],
    },
    {
      id: 'third-place',
      name: 'Third-place play-off',
      matches: [
        { id: 'm103', date: '2026-07-18', kickoff: '2026-07-18T21:00Z', home: { type: 'match-loser', match: 'm101' }, away: { type: 'match-loser', match: 'm102' } },
      ],
    },
    {
      id: 'final',
      name: 'Final',
      matches: [
        { id: 'm104', date: '2026-07-19', kickoff: '2026-07-19T19:00Z', home: { type: 'match-winner', match: 'm101' }, away: { type: 'match-winner', match: 'm102' } },
      ],
    },
  ],
}
