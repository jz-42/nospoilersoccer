/**
 * The production app uses the selected designs. The site lab's Old choice
 * maps to html[data-nl-<id>="off"] in new-look.css for side-by-side review.
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
    note: 'One continuous poster; the card size stays the same',
    options: [
      { id: 'poster', label: 'Poster', note: 'Names stay bottom-left on the art; the clock sits at the line end' },
      { id: 'off', label: 'Old', note: 'Caption strip, with the clock in the lower-left of the art' },
    ],
  },
  {
    id: 'favs',
    group: 'Across the site',
    label: 'Dusk favourites',
    note: 'The Today band’s solid rose plate on rows and bracket cards, not a pink edge',
    options: [
      { id: 'on', label: 'Dusk', note: 'Solid rose plate across rows and bracket cards' },
      { id: 'off', label: 'Old', note: 'Pink edge and wash on rows and bracket cards' },
    ],
  },
  {
    id: 'badges',
    group: 'Across the site',
    label: 'Quiet badges',
    note: 'Apple Sports: no FT beside a play button anywhere, row states as plain text, every chip left a capsule',
    options: [
      { id: 'on', label: 'Quiet', note: 'No FT beside a play button; row states are plain text' },
      { id: 'off', label: 'Old', note: 'Status chips and FT beside a play button' },
    ],
  },
]

export type Look = Record<string, string>

const KEY = 'nss-lab-look-v4'

export function readLook(): Look {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    // The previous lab exposed a second layout that is no longer shipped.
    if (v.caption === 'scoreboard') v.caption = 'poster'
    return v
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
