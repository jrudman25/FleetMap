import type { FleetUpdate } from './types'

export type ConnectionStatus = 'connecting' | 'live' | 'offline'

type FleetSocketOptions = {
  onConnectionChange: (status: ConnectionStatus) => void
  onFleetUpdate: (update: FleetUpdate) => void
  onFleetError?: (message: string) => void
}

export type FleetSocketConnection = {
  send: (message: unknown) => boolean
  disconnect: () => void
}

const MAX_RECONNECT_DELAY_MS = 10_000

export function connectFleetSocket(url: string, options: FleetSocketOptions): FleetSocketConnection {
  let socket: WebSocket | null = null
  let reconnectDelay = 1_000
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const connect = () => {
    options.onConnectionChange('connecting')
    const ws = new WebSocket(url)
    socket = ws
    ws.onopen = () => {
      reconnectDelay = 1_000
      options.onConnectionChange('live')
    }
    ws.onclose = () => {
      if (disposed) return
      options.onConnectionChange('offline')
      reconnectTimer = setTimeout(connect, reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
    }
    ws.onerror = () => ws.close()
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as FleetUpdate | { type: 'fleet:error'; message: string }
      if (message.type === 'fleet:update') options.onFleetUpdate(message)
      else if (message.type === 'fleet:error') options.onFleetError?.(message.message)
    }
  }

  connect()

  return {
    send(message) {
      if (socket?.readyState !== WebSocket.OPEN) return false
      socket.send(JSON.stringify(message))
      return true
    },
    disconnect() {
      disposed = true
      clearTimeout(reconnectTimer)
      socket?.close()
      socket = null
    },
  }
}
