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

function read(): PlayerSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PlayerSettings>
    const merged = { ...DEFAULT_PLAYER_SETTINGS, ...saved }
    if (!(SKIP_CHOICES as readonly number[]).includes(merged.skipSeconds)) {
      merged.skipSeconds = DEFAULT_PLAYER_SETTINGS.skipSeconds
    }
    return merged
  } catch {
    return DEFAULT_PLAYER_SETTINGS
  }
}

// read() falls back to the defaults wherever storage is missing (Node) or
// throws on access (site data blocked, sandboxed frames).
let current: PlayerSettings = read()

function commit(next: PlayerSettings) {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode: the change still holds for this page */
  }
  listeners.forEach((l) => l())
}

export function setPlayerSetting<K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]) {
  commit({ ...current, [key]: value })
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
