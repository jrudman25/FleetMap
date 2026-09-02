export type DistanceUnit = 'miles' | 'kilometers'
export type Theme = 'light' | 'dark'

export type Preferences = {
  distanceUnit: DistanceUnit
  theme: Theme
}

const STORAGE_KEY = 'fleetmap:preferences'

export const resolvePreferences = (saved: string | null, prefersDark: boolean): Preferences => {
  const defaults: Preferences = { distanceUnit: 'miles', theme: prefersDark ? 'dark' : 'light' }
  if (!saved) return defaults
  try {
    const parsed = JSON.parse(saved) as Partial<Preferences>
    return {
      distanceUnit: parsed.distanceUnit === 'kilometers' || parsed.distanceUnit === 'miles' ? parsed.distanceUnit : defaults.distanceUnit,
      theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : defaults.theme,
    }
  } catch {
    return defaults
  }
}

export const loadPreferences = () => {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  try {
    return resolvePreferences(window.localStorage.getItem(STORAGE_KEY), prefersDark)
  } catch {
    return resolvePreferences(null, prefersDark)
  }
}

export const savePreferences = (preferences: Preferences) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    return
  }
}
