import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DESTINATION, FleetSimulation, isCoordinates } from './fleetSimulation.js'

const makeRoute = (origin, destination) => ({
  geometry: { type: 'LineString', coordinates: [origin, destination] },
  durationSeconds: 180,
  distanceMeters: 3_000,
})

function createSimulation() {
  let now = 1_000
  const fetchRoute = vi.fn(async (origin, destination) => makeRoute([...origin], [...destination]))
  const simulation = new FleetSimulation(fetchRoute, () => now)
  return { simulation, fetchRoute, advance: (milliseconds) => { now += milliseconds } }
}

describe('FleetSimulation', () => {
  it('adds and removes trucks without rewinding the active fleet', async () => {
    const { simulation, advance } = createSimulation()
    await simulation.initialise()
    advance(10_000)
    const existingPosition = simulation.snapshot().vehicles[0].position

    await simulation.addVehicle({ name: 'Queen Anne', origin: [-122.356, 47.637] })
    const afterAdd = simulation.snapshot()

    expect(afterAdd.vehicles).toHaveLength(6)
    expect(afterAdd.vehicles[0].position).toEqual(existingPosition)
    expect(afterAdd.vehicles[5]).toMatchObject({ id: 'VAN-06', name: 'Queen Anne', position: [-122.356, 47.637] })

    simulation.removeVehicle('VAN-02')
    expect(simulation.snapshot().vehicles.map((vehicle) => vehicle.id)).not.toContain('VAN-02')
  })

  it('reroutes every truck from its current position to a new shared destination', async () => {
    const { simulation, fetchRoute, advance } = createSimulation()
    await simulation.initialise()
    advance(12_000)
    const positions = simulation.snapshot().vehicles.map((vehicle) => vehicle.position)
    const destination = { label: 'Space Needle', coordinates: [-122.3493, 47.6205] }

    await simulation.setDestination(destination)
    const update = simulation.snapshot()

    expect(update.destination).toEqual(destination)
    expect(update.vehicles.map((vehicle) => vehicle.position)).toEqual(positions)
    expect(fetchRoute.mock.calls.slice(-5).map((call) => call[1])).toEqual(Array(5).fill(destination.coordinates))
  })

  it('continues moving along new routes after a destination change', async () => {
    const { simulation, advance } = createSimulation()
    await simulation.initialise()
    advance(12_000)
    const reroutePositions = simulation.snapshot().vehicles.map((vehicle) => vehicle.position)

    await simulation.setDestination({ label: 'Space Needle', coordinates: [-122.3493, 47.6205] })
    advance(10_000)
    const movedPositions = simulation.snapshot().vehicles.map((vehicle) => vehicle.position)

    movedPositions.forEach((position, index) => expect(position).not.toEqual(reroutePositions[index]))
  })

  it('applies the same acceleration to every truck after a destination change', async () => {
    const { simulation, advance } = createSimulation()
    await simulation.initialise()
    await simulation.setDestination({ label: 'Space Needle', coordinates: [-122.3493, 47.6205] })

    advance(10_000)
    const remainingFractions = simulation.snapshot().vehicles.map((vehicle) => vehicle.remainingMeters / vehicle.distanceMeters)

    expect(remainingFractions.every((fraction) => fraction === remainingFractions[0])).toBe(true)
  })

  it('routes added trucks to the current destination', async () => {
    const { simulation, fetchRoute } = createSimulation()
    await simulation.initialise()
    const destination = { label: 'Space Needle', coordinates: [-122.3493, 47.6205] }
    await simulation.setDestination(destination)
    fetchRoute.mockClear()

    await simulation.addVehicle({ name: 'Queen Anne', origin: [-122.356, 47.637] })

    expect(fetchRoute).toHaveBeenCalledOnce()
    expect(fetchRoute).toHaveBeenCalledWith([-122.356, 47.637], destination.coordinates)
  })

  it('leaves fleet state and truck numbering unchanged when adding a route fails', async () => {
    const { simulation, fetchRoute } = createSimulation()
    await simulation.initialise()
    const before = simulation.snapshot()
    fetchRoute.mockRejectedValueOnce(new Error('Route unavailable.'))

    await expect(simulation.addVehicle({ name: 'Failed', origin: [-122.356, 47.637] })).rejects.toThrow('Route unavailable.')
    expect(simulation.snapshot()).toEqual(before)

    await simulation.addVehicle({ name: 'Successful', origin: [-122.356, 47.637] })
    expect(simulation.snapshot().vehicles.at(-1)?.id).toBe('VAN-06')
  })

  it('leaves fleet state unchanged when rerouting fails', async () => {
    const { simulation, fetchRoute, advance } = createSimulation()
    await simulation.initialise()
    advance(12_000)
    const before = simulation.snapshot()
    fetchRoute.mockRejectedValueOnce(new Error('Route unavailable.'))

    await expect(simulation.setDestination({ label: 'Space Needle', coordinates: [-122.3493, 47.6205] })).rejects.toThrow('Route unavailable.')

    expect(simulation.snapshot()).toEqual(before)
  })

  it('enforces the fleet size limit and permits a replacement after removal', async () => {
    const { simulation } = createSimulation()
    await simulation.initialise()

    for (let number = 6; number <= 25; number += 1) {
      await simulation.addVehicle({ name: `Truck ${number}`, origin: [-122.356, 47.637] })
    }

    await expect(simulation.addVehicle({ name: 'Truck 26', origin: [-122.356, 47.637] })).rejects.toThrow('limited to 25 trucks')
    expect(simulation.snapshot().vehicles).toHaveLength(25)

    simulation.removeVehicle('VAN-10')
    await simulation.addVehicle({ name: 'Replacement', origin: [-122.356, 47.637] })
    expect(simulation.snapshot().vehicles).toHaveLength(25)
    expect(simulation.snapshot().vehicles.at(-1)).toMatchObject({ id: 'VAN-26', name: 'Replacement' })
  })

  it('pauses and resumes the shared simulation clock without changing its speed', async () => {
    const { simulation, advance } = createSimulation()
    await simulation.initialise()
    advance(10_000)

    simulation.setPaused(true)
    const paused = simulation.snapshot()
    advance(20_000)

    expect(paused).toMatchObject({ elapsedSeconds: 10, isPaused: true, playbackRate: 1 })
    expect(simulation.snapshot()).toEqual(paused)

    simulation.setPlaybackRate(4)
    simulation.setPaused(false)
    advance(2_000)

    expect(simulation.snapshot()).toMatchObject({ elapsedSeconds: 18, isPaused: false, playbackRate: 4 })
  })

  it('resets the fleet, destination, speed, pause state, clock, and truck numbering', async () => {
    const { simulation, advance } = createSimulation()
    await simulation.initialise()
    await simulation.addVehicle({ name: 'Added', origin: [-122.35, 47.63] })
    simulation.removeVehicle('VAN-01')
    simulation.setPlaybackRate(4)
    simulation.setPaused(true)
    advance(5_000)

    simulation.reset()
    const update = simulation.snapshot()
    await simulation.addVehicle({ name: 'Next', origin: [-122.35, 47.63] })

    expect(update).toMatchObject({ destination: DEFAULT_DESTINATION, elapsedSeconds: 0, playbackRate: 1, isPaused: false })
    expect(update.vehicles.map((vehicle) => vehicle.id)).toEqual(['VAN-01', 'VAN-02', 'VAN-03', 'VAN-04', 'VAN-05'])
    expect(simulation.snapshot().vehicles.at(-1)?.id).toBe('VAN-06')
  })

  it('accepts coordinate and text length boundaries', async () => {
    const { simulation } = createSimulation()
    await simulation.initialise()

    expect(isCoordinates([-180, -90])).toBe(true)
    expect(isCoordinates([180, 90])).toBe(true)
    await simulation.addVehicle({ name: 'a'.repeat(40), origin: [-180, -90] })
    await simulation.setDestination({ label: 'b'.repeat(60), coordinates: [180, 90] })

    expect(simulation.snapshot()).toMatchObject({
      destination: { label: 'b'.repeat(60), coordinates: [180, 90] },
      vehicles: expect.arrayContaining([expect.objectContaining({ name: 'a'.repeat(40) })]),
    })
  })

  it('rejects invalid coordinates, text lengths, and truck identifiers', async () => {
    const { simulation } = createSimulation()
    await simulation.initialise()

    expect(isCoordinates([-181, 47.6])).toBe(false)
    expect(isCoordinates([0, 91])).toBe(false)
    expect(isCoordinates([Number.NaN, 0])).toBe(false)
    expect(isCoordinates([Number.POSITIVE_INFINITY, 0])).toBe(false)
    await expect(simulation.addVehicle({ name: '', origin: [-122.3, 47.6] })).rejects.toThrow('valid coordinates')
    await expect(simulation.addVehicle({ name: 'a'.repeat(41), origin: [-122.3, 47.6] })).rejects.toThrow('valid coordinates')
    await expect(simulation.setDestination({ label: 'Nowhere', coordinates: [0, 91] })).rejects.toThrow('valid coordinates')
    await expect(simulation.setDestination({ label: 'b'.repeat(61), coordinates: [-122.3, 47.6] })).rejects.toThrow('valid coordinates')
    expect(() => simulation.removeVehicle(1)).toThrow('valid truck')
    expect(() => simulation.removeVehicle('VAN-99')).toThrow('no longer in the fleet')
  })
})
