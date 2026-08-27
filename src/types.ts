import type { LineString } from 'geojson'

export type Coordinates = [number, number]
export type PlaybackRate = 0.5 | 1 | 2 | 4
export type AddVehicleInput = { name: string; origin: Coordinates }
export type DestinationInput = { label: string; coordinates: Coordinates }

export type Vehicle = {
  id: string
  name: string
  color: string
  position: Coordinates
  route: LineString
  distanceMeters: number
  remainingMeters: number
  osrmDurationSeconds: number
  remainingSeconds: number
  arrived: boolean
  arrivedAtElapsedSeconds: number | null
}

export type FleetUpdate = {
  type: 'fleet:update'
  destination: { coordinates: Coordinates; label: string }
  elapsedSeconds: number
  playbackRate: PlaybackRate
  vehicles: Vehicle[]
}
