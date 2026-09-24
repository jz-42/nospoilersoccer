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
const BACKUP_KEY = 'nss-player-settings-last-good'
const BASE_KEY = 'nss-player-settings-legacy-base'
const listeners = new Set<() => void>()

function readKey(key: string): PlayerSettings | null {
  try {
    const raw = localStorage.getItem(key)
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

function readStored(): PlayerSettings | null {
  const primary = readKey(KEY)
  const backup = readKey(BACKUP_KEY)
  if (!backup) {
    if (primary) {
      try {
        const value = JSON.stringify(primary)
        localStorage.setItem(BASE_KEY, value)
        localStorage.setItem(BACKUP_KEY, value)
      } catch {
        // Keep the original save when browser storage cannot hold extra copies.
      }
    } else if (!readKey(BASE_KEY)) {
      // The first setting must have a before-state to compare an older tab to.
      try { localStorage.setItem(BASE_KEY, JSON.stringify(DEFAULT_PLAYER_SETTINGS)) } catch { /* storage unavailable */ }
    }
    return primary
  }
  if (!primary) return backup
  let baseline = readKey(BASE_KEY)
  if (!baseline) {
    // Existing copies disagree, but without a baseline neither one proves
    // that the primary's differences are fresh old-tab edits. Keep the backup.
    baseline = primary
    try {
      localStorage.setItem(BASE_KEY, JSON.stringify(baseline))
    } catch {
      // The backup still protects the most recent known preferences.
    }
    return backup
  }
  if (JSON.stringify(primary) === JSON.stringify(backup)) return backup
  const merged = { ...backup }
  const observed = { ...baseline }
  let observedChange = false
  for (const key of Object.keys(DEFAULT_PLAYER_SETTINGS) as (keyof PlayerSettings)[]) {
    if (primary[key] !== baseline[key]) {
      ;(observed as Record<keyof PlayerSettings, boolean | number>)[key] = primary[key]
      observedChange = true
      if (backup[key] === baseline[key]) {
        // An old tab changed this choice after the newer tab took its backup.
        ;(merged as Record<keyof PlayerSettings, boolean | number>)[key] = primary[key]
      }
    }
  }
  const primaryFields = primary as unknown as Record<string, unknown>
  const backupFields = backup as unknown as Record<string, unknown>
  const baselineFields = baseline as unknown as Record<string, unknown>
  const mergedFields = merged as unknown as Record<string, unknown>
  const observedFields = observed as unknown as Record<string, unknown>
  for (const key of Object.keys(primaryFields)) {
    if (key in DEFAULT_PLAYER_SETTINGS || primaryFields[key] === baselineFields[key]) continue
    observedFields[key] = primaryFields[key]
    observedChange = true
    if (backupFields[key] === baselineFields[key]) mergedFields[key] = primaryFields[key]
  }
  const value = JSON.stringify(merged)
  let durable = value === JSON.stringify(backup)
  if (value !== JSON.stringify(primary) || !durable) {
    try { localStorage.setItem(KEY, value) } catch { /* backup can still hold it */ }
    if (!durable) {
      try {
        localStorage.setItem(BACKUP_KEY, value)
        durable = true
      } catch {
        // Keep the old baseline so this change can be retried later.
      }
    }
  }
  if (observedChange && durable) {
    try { localStorage.setItem(BASE_KEY, JSON.stringify(observed)) } catch { /* backup still protects the save */ }
  }
  return merged
}

// readStored() falls back to the defaults wherever storage is missing (Node) or
// throws on access (site data blocked, sandboxed frames).
let current: PlayerSettings = readStored() ?? DEFAULT_PLAYER_SETTINGS
let warned = false

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== BACKUP_KEY) return
    current = readStored() ?? DEFAULT_PLAYER_SETTINGS
    listeners.forEach((listener) => listener())
  })
}

function commit(next: PlayerSettings) {
  current = next
  let saved = false
  for (const key of [KEY, BACKUP_KEY]) {
    try {
      localStorage.setItem(key, JSON.stringify(next))
      saved = true
    } catch {
      // One surviving copy still protects these preferences.
    }
  }
  if (!saved) {
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
