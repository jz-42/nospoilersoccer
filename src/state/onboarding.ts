import { reportSaveFailure, writeStorage } from './storage'

export const ONBOARDED_KEY = 'nss-onboarded'

export function completeOnboarding(dismiss: () => void): void {
  if (!writeStorage(ONBOARDED_KEY, '1')) {
    reportSaveFailure('Your welcome preference was not saved. You can still use the site; the welcome may appear again next visit.')
  }
  dismiss()
}
