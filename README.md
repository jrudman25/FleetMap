# FleetMap

A deliberately focused real-time fleet-tracking demo for Seattle. Trucks follow real road routes toward a shared destination; their progress and ETAs update once per second. The fleet starts with five trucks bound for Seattle City Hall and can be edited while the simulation is running.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:5173`. The combined command runs the Vite frontend and the WebSocket server on port 3001. The server needs outbound internet access once at startup to obtain the routes from OSRM.

For development, run `npm run dev` to launch the same services with Node watch mode enabled for the server.

## Test

Run `npm test` to execute the Vitest suite. It covers fleet additions, removals, destination rerouting, default reset behavior, client reconnection and backoff, connection cleanup, message forwarding, command sending, and server heartbeat handling for responsive and stale sockets.

### WebSocket URL

The frontend reads `VITE_WS_URL` at build or startup time to determine which WebSocket server to connect to. It defaults to `ws://localhost:3001` for local use, while the variable allows hosted builds or alternate environments to use a different host, port, or secure `wss://` endpoint without changing source code.

Set it in `.env.local` when an override is needed:

```dotenv
VITE_WS_URL=wss://your-websocket-host
```

Restart Vite after changing the value. Files named `.env.local` are intentionally excluded from Git.

## Architecture

```
OSRM road route + duration (startup and fleet edits)
              ↓
Node server: in-memory fleet → 1s tick → Turf along(route, distance) → WebSocket broadcast
                                                        ↓
React: MapLibre sources/markers + ETA panel + D3 scales/SVG bars
```

- `server/index.js` handles WebSocket commands and fetches actual driving routes from the public OSRM demo server. `server/fleetSimulation.js` keeps fleet state in memory, uses Turf `length` and `along` to road-snap every current position, and preserves the original setup for resets. Protocol-level heartbeats remove stale sockets, while the client reconnects with bounded exponential backoff.
- `src/components/MapView.tsx` renders the returned route GeoJSON and current locations with MapLibre GL JS.
- `src/components/FleetPanel.tsx` sorts the live WebSocket state by ETA, records each vehicle's elapsed arrival time, displays remaining distance in miles on a fixed route-length scale, and provides the shared simulation clock controls. D3 owns the distance chart scale while React renders its SVG, so there are no competing DOM owners.

## Real vs. simulated

The road geometry and baseline duration estimates are **real OSRM results**. There is no GPS feed: the vehicles progress on an intentionally accelerated simulated clock, which makes the demo readable in a short session. Use the **0.5x**, **1x**, **2x**, and **4x** controls to change the shared clock rate. Trucks can be added from longitude and latitude coordinates, removed individually, or rerouted together by editing the shared destination. Click **Reset** to restore the original five trucks, Seattle City Hall, 1x speed, and zero elapsed time. These controls affect everyone currently viewing the server and are not persisted across server restarts.

## Scope

This demo intentionally has no traffic data, durable data persistence, authentication, or mobile layout.
