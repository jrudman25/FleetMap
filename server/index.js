import express from 'express'
import { WebSocketServer } from 'ws'
import along from '@turf/along'
import length from '@turf/length'
import { lineString } from '@turf/helpers'

const PORT = 3001
const DESTINATION = [-122.3321, 47.6062] // Seattle City Hall
const VEHICLE_SEEDS = [
  { id: 'VAN-01', name: 'Pioneer', color: '#4f8cff', origin: [-122.4094, 47.6489], speedMultiplier: 2.25 },
  { id: 'VAN-02', name: 'Cedar', color: '#f59e0b', origin: [-122.3019, 47.6294], speedMultiplier: 1.8 },
  { id: 'VAN-03', name: 'Harbor', color: '#22c55e', origin: [-122.3721, 47.5707], speedMultiplier: 2.05 },
  { id: 'VAN-04', name: 'Rainier', color: '#e85d75', origin: [-122.2855, 47.5964], speedMultiplier: 1.55 },
  { id: 'VAN-05', name: 'Ballard', color: '#a78bfa', origin: [-122.3864, 47.6720], speedMultiplier: 1.95 },
]

let fleet = []
let simulationStartedAt = Date.now()

async function fetchRoute(origin) {
  const coordinates = `${origin.join(',')};${DESTINATION.join(',')}`
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`)
  if (!response.ok) throw new Error(`OSRM returned ${response.status}`)
  const payload = await response.json()
  const route = payload.routes?.[0]
  if (!route?.geometry?.coordinates?.length) throw new Error('OSRM returned no route geometry')
  return { geometry: route.geometry, durationSeconds: route.duration, distanceMeters: route.distance }
}

async function initialiseFleet() {
  console.log('Fetching Seattle road routes from OSRM…')
  const routes = await Promise.all(VEHICLE_SEEDS.map(async (seed) => ({ ...seed, ...(await fetchRoute(seed.origin)) })))
  fleet = routes.map((vehicle) => ({
    ...vehicle,
    line: lineString(vehicle.geometry.coordinates),
    routeKilometers: length(lineString(vehicle.geometry.coordinates), { units: 'kilometers' }),
  }))
  simulationStartedAt = Date.now()
  console.log(`Fleet ready: ${fleet.length} road routes loaded.`)
}

function snapshot() {
  const elapsedSeconds = (Date.now() - simulationStartedAt) / 1000
  return {
    type: 'fleet:update',
    destination: { coordinates: DESTINATION, label: 'Seattle City Hall' },
    vehicles: fleet.map((vehicle) => {
      // Time is deliberately accelerated for a useful demo; the OSRM duration remains the baseline estimate.
      const simulatedDuration = Math.max(50, vehicle.durationSeconds / vehicle.speedMultiplier)
      const remainingSeconds = Math.max(0, simulatedDuration - elapsedSeconds)
      const fraction = Math.min(1, elapsedSeconds / simulatedDuration)
      const point = along(vehicle.line, vehicle.routeKilometers * fraction, { units: 'kilometers' })
      return {
        id: vehicle.id,
        name: vehicle.name,
        color: vehicle.color,
        position: point.geometry.coordinates,
        route: vehicle.geometry,
        distanceMeters: vehicle.distanceMeters,
        remainingMeters: vehicle.distanceMeters * (1 - fraction),
        osrmDurationSeconds: vehicle.durationSeconds,
        remainingSeconds,
        arrived: fraction >= 1,
      }
    }),
  }
}

const app = express()
app.get('/health', (_req, res) => res.json({ ok: true, routesReady: fleet.length }))
const server = app.listen(PORT, () => console.log(`FleetMap server on http://localhost:${PORT}`))
const wss = new WebSocketServer({ server })

wss.on('connection', (socket) => {
  if (fleet.length) socket.send(JSON.stringify(snapshot()))
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      if (message.type === 'simulation:restart') {
        simulationStartedAt = Date.now()
        broadcast()
      }
    } catch { /* Ignore malformed client messages in this small demo. */ }
  })
})

function broadcast() {
  if (!fleet.length) return
  const message = JSON.stringify(snapshot())
  for (const client of wss.clients) if (client.readyState === client.OPEN) client.send(message)
}

setInterval(broadcast, 1000)
initialiseFleet().catch((error) => {
  console.error('Could not initialise routes from OSRM:', error.message)
  process.exitCode = 1
})
