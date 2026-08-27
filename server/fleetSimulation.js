import along from '@turf/along'
import length from '@turf/length'
import { lineString } from '@turf/helpers'

export const DEFAULT_DESTINATION = { coordinates: [-122.3321, 47.6062], label: 'Seattle City Hall' }
export const DEFAULT_VEHICLES = [
  { id: 'VAN-01', name: 'Magnolia', color: '#4f8cff', origin: [-122.4094, 47.6489], speedMultiplier: 2.25 },
  { id: 'VAN-02', name: 'Capitol', color: '#f59e0b', origin: [-122.3019, 47.6294], speedMultiplier: 1.8 },
  { id: 'VAN-03', name: 'Harbor', color: '#22c55e', origin: [-122.3721, 47.5707], speedMultiplier: 2.05 },
  { id: 'VAN-04', name: 'Leschi', color: '#e85d75', origin: [-122.2855, 47.5964], speedMultiplier: 1.55 },
  { id: 'VAN-05', name: 'Ballard', color: '#a78bfa', origin: [-122.3864, 47.6720], speedMultiplier: 1.95 },
]

const VEHICLE_COLORS = ['#ef8354', '#2a9d8f', '#e9c46a', '#8b5cf6', '#ec4899', '#06b6d4']
const MAX_FLEET_SIZE = 25

function cloneDestination(destination) {
  return { label: destination.label, coordinates: [...destination.coordinates] }
}

function routeVehicle(vehicle, route, startedAtElapsedSeconds = 0) {
  const line = lineString(route.geometry.coordinates)
  return {
    ...vehicle,
    ...route,
    line,
    routeKilometers: length(line, { units: 'kilometers' }),
    startedAtElapsedSeconds,
  }
}

export function isCoordinates(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every(Number.isFinite)
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90
}

export class FleetSimulation {
  constructor(fetchRoute, now = Date.now) {
    this.fetchRoute = fetchRoute
    this.now = now
    this.fleet = []
    this.defaultFleet = []
    this.destination = cloneDestination(DEFAULT_DESTINATION)
    this.elapsedSimulationSeconds = 0
    this.simulationClockUpdatedAt = now()
    this.playbackRate = 1
    this.nextVehicleNumber = DEFAULT_VEHICLES.length + 1
  }

  async initialise() {
    const routes = await Promise.all(DEFAULT_VEHICLES.map(async (vehicle) => routeVehicle(
      vehicle,
      await this.fetchRoute(vehicle.origin, DEFAULT_DESTINATION.coordinates),
    )))
    this.defaultFleet = routes
    this.reset()
  }

  getElapsedSeconds(now = this.now()) {
    return this.elapsedSimulationSeconds + ((now - this.simulationClockUpdatedAt) / 1000) * this.playbackRate
  }

  setPlaybackRate(nextRate) {
    const now = this.now()
    this.elapsedSimulationSeconds = this.getElapsedSeconds(now)
    this.simulationClockUpdatedAt = now
    this.playbackRate = nextRate
  }

  reset() {
    this.fleet = this.defaultFleet.map((vehicle) => ({ ...vehicle }))
    this.destination = cloneDestination(DEFAULT_DESTINATION)
    this.elapsedSimulationSeconds = 0
    this.simulationClockUpdatedAt = this.now()
    this.playbackRate = 1
    this.nextVehicleNumber = DEFAULT_VEHICLES.length + 1
  }

  vehicleSnapshot(vehicle, elapsedSeconds) {
    const simulatedDuration = Math.max(50, vehicle.durationSeconds / vehicle.speedMultiplier)
    const vehicleElapsedSeconds = Math.max(0, elapsedSeconds - vehicle.startedAtElapsedSeconds)
    const remainingSeconds = Math.max(0, simulatedDuration - vehicleElapsedSeconds)
    const fraction = Math.min(1, vehicleElapsedSeconds / simulatedDuration)
    const point = along(vehicle.line, vehicle.routeKilometers * fraction, { units: 'kilometers' })
    return {
      id: vehicle.id,
      name: vehicle.name,
      color: vehicle.color,
      position: point.geometry.coordinates,
      route: vehicle.geometry,
      distanceMeters: vehicle.distanceMeters,
      remainingMeters: vehicle.distanceMeters * (1 - fraction),
      osrmDurationSeconds: vehicle.durationSeconds,
      remainingSeconds,
      arrived: fraction >= 1,
      arrivedAtElapsedSeconds: fraction >= 1 ? vehicle.startedAtElapsedSeconds + simulatedDuration : null,
    }
  }

  snapshot() {
    const elapsedSeconds = this.getElapsedSeconds()
    return {
      type: 'fleet:update',
      destination: cloneDestination(this.destination),
      elapsedSeconds,
      playbackRate: this.playbackRate,
      vehicles: this.fleet.map((vehicle) => this.vehicleSnapshot(vehicle, elapsedSeconds)),
    }
  }

  async addVehicle({ name, origin }) {
    const trimmedName = typeof name === 'string' ? name.trim() : ''
    if (!trimmedName || trimmedName.length > 40 || !isCoordinates(origin)) throw new Error('Enter a truck name and valid coordinates.')
    if (this.fleet.length >= MAX_FLEET_SIZE) throw new Error(`The fleet is limited to ${MAX_FLEET_SIZE} trucks.`)
    const elapsedSeconds = this.getElapsedSeconds()
    const number = this.nextVehicleNumber
    const vehicle = {
      id: `VAN-${String(number).padStart(2, '0')}`,
      name: trimmedName,
      color: VEHICLE_COLORS[(number - DEFAULT_VEHICLES.length - 1) % VEHICLE_COLORS.length],
      origin: [...origin],
      speedMultiplier: 1.8,
    }
    const route = await this.fetchRoute(vehicle.origin, this.destination.coordinates)
    this.fleet.push(routeVehicle(vehicle, route, elapsedSeconds))
    this.nextVehicleNumber += 1
  }

  removeVehicle(id) {
    if (typeof id !== 'string') throw new Error('Choose a valid truck to remove.')
    const nextFleet = this.fleet.filter((vehicle) => vehicle.id !== id)
    if (nextFleet.length === this.fleet.length) throw new Error('That truck is no longer in the fleet.')
    this.fleet = nextFleet
  }

  async setDestination({ label, coordinates }) {
    const trimmedLabel = typeof label === 'string' ? label.trim() : ''
    if (!trimmedLabel || trimmedLabel.length > 60 || !isCoordinates(coordinates)) throw new Error('Enter a destination name and valid coordinates.')
    const elapsedSeconds = this.getElapsedSeconds()
    const currentVehicles = this.fleet.map((vehicle) => {
      const current = this.vehicleSnapshot(vehicle, elapsedSeconds)
      return { ...vehicle, origin: current.position }
    })
    const rerouted = await Promise.all(currentVehicles.map(async (vehicle) => routeVehicle(
      vehicle,
      await this.fetchRoute(vehicle.origin, coordinates),
      elapsedSeconds,
    )))
    this.destination = { label: trimmedLabel, coordinates: [...coordinates] }
    this.fleet = rerouted
  }
}
