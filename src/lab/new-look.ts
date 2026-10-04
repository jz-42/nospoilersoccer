/**
 * The site lab's "new look" switches still on trial. Each one maps to
 * html[data-nl-<id>="<option>"] in new-look.css ("on" for a plain switch);
 * with everything off the lab is the app as it ships.
 */
export interface LookOption {
  id: string
  label: string
  note: string
}

export interface LookFeature {
  id: string
  group: string
  label: string
  note: string
  /** Named alternatives; a plain on/off switch has none. */
  options?: readonly LookOption[]
}

export const LOOK_FEATURES: readonly LookFeature[] = [
  {
    id: 'caption',
    group: 'Today cards',
    label: 'Names on art',
    note: 'No caption strip; same card size',
    options: [
      { id: 'poster', label: 'Poster', note: 'Apple TV tile: names stay bottom-left on the art, clock at the line end' },
      { id: 'scoreboard', label: 'Scoreboard', note: 'Apple Sports tile: each name under its crest, like the match sheet' },
    ],
  },
  {
    id: 'favs',
    group: 'Across the site',
    label: 'Dusk favourites',
    note: 'The Today band’s solid rose plate on rows and bracket cards, not a pink edge',
  },
  {
    id: 'badges',
    group: 'Across the site',
    label: 'Quiet badges',
    note: 'Apple Sports: no FT beside a play button anywhere, row states as plain text, every chip left a capsule',
  },
]

export type Look = Record<string, string>

const KEY = 'nss-lab-look-v4'

export function readLook(): Look {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export function applyLook(look: Look = readLook()) {
  localStorage.setItem(KEY, JSON.stringify(look))
  const root = document.documentElement
  for (const f of LOOK_FEATURES) {
    const v = look[f.id]
    if (v) root.setAttribute(`data-nl-${f.id}`, v)
    else root.removeAttribute(`data-nl-${f.id}`)
  }
}
