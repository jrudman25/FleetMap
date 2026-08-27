import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocodeDestination } from './geocodeDestination'

afterEach(() => vi.unstubAllGlobals())

describe('geocodeDestination', () => {
  it('uses the fleet server and returns destination coordinates', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      coordinates: [-122.3493, 47.6205],
      displayName: 'Space Needle, Seattle, King County, Washington, United States',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)

    await expect(geocodeDestination('ws://localhost:3001', ' Space Needle ')).resolves.toEqual({
      coordinates: [-122.3493, 47.6205],
      displayName: 'Space Needle, Seattle, King County, Washington, United States',
    })
    expect(fetch).toHaveBeenCalledWith('http://localhost:3001/api/geocode?q=Space+Needle')
  })

  it('surfaces a server lookup error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'No Seattle destination found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(geocodeDestination('wss://fleet.example.test', 'Unknown')).rejects.toThrow('No Seattle destination found.')
  })
})
