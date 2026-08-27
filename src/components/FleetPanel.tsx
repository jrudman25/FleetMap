import { useState, type FormEvent } from 'react'
import { scaleLinear } from 'd3-scale'
import type { AddVehicleInput, DestinationInput, FleetUpdate, PlaybackRate, Vehicle } from '../types'

const PLAYBACK_RATES: PlaybackRate[] = [0.5, 1, 2, 4]
const METERS_PER_MILE = 1609.344

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const clock = `${minutes}:${String(safe % 60).padStart(2, '0')}`
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}` : clock
}
const formatEta = (seconds: number) => formatTime(Math.ceil(seconds))
const formatDistance = (meters: number) => `${(meters / METERS_PER_MILE).toFixed(1)} mi`

function DistanceChart({ vehicles }: { vehicles: Vehicle[] }) {
  const max = Math.max(...vehicles.map((vehicle) => vehicle.distanceMeters), 1)
  // D3 owns this scale; React uses its numeric output to render the SVG.
  const x = scaleLinear().domain([0, max]).range([0, 174])
  return (
    <svg className="distance-chart" viewBox={`0 0 306 ${vehicles.length * 30 + 2}`} role="img" aria-label="Remaining distance by vehicle">
      {vehicles.map((vehicle, index) => {
        const y = index * 30 + 4
        return <g key={vehicle.id}>
          <text x="0" y={y + 13} className="chart-label">{vehicle.id.replace('VAN-', '#')}</text>
          <rect x="38" y={y} width="174" height="16" rx="8" className="chart-track" />
          <rect x="38" y={y} width={x(vehicle.remainingMeters)} height="16" rx="8" fill={vehicle.color} />
          <text x="306" y={y + 13} textAnchor="end" className="chart-value">{formatDistance(vehicle.remainingMeters)}</text>
        </g>
      })}
    </svg>
  )
}

type FleetPanelProps = {
  update: FleetUpdate | null
  error: string | null
  onReset: () => void
  onPlaybackRateChange: (rate: PlaybackRate) => void
  onAddVehicle: (input: AddVehicleInput) => void
  onRemoveVehicle: (id: string) => void
  onDestinationChange: (input: DestinationInput) => void
}

export default function FleetPanel({ update, error, onReset, onPlaybackRateChange, onAddVehicle, onRemoveVehicle, onDestinationChange }: FleetPanelProps) {
  const [editor, setEditor] = useState<'truck' | 'destination' | null>(null)
  const vehicles = [...(update?.vehicles ?? [])].sort((a, b) => a.remainingSeconds - b.remainingSeconds)

  const openDestinationEditor = () => setEditor((current) => current === 'destination' ? null : 'destination')

  const addVehicle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onAddVehicle({
      name: String(data.get('name')),
      origin: [Number(data.get('longitude')), Number(data.get('latitude'))],
    })
    event.currentTarget.reset()
    setEditor(null)
  }

  const setDestination = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    onDestinationChange({
      label: String(data.get('label')),
      coordinates: [Number(data.get('longitude')), Number(data.get('latitude'))],
    })
    setEditor(null)
  }

  return <aside className="fleet-panel">
    <div className="panel-topline">
      <div>
        <p className="eyebrow">ARRIVING AT</p>
        <h2>{update?.destination.label ?? 'Connecting to fleet…'}</h2>
      </div>
      <div className="topline-actions">
        <button type="button" className="secondary-button" onClick={openDestinationEditor} disabled={!update}>Edit</button>
        <button type="button" onClick={onReset} disabled={!update}>Reset</button>
      </div>
    </div>

    {editor === 'destination' && <form className="fleet-editor" onSubmit={setDestination}>
      <div className="editor-heading"><strong>Change destination</strong><button type="button" onClick={() => setEditor(null)} aria-label="Close destination editor">Close</button></div>
      <label>Destination name<input name="label" maxLength={60} required defaultValue={update?.destination.label} /></label>
      <div className="coordinate-fields">
        <label>Longitude<input name="longitude" type="number" min="-180" max="180" step="any" required defaultValue={update?.destination.coordinates[0]} /></label>
        <label>Latitude<input name="latitude" type="number" min="-90" max="90" step="any" required defaultValue={update?.destination.coordinates[1]} /></label>
      </div>
      <button type="submit">Reroute fleet</button>
    </form>}

    <section className="simulation-controls" aria-label="Simulation controls">
      <div className="elapsed-time">
        <span>TIME ELAPSED</span>
        <strong>{formatTime(update?.elapsedSeconds ?? 0)}</strong>
      </div>
      <div className="speed-control">
        <span id="speed-label">SPEED</span>
        <div className="speed-options" role="group" aria-labelledby="speed-label">
          {PLAYBACK_RATES.map((rate) => <button
            key={rate}
            type="button"
            className={update?.playbackRate === rate ? 'active' : ''}
            aria-pressed={update?.playbackRate === rate}
            disabled={!update}
            onClick={() => onPlaybackRateChange(rate)}
          >{rate}x</button>)}
        </div>
      </div>
    </section>

    {error && <p className="fleet-error" role="alert">{error}</p>}

    <section className="vehicle-list" aria-label="Vehicle ETAs">
      <p className="section-title">LIVE ETAS <span>{vehicles.length} trucks</span></p>
      <div className="vehicle-rows">
        {vehicles.map((vehicle) => <article className="vehicle-row" key={vehicle.id}>
          <span className="color-dot" style={{ background: vehicle.color }} />
          <div className="vehicle-name"><strong>{vehicle.id}</strong><span>{vehicle.name}</span></div>
          <div className="eta">
            <strong>{vehicle.arrived ? 'Arrived' : formatEta(vehicle.remainingSeconds)}</strong>
            <span>{vehicle.arrived && vehicle.arrivedAtElapsedSeconds !== null ? `at ${formatTime(vehicle.arrivedAtElapsedSeconds)} elapsed` : `${formatDistance(vehicle.remainingMeters)} left`}</span>
          </div>
          <button type="button" className="remove-truck" onClick={() => onRemoveVehicle(vehicle.id)} aria-label={`Remove ${vehicle.id}`}>Remove</button>
        </article>)}
        {!vehicles.length && update && <p className="waiting">No trucks in the fleet.</p>}
      </div>
      <button type="button" className="add-truck" onClick={() => setEditor((current) => current === 'truck' ? null : 'truck')} disabled={!update}>Add truck</button>
    </section>

    {editor === 'truck' && <form className="fleet-editor truck-editor" onSubmit={addVehicle}>
      <div className="editor-heading"><strong>New truck</strong><button type="button" onClick={() => setEditor(null)} aria-label="Close truck editor">Close</button></div>
      <label>Truck name<input name="name" maxLength={40} placeholder="Queen Anne" required /></label>
      <div className="coordinate-fields">
        <label>Start longitude<input name="longitude" type="number" min="-180" max="180" step="any" placeholder="-122.356" required /></label>
        <label>Start latitude<input name="latitude" type="number" min="-90" max="90" step="any" placeholder="47.637" required /></label>
      </div>
      <button type="submit">Add to fleet</button>
    </form>}

    <section className="chart-section">
      <p className="section-title">REMAINING DISTANCE <span>live</span></p>
      {vehicles.length ? <DistanceChart vehicles={vehicles} /> : <p className="waiting">Add a truck to see route distances.</p>}
    </section>

    <footer>ETAs are OSRM baseline travel times, accelerated for this demo.</footer>
  </aside>
}
