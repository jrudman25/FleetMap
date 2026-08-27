import { scaleLinear } from 'd3-scale'
import type { FleetUpdate, Vehicle } from '../types'

const formatEta = (seconds: number) => {
  const safe = Math.max(0, Math.ceil(seconds))
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`
}
const formatDistance = (meters: number) => meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`

function DistanceChart({ vehicles }: { vehicles: Vehicle[] }) {
  const max = Math.max(...vehicles.map((vehicle) => vehicle.remainingMeters), 1)
  // D3 owns this scale; React uses its numeric output to render the SVG.
  const x = scaleLinear().domain([0, max]).range([0, 196]).nice()
  return (
    <svg className="distance-chart" viewBox={`0 0 252 ${vehicles.length * 30 + 2}`} role="img" aria-label="Remaining distance by vehicle">
      {vehicles.map((vehicle, index) => {
        const y = index * 30 + 4
        return <g key={vehicle.id}>
          <text x="0" y={y + 13} className="chart-label">{vehicle.id.replace('VAN-', '#')}</text>
          <rect x="42" y={y} width="196" height="16" rx="8" className="chart-track" />
          <rect x="42" y={y} width={x(vehicle.remainingMeters)} height="16" rx="8" fill={vehicle.color} />
          <text x="242" y={y + 13} textAnchor="end" className="chart-value">{formatDistance(vehicle.remainingMeters)}</text>
        </g>
      })}
    </svg>
  )
}

export default function FleetPanel({ update, onRestart }: { update: FleetUpdate | null; onRestart: () => void }) {
  const vehicles = [...(update?.vehicles ?? [])].sort((a, b) => a.remainingSeconds - b.remainingSeconds)
  return <aside className="fleet-panel">
    <div className="panel-topline">
      <div>
        <p className="eyebrow">ARRIVING AT</p>
        <h2>{update?.destination.label ?? 'Connecting to fleet…'}</h2>
      </div>
      <button onClick={onRestart} disabled={!update}>Restart</button>
    </div>

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
