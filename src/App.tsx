import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import MapView from './components/MapView'
import FleetPanel from './components/FleetPanel'
import { connectFleetSocket, type FleetSocketConnection } from './connectFleetSocket'
import { geocodeDestination } from './geocodeDestination'
import { loadPreferences, savePreferences, type DistanceUnit, type Preferences, type Theme } from './preferences'
import type { AddVehicleInput, DestinationInput, FleetUpdate, PlaybackRate } from './types'

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001'

function SettingsMenu({ preferences, onChange }: { preferences: Preferences, onChange: (preferences: Preferences) => void }) {
  const setDistanceUnit = (distanceUnit: DistanceUnit) => onChange({ ...preferences, distanceUnit })
  const setTheme = (theme: Theme) => onChange({ ...preferences, theme })

  return <details className="settings-menu">
    <summary aria-label="Open display settings" title="Settings">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </summary>
    <div className="settings-popover">
      <div className="settings-heading"><strong>Display settings</strong><span>Saved on this device</span></div>
      <div className="setting-row">
        <span id="distance-unit-label">Distance</span>
        <div className="setting-options" role="group" aria-labelledby="distance-unit-label">
          <button type="button" className={preferences.distanceUnit === 'miles' ? 'active' : ''} aria-pressed={preferences.distanceUnit === 'miles'} onClick={() => setDistanceUnit('miles')}>Miles</button>
          <button type="button" className={preferences.distanceUnit === 'kilometers' ? 'active' : ''} aria-pressed={preferences.distanceUnit === 'kilometers'} onClick={() => setDistanceUnit('kilometers')}>Kilometers</button>
        </div>
      </div>
      <div className="setting-row">
        <span id="theme-label">Appearance</span>
        <div className="setting-options" role="group" aria-labelledby="theme-label">
          <button type="button" className={preferences.theme === 'light' ? 'active' : ''} aria-pressed={preferences.theme === 'light'} onClick={() => setTheme('light')}>Light</button>
          <button type="button" className={preferences.theme === 'dark' ? 'active' : ''} aria-pressed={preferences.theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
        </div>
      </div>
    </div>
  </details>
}

export default function App() {
  const [fleet, setFleet] = useState<FleetUpdate | null>(null)
  const [connection, setConnection] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const [fleetError, setFleetError] = useState<string | null>(null)
  const [preferences, setPreferences] = useState(loadPreferences)
  const socket = useRef<FleetSocketConnection | null>(null)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
  }, [preferences.theme])

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
  const setPaused = useCallback((paused: boolean) => sendCommand({ type: 'simulation:set-paused', paused }), [sendCommand])
  const setPlaybackRate = useCallback((playbackRate: PlaybackRate) => sendCommand({ type: 'simulation:set-speed', playbackRate }), [sendCommand])
  const lookupDestination = useCallback((query: string) => geocodeDestination(WS_URL, query), [])
  const addVehicle = useCallback((input: AddVehicleInput) => sendCommand({ type: 'fleet:add', ...input }), [sendCommand])
  const removeVehicle = useCallback((id: string) => sendCommand({ type: 'fleet:remove', id }), [sendCommand])
  const setDestination = useCallback((input: DestinationInput) => sendCommand({ type: 'fleet:set-destination', ...input }), [sendCommand])
  const updatePreferences = useCallback((preferences: Preferences) => {
    setPreferences(preferences)
    savePreferences(preferences)
  }, [])

  return (
    <main className="app-shell" data-theme={preferences.theme}>
      <section className="map-section" aria-label="Live vehicle map">
        <div className="map-header">
          <div>
            <p className="eyebrow">FLEETMAP / SEATTLE</p>
            <h1>Live dispatch</h1>
          </div>
          <div className={`connection ${connection}`}><i /> {connection === 'live' ? 'WebSocket live' : connection}</div>
        </div>
        <MapView update={fleet} theme={preferences.theme} />
        <div className="map-note">Real OSRM road routes · Simulated vehicle movement</div>
      </section>
      <FleetPanel
        update={fleet}
        error={fleetError}
        distanceUnit={preferences.distanceUnit}
        settingsMenu={<SettingsMenu preferences={preferences} onChange={updatePreferences} />}
        onReset={reset}
        onPausedChange={setPaused}
        onPlaybackRateChange={setPlaybackRate}
        onDestinationLookup={lookupDestination}
        onAddVehicle={addVehicle}
        onRemoveVehicle={removeVehicle}
        onDestinationChange={setDestination}
      />
    </main>
  )
}
