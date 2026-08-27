import express from 'express'
import { WebSocketServer } from 'ws'
import { FleetSimulation } from './fleetSimulation.js'
import { startWebSocketHeartbeat, trackWebSocketHeartbeat } from './webSocketHeartbeat.js'

const PORT = 3001
const PLAYBACK_RATES = new Set([0.5, 1, 2, 4])
const HEARTBEAT_INTERVAL_MS = 30_000

async function fetchRoute(origin, destination) {
  const coordinates = `${origin.join(',')};${destination.join(',')}`
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`)
  if (!response.ok) throw new Error(`OSRM returned ${response.status}`)
  const payload = await response.json()
  const route = payload.routes?.[0]
  if (!route?.geometry?.coordinates?.length) throw new Error('OSRM returned no route geometry')
  return { geometry: route.geometry, durationSeconds: route.duration, distanceMeters: route.distance }
}

const simulation = new FleetSimulation(fetchRoute)

const app = express()
app.get('/health', (_req, res) => res.json({ ok: true, routesReady: simulation.fleet.length }))
const server = app.listen(PORT, () => console.log(`FleetMap server on http://localhost:${PORT}`))
const wss = new WebSocketServer({ server })

let routesReady = false
let commandQueue = Promise.resolve()

function sendError(socket, error) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'fleet:error', message: error.message ?? 'Could not update the fleet.' }))
}

async function handleCommand(message) {
  if (!message || typeof message !== 'object') return
  if (message.type === 'simulation:reset' || message.type === 'simulation:restart') simulation.reset()
  else if (message.type === 'simulation:set-speed' && PLAYBACK_RATES.has(message.playbackRate)) simulation.setPlaybackRate(message.playbackRate)
  else if (message.type === 'fleet:add') await simulation.addVehicle(message)
  else if (message.type === 'fleet:remove') simulation.removeVehicle(message.id)
  else if (message.type === 'fleet:set-destination') await simulation.setDestination(message)
  else return
  broadcast()
}

wss.on('connection', (socket) => {
  trackWebSocketHeartbeat(socket)
  if (routesReady) socket.send(JSON.stringify(simulation.snapshot()))
  socket.on('message', (raw) => {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch { /* Ignore malformed client messages in this small demo. */
      return
    }
    commandQueue = commandQueue
      .then(() => handleCommand(message))
      .catch((error) => sendError(socket, error))
  })
})

function broadcast() {
  if (!routesReady) return
  const message = JSON.stringify(simulation.snapshot())
  for (const client of wss.clients) if (client.readyState === client.OPEN) client.send(message)
}

setInterval(broadcast, 1000)
startWebSocketHeartbeat(wss, HEARTBEAT_INTERVAL_MS)

console.log('Fetching Seattle road routes from OSRM…')
simulation.initialise().then(() => {
  routesReady = true
  broadcast()
  console.log(`Fleet ready: ${simulation.fleet.length} road routes loaded.`)
}).catch((error) => {
  console.error('Could not initialise routes from OSRM:', error.message)
  process.exitCode = 1
})
