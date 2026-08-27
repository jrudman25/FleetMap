import { useCallback, useEffect, useRef, useState } from 'react'
import MapView from './components/MapView'
import FleetPanel from './components/FleetPanel'
import { connectFleetSocket, type FleetSocketConnection } from './connectFleetSocket'
import type { AddVehicleInput, DestinationInput, FleetUpdate, PlaybackRate } from './types'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001'

export default function App() {
  const [fleet, setFleet] = useState<FleetUpdate | null>(null)
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [fleetError, setFleetError] = useState<string | null>(null)
  const socket = useRef<FleetSocketConnection | null>(null)

  useEffect(() => {
    const connection = connectFleetSocket(WS_URL, {
      onConnectionChange: setConnection,
      onFleetUpdate: setFleet,
      onFleetError: setFleetError,
    })
    socket.current = connection
    return () => connection.disconnect()
  }, [])

  const sendCommand = useCallback((message: unknown) => {
    setFleetError(null)
    if (!socket.current?.send(message)) setFleetError('Fleet connection is offline. Try again when it reconnects.')
  }, [])

  const reset = useCallback(() => sendCommand({ type: 'simulation:reset' }), [sendCommand])
  const setPlaybackRate = useCallback((playbackRate: PlaybackRate) => sendCommand({ type: 'simulation:set-speed', playbackRate }), [sendCommand])
  const addVehicle = useCallback((input: AddVehicleInput) => sendCommand({ type: 'fleet:add', ...input }), [sendCommand])
  const removeVehicle = useCallback((id: string) => sendCommand({ type: 'fleet:remove', id }), [sendCommand])
  const setDestination = useCallback((input: DestinationInput) => sendCommand({ type: 'fleet:set-destination', ...input }), [sendCommand])

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
      <FleetPanel
        update={fleet}
        error={fleetError}
        onReset={reset}
        onPlaybackRateChange={setPlaybackRate}
        onAddVehicle={addVehicle}
        onRemoveVehicle={removeVehicle}
        onDestinationChange={setDestination}
      />
    </main>
  )
}
