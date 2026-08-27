import { describe, expect, it, vi } from 'vitest'
import { createFleetCommandProcessor } from './fleetCommandProcessor.js'
import { DEFAULT_DESTINATION, FleetSimulation } from './fleetSimulation.js'

const makeRoute = (origin, destination) => ({
  geometry: { type: 'LineString', coordinates: [origin, destination] },
  durationSeconds: 180,
  distanceMeters: 3_000,
})

async function createProcessor() {
  const fetchRoute = vi.fn(async (origin, destination) => makeRoute([...origin], [...destination]))
  const simulation = new FleetSimulation(fetchRoute, () => 1_000)
  await simulation.initialise()
  const broadcast = vi.fn()
  return { simulation, fetchRoute, broadcast, processCommand: createFleetCommandProcessor(simulation, broadcast) }
}

function createSocket() {
  return { OPEN: 1, readyState: 1, send: vi.fn() }
}

const command = (message) => Buffer.from(JSON.stringify(message))

describe('createFleetCommandProcessor', () => {
  it('applies fleet commands and broadcasts each resulting update', async () => {
    const { simulation, broadcast, processCommand } = await createProcessor()
    const socket = createSocket()
    const destination = { label: 'Space Needle', coordinates: [-122.3493, 47.6205] }

    await processCommand(socket, command({ type: 'fleet:add', name: 'Queen Anne', origin: [-122.356, 47.637] }))
    await processCommand(socket, command({ type: 'fleet:remove', id: 'VAN-02' }))
    await processCommand(socket, command({ type: 'fleet:set-destination', ...destination }))
    await processCommand(socket, command({ type: 'simulation:set-speed', playbackRate: 4 }))

    expect(simulation.snapshot()).toMatchObject({ destination, playbackRate: 4 })
    expect(simulation.snapshot().vehicles.map((vehicle) => vehicle.id)).toEqual(['VAN-01', 'VAN-03', 'VAN-04', 'VAN-05', 'VAN-06'])
    expect(broadcast).toHaveBeenCalledTimes(4)

    await processCommand(socket, command({ type: 'simulation:reset' }))
    expect(simulation.snapshot()).toMatchObject({ destination: DEFAULT_DESTINATION, playbackRate: 1 })
    expect(broadcast).toHaveBeenCalledTimes(5)
  })

  it('ignores malformed, unknown, and unsupported speed commands', async () => {
    const { simulation, broadcast, processCommand } = await createProcessor()
    const socket = createSocket()
    const before = simulation.snapshot()

    await processCommand(socket, Buffer.from('{bad json'))
    await processCommand(socket, command({ type: 'fleet:unknown' }))
    await processCommand(socket, command({ type: 'simulation:set-speed', playbackRate: 3 }))

    expect(simulation.snapshot()).toEqual(before)
    expect(broadcast).not.toHaveBeenCalled()
    expect(socket.send).not.toHaveBeenCalled()
  })

  it('returns command failures only to the requesting open socket', async () => {
    const { broadcast, processCommand } = await createProcessor()
    const requestingSocket = createSocket()
    const otherSocket = createSocket()

    await processCommand(requestingSocket, command({ type: 'fleet:remove', id: 'VAN-99' }))

    expect(requestingSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'fleet:error', message: 'That truck is no longer in the fleet.' }))
    expect(otherSocket.send).not.toHaveBeenCalled()
    expect(broadcast).not.toHaveBeenCalled()

    requestingSocket.readyState = 3
    await processCommand(requestingSocket, command({ type: 'fleet:remove', id: 'VAN-99' }))
    expect(requestingSocket.send).toHaveBeenCalledTimes(1)

    await processCommand(otherSocket, command({ type: 'fleet:add', name: 'Recovered', origin: [-122.356, 47.637] }))
    expect(broadcast).toHaveBeenCalledOnce()
  })

  it('serializes asynchronous commands in arrival order', async () => {
    const { simulation, fetchRoute, broadcast, processCommand } = await createProcessor()
    const socket = createSocket()
    let resolveFirstRoute
    fetchRoute.mockImplementationOnce((origin, destination) => new Promise((resolve) => {
      resolveFirstRoute = () => resolve(makeRoute([...origin], [...destination]))
    }))

    const first = processCommand(socket, command({ type: 'fleet:add', name: 'First', origin: [-122.356, 47.637] }))
    const second = processCommand(socket, command({ type: 'fleet:add', name: 'Second', origin: [-122.35, 47.63] }))
    await Promise.resolve()

    expect(fetchRoute).toHaveBeenCalledTimes(6)
    expect(simulation.snapshot().vehicles).toHaveLength(5)

    resolveFirstRoute()
    await first
    await second

    expect(fetchRoute).toHaveBeenCalledTimes(7)
    expect(simulation.snapshot().vehicles.slice(-2).map((vehicle) => vehicle.name)).toEqual(['First', 'Second'])
    expect(broadcast).toHaveBeenCalledTimes(2)
  })
})
