import { useSyncExternalStore } from 'react'

/**
 * Viewer preferences for our own player controls, drawn over YouTube's bottom
 * row so its total runtime, chapter names, progress bar and "More videos"
 * thumbnail never show unless the viewer asks for them. The defaults are the spoiler-safe ones.
 */
export interface PlayerSettings {
  showElapsed: boolean
  showTotal: boolean
  showProgress: boolean
  showTitle: boolean
  showMoreVideos: boolean
  skipSeconds: number
}

export const SKIP_CHOICES = [5, 10, 15, 30] as const

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  showElapsed: true,
  showTotal: false,
  showProgress: false,
  showTitle: false,
  showMoreVideos: false,
  skipSeconds: 5,
}

const KEY = 'nss-player-settings'
const listeners = new Set<() => void>()

function readStored(): PlayerSettings | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const saved = JSON.parse(raw) as Partial<PlayerSettings>
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null
    const merged = { ...DEFAULT_PLAYER_SETTINGS, ...saved }
    if (!(SKIP_CHOICES as readonly number[]).includes(merged.skipSeconds)) {
      merged.skipSeconds = DEFAULT_PLAYER_SETTINGS.skipSeconds
    }
    return merged
  } catch {
    return null
  }
}

// read() falls back to the defaults wherever storage is missing (Node) or
// throws on access (site data blocked, sandboxed frames).
let current: PlayerSettings = readStored() ?? DEFAULT_PLAYER_SETTINGS
let warned = false

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return
    current = readStored() ?? DEFAULT_PLAYER_SETTINGS
    listeners.forEach((listener) => listener())
  })
}

function commit(next: PlayerSettings) {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    if (!warned && typeof window !== 'undefined') {
      warned = true
      window.alert('Your player preferences cannot be saved in this browser right now. Check browser storage before closing this tab.')
    }
  }
  listeners.forEach((l) => l())
}

export function setPlayerSetting<K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]) {
  commit({ ...current, ...readStored(), [key]: value })
}

export function resetPlayerSettings() {
  commit(DEFAULT_PLAYER_SETTINGS)
}

export function usePlayerSettings(): PlayerSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => DEFAULT_PLAYER_SETTINGS,
  )
}
