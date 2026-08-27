import type { Coordinates } from './types'

export type GeocodedDestination = {
  coordinates: Coordinates
  displayName: string
}

export async function geocodeDestination(serverUrl: string, query: string): Promise<GeocodedDestination> {
  const url = new URL('/api/geocode', serverUrl)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.searchParams.set('q', query.trim())
  const response = await fetch(url.toString())
  const payload: unknown = await response.json()
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : 'Could not look up that destination.'
    throw new Error(message)
  }
  if (typeof payload !== 'object' || !payload || !('coordinates' in payload) || !Array.isArray(payload.coordinates)
    || payload.coordinates.length !== 2 || !payload.coordinates.every(Number.isFinite)
    || !('displayName' in payload) || typeof payload.displayName !== 'string') {
    throw new Error('The destination lookup returned an invalid result.')
  }
  return { coordinates: payload.coordinates as Coordinates, displayName: payload.displayName }
}
