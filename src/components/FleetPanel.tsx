import { scaleLinear } from 'd3-scale'
import type { FleetUpdate, PlaybackRate, Vehicle } from '../types'

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
  const max = Math.max(...vehicles.map((vehicle) => vehicle.remainingMeters), 1)
  // D3 owns this scale; React uses its numeric output to render the SVG.
  const x = scaleLinear().domain([0, max]).range([0, 174]).nice()
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

export default function FleetPanel({ update, onRestart, onPlaybackRateChange }: { update: FleetUpdate | null; onRestart: () => void; onPlaybackRateChange: (rate: PlaybackRate) => void }) {
  const vehicles = [...(update?.vehicles ?? [])].sort((a, b) => a.remainingSeconds - b.remainingSeconds)
  return <aside className="fleet-panel">
    <div className="panel-topline">
      <div>
        <p className="eyebrow">ARRIVING AT</p>
        <h2>{update?.destination.label ?? 'Connecting to fleet…'}</h2>
      </div>
      <button onClick={onRestart} disabled={!update}>Restart</button>
    </div>

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

    <section className="vehicle-list" aria-label="Vehicle ETAs">
      <p className="section-title">LIVE ETAS <span>{vehicles.length} vehicles</span></p>
      {vehicles.map((vehicle) => <article className="vehicle-row" key={vehicle.id}>
        <span className="color-dot" style={{ background: vehicle.color }} />
        <div className="vehicle-name"><strong>{vehicle.id}</strong><span>{vehicle.name}</span></div>
        <div className="eta"><strong>{vehicle.arrived ? 'Arrived' : formatEta(vehicle.remainingSeconds)}</strong><span>{formatDistance(vehicle.remainingMeters)} left</span></div>
      </article>)}
    </section>

    <section className="chart-section">
      <p className="section-title">REMAINING DISTANCE <span>live</span></p>
      {vehicles.length ? <DistanceChart vehicles={vehicles} /> : <p className="waiting">Waiting for first fleet update…</p>}
    </section>

    <footer>ETAs are OSRM baseline travel times, accelerated for this demo.</footer>
  </aside>
}
