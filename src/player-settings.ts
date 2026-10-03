import { useSyncExternalStore } from 'react'
import { readStorage, reportSaveFailure, runStorageMutation, writeStorage, writeStorageCopies } from './state/storage'

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
  showChapters: boolean
  showMoreVideos: boolean
  skipSeconds: number
}

export const SKIP_CHOICES = [5, 10, 15, 30] as const

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  showElapsed: true,
  showTotal: false,
  showProgress: false,
  showTitle: false,
  showChapters: false,
  showMoreVideos: false,
  skipSeconds: 5,
}

const KEY = 'nss-player-settings'
const BACKUP_KEY = 'nss-player-settings-last-good'
const BASE_KEY = 'nss-player-settings-legacy-base'
const listeners = new Set<() => void>()

type StoredPlayerSettings = PlayerSettings & { __nssRevision?: number }

function revision(settings: StoredPlayerSettings): number {
  return Number.isSafeInteger(settings.__nssRevision) && settings.__nssRevision! > 0
    ? settings.__nssRevision!
    : 0
}

function readKey(key: string): StoredPlayerSettings | null {
  try {
    const raw = readStorage(key)
    if (raw === null) return null
    const saved = JSON.parse(raw) as Partial<StoredPlayerSettings>
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

export function readPlayerSettings(repair = false): StoredPlayerSettings | null {
  const primary = readKey(KEY)
  const backup = readKey(BACKUP_KEY)
  if (!backup) {
    if (primary && repair) {
      const value = JSON.stringify(primary)
      writeStorage(BASE_KEY, value)
      writeStorage(BACKUP_KEY, value)
    } else if (repair && !primary && !readKey(BASE_KEY)) {
      // The first setting must have a before-state to compare an older tab to.
      writeStorage(BASE_KEY, JSON.stringify(DEFAULT_PLAYER_SETTINGS))
    }
    return primary
  }
  if (!primary) return backup
  const primaryRevision = revision(primary)
  const backupRevision = revision(backup)
  if (primaryRevision > backupRevision) return primary
  if (primaryRevision > 0 && backupRevision > primaryRevision) return backup
  let baseline = readKey(BASE_KEY)
  if (!baseline) {
    // Existing copies disagree, but without a baseline neither one proves
    // that the primary's differences are fresh old-tab edits. Keep the backup.
    baseline = primary
    if (repair) writeStorage(BASE_KEY, JSON.stringify(baseline))
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
    if (key === '__nssRevision') continue
    if (key in DEFAULT_PLAYER_SETTINGS || primaryFields[key] === baselineFields[key]) continue
    observedFields[key] = primaryFields[key]
    observedChange = true
    if (backupFields[key] === baselineFields[key]) mergedFields[key] = primaryFields[key]
  }
  const value = JSON.stringify(merged)
  let durable = value === JSON.stringify(backup)
  if (repair && (value !== JSON.stringify(primary) || !durable)) {
    writeStorage(KEY, value)
    if (!durable) durable = writeStorage(BACKUP_KEY, value)
  }
  if (repair && observedChange && durable) {
    writeStorage(BASE_KEY, JSON.stringify(observed))
  }
  return merged
}

// readPlayerSettings() falls back to the defaults wherever storage is missing (Node) or
// throws on access (site data blocked, sandboxed frames).
let current: StoredPlayerSettings = readPlayerSettings() ?? DEFAULT_PLAYER_SETTINGS

if (typeof window !== 'undefined') {
  const refresh = () => runStorageMutation(KEY, () => {
    const latest = readPlayerSettings(true)
    if (!latest) return
    if (revision(latest) > 0 && revision(latest) < revision(current)) return
    current = latest
    listeners.forEach((listener) => listener())
  })
  refresh()
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== BACKUP_KEY) return
    refresh()
  })
}

function commit(next: StoredPlayerSettings) {
  const revised = { ...next, __nssRevision: Math.max(revision(next), revision(current)) + 1 }
  if (!writeStorageCopies([BACKUP_KEY, KEY], JSON.stringify(revised))) {
    reportSaveFailure('This player preference was not saved. Your previous settings are unchanged. Check browser storage and try again.')
    return
  }
  current = revised
  listeners.forEach((l) => l())
}

function latestSettings(): StoredPlayerSettings {
  const stored = readPlayerSettings(true)
  if (stored && revision(stored) > 0 && revision(stored) < revision(current)) return current
  return { ...current, ...stored }
}

export function setPlayerSetting<K extends keyof PlayerSettings>(key: K, value: PlayerSettings[K]) {
  runStorageMutation(KEY, () => commit({ ...latestSettings(), [key]: value }))
}

export function resetPlayerSettings() {
  runStorageMutation(KEY, () => commit({ ...latestSettings(), ...DEFAULT_PLAYER_SETTINGS }))
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
