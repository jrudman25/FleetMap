import express from 'express'
import { WebSocketServer } from 'ws'
import { createFleetCommandProcessor } from './fleetCommandProcessor.js'
import { FleetSimulation } from './fleetSimulation.js'
import { startWebSocketHeartbeat, trackWebSocketHeartbeat } from './webSocketHeartbeat.js'

const PORT = 3001
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
const processCommand = createFleetCommandProcessor(simulation, broadcast)

wss.on('connection', (socket) => {
  trackWebSocketHeartbeat(socket)
  if (routesReady) socket.send(JSON.stringify(simulation.snapshot()))
  socket.on('message', (raw) => { processCommand(socket, raw) })
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
