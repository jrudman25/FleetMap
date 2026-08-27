import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectFleetSocket } from './connectFleetSocket'
import type { FleetUpdate } from './types'

class FakeWebSocket {
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []

  readonly url: string
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => { this.readyState = 3 })

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  closeFromServer() {
    this.readyState = 3
    this.onclose?.()
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

describe('connectFleetSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reconnects with backoff capped at ten seconds', () => {
    const statuses: string[] = []
    connectFleetSocket('ws://fleet.test', {
      onConnectionChange: (status) => statuses.push(status),
      onFleetUpdate: vi.fn(),
    })

    expect(FakeWebSocket.instances).toHaveLength(1)
    FakeWebSocket.instances[0].open()
    FakeWebSocket.instances[0].closeFromServer()
    expect(statuses).toEqual(['connecting', 'live', 'offline'])

    for (const delay of [1_000, 2_000, 4_000, 8_000, 10_000, 10_000]) {
      vi.advanceTimersByTime(delay - 1)
      const connectionCount = FakeWebSocket.instances.length
      vi.advanceTimersByTime(1)
      expect(FakeWebSocket.instances).toHaveLength(connectionCount + 1)
      FakeWebSocket.instances.at(-1)?.closeFromServer()
    }
  })

  it('resets reconnect backoff after a connection succeeds', () => {
    const connection = connectFleetSocket('ws://fleet.test', {
      onConnectionChange: vi.fn(),
      onFleetUpdate: vi.fn(),
    })

    FakeWebSocket.instances[0].closeFromServer()
    vi.advanceTimersByTime(1_000)
    FakeWebSocket.instances[1].closeFromServer()
    vi.advanceTimersByTime(2_000)
    FakeWebSocket.instances[2].open()
    FakeWebSocket.instances[2].closeFromServer()
    vi.advanceTimersByTime(1_000)

    expect(FakeWebSocket.instances).toHaveLength(4)
    connection.disconnect()
  })

  it('forwards updates and errors, sends only while open, and stops reconnecting after disconnect', () => {
    const onFleetUpdate = vi.fn()
    const onFleetError = vi.fn()
    const connection = connectFleetSocket('ws://fleet.test', {
      onConnectionChange: vi.fn(),
      onFleetUpdate,
      onFleetError,
    })
    const socket = FakeWebSocket.instances[0]
    const update = { type: 'fleet:update', vehicles: [] } as unknown as FleetUpdate

    expect(connection.send({ type: 'simulation:restart' })).toBe(false)
    socket.open()
    socket.receive(update)
    socket.receive({ type: 'fleet:error', message: 'Route unavailable.' })
    expect(onFleetUpdate).toHaveBeenCalledWith(update)
    expect(onFleetError).toHaveBeenCalledWith('Route unavailable.')
    expect(connection.send({ type: 'simulation:restart' })).toBe(true)
    expect(socket.send).toHaveBeenCalledWith('{"type":"simulation:restart"}')

    connection.disconnect()
    socket.closeFromServer()
    vi.runAllTimers()
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
