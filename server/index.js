import express from 'express'
import { WebSocketServer } from 'ws'
import { createFleetCommandProcessor } from './fleetCommandProcessor.js'
import { FleetSimulation } from './fleetSimulation.js'
import { startWebSocketHeartbeat, trackWebSocketHeartbeat } from './webSocketHeartbeat.js'

const PORT = 3001
const HEARTBEAT_INTERVAL_MS = 30_000
const GEOCODE_INTERVAL_MS = 1_000
const GEOCODE_CACHE_SIZE = 100
const geocodeCache = new Map()
let geocodeQueue = Promise.resolve()
let lastGeocodeRequestAt = 0

async function fetchDestination(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({
    q: `${query}, Seattle, Washington`,
    format: 'jsonv2',
    limit: '1',
    bounded: '1',
    viewbox: '-122.4597,47.7341,-122.2244,47.4919',
  })
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': 'FleetMap/1.0 (https://github.com/jrudman25/FleetMap)',
    },
  })
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`)
  const result = (await response.json())[0]
  if (!result) return null
  const coordinates = [Number(result.lon), Number(result.lat)]
  if (!coordinates.every(Number.isFinite)) throw new Error('Nominatim returned invalid coordinates')
  return { coordinates, displayName: typeof result.display_name === 'string' ? result.display_name : query }
}

function geocodeDestination(query) {
  const cacheKey = query.toLowerCase()
  if (geocodeCache.has(cacheKey)) return Promise.resolve(geocodeCache.get(cacheKey))
  const request = geocodeQueue.then(async () => {
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)
    const waitMilliseconds = Math.max(0, GEOCODE_INTERVAL_MS - (Date.now() - lastGeocodeRequestAt))
    if (waitMilliseconds) await new Promise((resolve) => setTimeout(resolve, waitMilliseconds))
    lastGeocodeRequestAt = Date.now()
    const result = await fetchDestination(query)
    if (geocodeCache.size >= GEOCODE_CACHE_SIZE) geocodeCache.delete(geocodeCache.keys().next().value)
    geocodeCache.set(cacheKey, result)
    return result
  })
  geocodeQueue = request.catch(() => {})
  return request
}

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
app.get('/api/geocode', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (query.length < 2 || query.length > 60) return res.status(400).json({ message: 'Enter a destination name between 2 and 60 characters.' })
  try {
    const result = await geocodeDestination(query)
    if (!result) return res.status(404).json({ message: 'No Seattle destination found. Try a more specific name.' })
    return res.json(result)
  } catch (error) {
    console.error('Could not geocode destination:', error.message)
    return res.status(502).json({ message: 'Destination lookup is temporarily unavailable.' })
  }
})
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
