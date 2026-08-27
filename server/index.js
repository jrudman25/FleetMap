import express from 'express'
import { WebSocketServer } from 'ws'
import along from '@turf/along'
import length from '@turf/length'
import { lineString } from '@turf/helpers'

const PORT = 3001
const DESTINATION = [-122.3321, 47.6062] // Seattle City Hall
const VEHICLE_SEEDS = [
  { id: 'VAN-01', name: 'Magnolia', color: '#4f8cff', origin: [-122.4094, 47.6489], speedMultiplier: 2.25 },
  { id: 'VAN-02', name: 'Capitol', color: '#f59e0b', origin: [-122.3019, 47.6294], speedMultiplier: 1.8 },
  { id: 'VAN-03', name: 'Harbor', color: '#22c55e', origin: [-122.3721, 47.5707], speedMultiplier: 2.05 },
  { id: 'VAN-04', name: 'Leschi', color: '#e85d75', origin: [-122.2855, 47.5964], speedMultiplier: 1.55 },
  { id: 'VAN-05', name: 'Ballard', color: '#a78bfa', origin: [-122.3864, 47.6720], speedMultiplier: 1.95 },
]

const PLAYBACK_RATES = new Set([0.5, 1, 2, 4])
const HEARTBEAT_INTERVAL_MS = 30_000

let fleet = []
let elapsedSimulationSeconds = 0
let simulationClockUpdatedAt = Date.now()
let playbackRate = 1

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
  restartSimulation()
  console.log(`Fleet ready: ${fleet.length} road routes loaded.`)
}

function getElapsedSeconds(now = Date.now()) {
  return elapsedSimulationSeconds + ((now - simulationClockUpdatedAt) / 1000) * playbackRate
}

function restartSimulation() {
  elapsedSimulationSeconds = 0
  simulationClockUpdatedAt = Date.now()
}

function setPlaybackRate(nextRate) {
  const now = Date.now()
  elapsedSimulationSeconds = getElapsedSeconds(now)
  simulationClockUpdatedAt = now
  playbackRate = nextRate
}

function snapshot() {
  const elapsedSeconds = getElapsedSeconds()
  return {
    type: 'fleet:update',
    destination: { coordinates: DESTINATION, label: 'Seattle City Hall' },
    elapsedSeconds,
    playbackRate,
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
        arrivedAtElapsedSeconds: fraction >= 1 ? simulatedDuration : null,
      }
    }),
  }
}

const app = express()
app.get('/health', (_req, res) => res.json({ ok: true, routesReady: fleet.length }))
const server = app.listen(PORT, () => console.log(`FleetMap server on http://localhost:${PORT}`))
const wss = new WebSocketServer({ server })

wss.on('connection', (socket) => {
  socket.isAlive = true
  socket.on('pong', () => { socket.isAlive = true })
  if (fleet.length) socket.send(JSON.stringify(snapshot()))
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      if (message.type === 'simulation:restart') {
        restartSimulation()
        broadcast()
      }
      if (message.type === 'simulation:set-speed' && PLAYBACK_RATES.has(message.playbackRate)) {
        setPlaybackRate(message.playbackRate)
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
const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (!client.isAlive) {
      client.terminate()
      continue
    }
    client.isAlive = false
    client.ping()
  }
}, HEARTBEAT_INTERVAL_MS)
wss.on('close', () => clearInterval(heartbeat))

initialiseFleet().catch((error) => {
  console.error('Could not initialise routes from OSRM:', error.message)
  process.exitCode = 1
})
