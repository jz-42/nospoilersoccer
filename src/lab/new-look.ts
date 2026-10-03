/** The site lab's "new look" switches still on trial (the rest shipped in App.css); each one maps to html[data-nl-<id>] in new-look.css. */
export const LOOK_FEATURES = [
  { id: 'caption', label: 'Names on art', note: 'No caption strip, names over a fade' },
  { id: 'flags', label: 'Flags', note: 'Rounder, lifted, softer “vs”' },
] as const

export type LookId = (typeof LOOK_FEATURES)[number]['id']

const KEY = 'nss-lab-look-v3'

/** Stored in localStorage so the phone iframe (same origin) matches. Default: all off. */
export function readLook(): Set<LookId> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function applyLook(on: Set<LookId> = readLook()) {
  localStorage.setItem(KEY, JSON.stringify([...on]))
  for (const f of LOOK_FEATURES) {
    document.documentElement.toggleAttribute(`data-nl-${f.id}`, on.has(f.id))
  }
}
