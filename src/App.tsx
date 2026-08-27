import { useCallback, useEffect, useRef, useState } from 'react'
import MapView from './components/MapView'
import FleetPanel from './components/FleetPanel'
import { connectFleetSocket, type FleetSocketConnection } from './connectFleetSocket'
import type { FleetUpdate, PlaybackRate } from './types'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001'

export default function App() {
  const [fleet, setFleet] = useState<FleetUpdate | null>(null)
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const socket = useRef<FleetSocketConnection | null>(null)

  useEffect(() => {
    const connection = connectFleetSocket(WS_URL, {
      onConnectionChange: setConnection,
      onFleetUpdate: setFleet,
    })
    socket.current = connection
    return () => connection.disconnect()
  }, [])

  const restart = useCallback(() => {
    socket.current?.send({ type: 'simulation:restart' })
  }, [])

  const setPlaybackRate = useCallback((playbackRate: PlaybackRate) => {
    socket.current?.send({ type: 'simulation:set-speed', playbackRate })
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
      <FleetPanel update={fleet} onRestart={restart} onPlaybackRateChange={setPlaybackRate} />
    </main>
  )
}
