import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startWebSocketHeartbeat, trackWebSocketHeartbeat } from './webSocketHeartbeat.js'

class FakeSocket extends EventEmitter {
  ping = vi.fn()
  terminate = vi.fn()
}

class FakeWebSocketServer extends EventEmitter {
  clients = new Set()
}

describe('WebSocket heartbeat', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('keeps responsive sockets alive', () => {
    const wss = new FakeWebSocketServer()
    const socket = new FakeSocket()
    wss.clients.add(socket)
    trackWebSocketHeartbeat(socket)
    startWebSocketHeartbeat(wss, 30_000)

    vi.advanceTimersByTime(30_000)
    expect(socket.ping).toHaveBeenCalledOnce()
    socket.emit('pong')
    vi.advanceTimersByTime(30_000)

    expect(socket.ping).toHaveBeenCalledTimes(2)
    expect(socket.terminate).not.toHaveBeenCalled()
  })

  it('terminates a socket that does not answer a ping', () => {
    const wss = new FakeWebSocketServer()
    const socket = new FakeSocket()
    wss.clients.add(socket)
    trackWebSocketHeartbeat(socket)
    startWebSocketHeartbeat(wss, 30_000)

    vi.advanceTimersByTime(60_000)

    expect(socket.ping).toHaveBeenCalledOnce()
    expect(socket.terminate).toHaveBeenCalledOnce()
  })

  it('stops heartbeat checks when the server closes', () => {
    const wss = new FakeWebSocketServer()
    const socket = new FakeSocket()
    wss.clients.add(socket)
    trackWebSocketHeartbeat(socket)
    startWebSocketHeartbeat(wss, 30_000)

    wss.emit('close')
    vi.advanceTimersByTime(60_000)

    expect(socket.ping).not.toHaveBeenCalled()
    expect(socket.terminate).not.toHaveBeenCalled()
  })
})
