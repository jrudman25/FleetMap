import type { LineString } from 'geojson'

export type Coordinates = [number, number]

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
}

export type FleetUpdate = {
  type: 'fleet:update'
  destination: { coordinates: Coordinates; label: string }
  vehicles: Vehicle[]
}
