import { useCallback, useEffect, useRef, useState } from 'react'
import MapView from './components/MapView'
import FleetPanel from './components/FleetPanel'
import type { FleetUpdate } from './types'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001'

export default function App() {
  const [fleet, setFleet] = useState<FleetUpdate | null>(null)
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const socket = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    socket.current = ws
    ws.onopen = () => setConnection('live')
    ws.onclose = () => setConnection('offline')
    ws.onerror = () => setConnection('offline')
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as FleetUpdate
      if (message.type === 'fleet:update') setFleet(message)
    }
    return () => ws.close()
  }, [])

  const restart = useCallback(() => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: 'simulation:restart' }))
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="map-section" aria-label="Live vehicle map">
        <div className="map-header">
          <div>
            <p className="eyebrow">FLEETMAP / SEATTLE</p>
            <h1>Live dispatch</h1>
          </div>
          <div className={`connection ${connection}`}><i /> {connection === 'live' ? 'WebSocket live' : connection}</div>
        </div>
        <MapView update={fleet} />
        <div className="map-note">Real OSRM road routes · Simulated vehicle movement</div>
      </section>
      <FleetPanel update={fleet} onRestart={restart} />
    </main>
  )
}
