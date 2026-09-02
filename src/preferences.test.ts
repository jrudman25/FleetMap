import { describe, expect, it } from 'vitest'
import { formatDistance } from './components/FleetPanel'
import { resolvePreferences } from './preferences'

describe('resolvePreferences', () => {
  it('uses the system color preference and miles by default', () => {
    expect(resolvePreferences(null, true)).toEqual({ distanceUnit: 'miles', theme: 'dark' })
    expect(resolvePreferences(null, false)).toEqual({ distanceUnit: 'miles', theme: 'light' })
  })

  it('restores valid saved preferences', () => {
    expect(resolvePreferences('{"distanceUnit":"kilometers","theme":"dark"}', false)).toEqual({
      distanceUnit: 'kilometers',
      theme: 'dark',
    })
  })

  it('falls back safely when saved preferences are invalid', () => {
    expect(resolvePreferences('{"distanceUnit":"leagues","theme":"dim"}', true)).toEqual({
      distanceUnit: 'miles',
      theme: 'dark',
    })
    expect(resolvePreferences('not json', false)).toEqual({ distanceUnit: 'miles', theme: 'light' })
  })
})

describe('formatDistance', () => {
  it('formats meters in the selected unit', () => {
    expect(formatDistance(1609.344, 'miles')).toBe('1.0 mi')
    expect(formatDistance(1609.344, 'kilometers')).toBe('1.6 km')
  })
})
