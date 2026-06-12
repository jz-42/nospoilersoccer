import type { Team, Tournament } from '../data/types'

/** Generic World Cup style trophy. */
function Trophy({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.3} viewBox="0 0 60 78" aria-hidden="true">
      <defs>
        <linearGradient id="nss-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d489" />
          <stop offset="1" stopColor="#c79a3d" />
        </linearGradient>
      </defs>
      {/* globe */}
      <circle cx="30" cy="16" r="11" fill="url(#nss-gold)" />
      <path d="M 21 12 a 11 11 0 0 1 18 0" fill="none" stroke="#a87f2e" strokeWidth="1.2" opacity="0.6" />
      <path d="M 20 18 a 11 11 0 0 0 20 0" fill="none" stroke="#a87f2e" strokeWidth="1.2" opacity="0.6" />
      {/* arms wrapping up to the globe */}
      <path
        d="M 18 46 C 12 38 13 28 20 23 C 23 21 25 24 23 27 C 19 32 20 38 24 43 Z"
        fill="url(#nss-gold)"
      />
      <path
        d="M 42 46 C 48 38 47 28 40 23 C 37 21 35 24 37 27 C 41 32 40 38 36 43 Z"
        fill="url(#nss-gold)"
      />
      {/* body */}
      <path d="M 22 44 C 24 36 36 36 38 44 L 36 58 L 24 58 Z" fill="url(#nss-gold)" />
      {/* base */}
      <rect x="20" y="58" width="20" height="6" rx="2" fill="url(#nss-gold)" />
      <rect x="16" y="64" width="28" height="8" rx="3" fill="#9c7427" />
    </svg>
  )
}

/**
 * The 2022 moment — a stylized silhouette in his honor: the number 10,
 * arms up, trophy overhead.
 */
function Lift({ size = 110 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 100 118" aria-hidden="true">
      <defs>
        <linearGradient id="nss-gold2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d489" />
          <stop offset="1" stopColor="#c79a3d" />
        </linearGradient>
      </defs>
      {/* trophy overhead */}
      <circle cx="50" cy="9" r="6.5" fill="url(#nss-gold2)" />
      <path d="M 45 17 C 44 14 47 13 50 13 C 53 13 56 14 55 17 L 53.5 24 L 46.5 24 Z" fill="url(#nss-gold2)" />
      <rect x="45" y="24" width="10" height="3" rx="1.5" fill="#9c7427" />
      {/* raised arms */}
      <path d="M 45.5 26 C 41 30 38 36 38.5 42" fill="none" stroke="#1b222d" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M 54.5 26 C 59 30 62 36 61.5 42" fill="none" stroke="#1b222d" strokeWidth="5.5" strokeLinecap="round" />
      {/* head with the shaggy hair + beard hint, from behind */}
      <circle cx="50" cy="37" r="7.2" fill="#1b222d" />
      <path d="M 42.5 36 C 42 30 47 27.5 50 27.8 C 53 27.5 58 30 57.5 36 C 56 32.5 53 31 50 31 C 47 31 44 32.5 42.5 36 Z" fill="#1b222d" />
      {/* torso (jersey) */}
      <path d="M 39 46 C 42 42.5 58 42.5 61 46 L 60 70 L 40 70 Z" fill="#1b222d" />
      {/* the 10 */}
      <text
        x="50"
        y="62"
        textAnchor="middle"
        fontFamily="Inter Variable, system-ui, sans-serif"
        fontSize="14.5"
        fontWeight="800"
        fill="#0c0f14"
      >
        10
      </text>
      {/* shorts + legs */}
      <path d="M 40 70 L 60 70 L 59 82 L 52 82 L 51.5 76 L 48.5 76 L 48 82 L 41 82 Z" fill="#1b222d" />
      <path d="M 43.5 82 L 48 82 L 47 104 L 43.5 104 Z" fill="#1b222d" />
      <path d="M 52 82 L 56.5 82 L 56.5 104 L 53 104 Z" fill="#1b222d" />
      {/* boots */}
      <path d="M 43 104 L 47.2 104 L 47 108 L 40 108 Z" fill="#0c0f14" />
      <path d="M 53 104 L 56.7 104 L 60 108 L 53 108 Z" fill="#0c0f14" />
    </svg>
  )
}

export function ChampionMoment({ t, team }: { t: Tournament; team: Team }) {
  const isMessiMoment = t.id === 'wc2022' && team.id === 'ARG'
  return (
    <div className="champion">
      <div className="champion-art">{isMessiMoment ? <Lift /> : <Trophy />}</div>
      <div className="champion-flag">{team.flag}</div>
      <div className="champion-name">{team.name}</div>
      <div className="champion-label">World Champions</div>
    </div>
  )
}
