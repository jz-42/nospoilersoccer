export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return localStorage.getItem(key) === value
  } catch {
    return false
  }
}

export function writeStorageCopies(keys: readonly string[], value: string): boolean {
  let saved = false
  for (const key of keys) {
    if (writeStorage(key, value)) saved = true
  }
  return saved
}

export function reportSaveFailure(message: string): void {
  if (typeof window !== 'undefined') window.alert(message)
}

let pendingMutations = 0

function guardRefresh(event: BeforeUnloadEvent): void {
  event.preventDefault()
  event.returnValue = true
}

export function runStorageMutation(name: string, change: () => void): void {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) {
    change()
    return
  }
  const host = typeof window !== 'undefined' ? window : null
  if (pendingMutations++ === 0) host?.addEventListener('beforeunload', guardRefresh)
  const finish = () => {
    if (--pendingMutations === 0) host?.removeEventListener('beforeunload', guardRefresh)
  }
  const failed = () => reportSaveFailure('This change was not saved. Your previous data is unchanged. Please try again.')
  try {
    void navigator.locks.request(name, change).catch(failed).finally(finish)
  } catch {
    finish()
    failed()
  }
}
