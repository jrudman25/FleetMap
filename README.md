# FleetMap

A deliberately focused real-time fleet-tracking demo for Seattle. Five hardcoded vehicles follow real road routes toward Seattle City Hall; their progress and ETAs update once per second.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:5173`. The combined command runs the Vite frontend and the WebSocket server on port 3001. The server needs outbound internet access once at startup to obtain the routes from OSRM.

For development, run `npm run dev` to launch the same services with Node watch mode enabled for the server.

### WebSocket URL

The frontend reads `VITE_WS_URL` at build or startup time to determine which WebSocket server to connect to. It defaults to `ws://localhost:3001` for local use, while the variable allows hosted builds or alternate environments to use a different host, port, or secure `wss://` endpoint without changing source code.

Set it in `.env.local` when an override is needed:

```dotenv
VITE_WS_URL=wss://your-websocket-host
```

Restart Vite after changing the value. Files named `.env.local` are intentionally excluded from Git.

## Architecture

```
OSRM road route + duration (startup)
              ↓
Node server: 1s tick → Turf along(route, distance) → WebSocket broadcast
                                                        ↓
React: MapLibre sources/markers + ETA panel + D3 scales/SVG bars
```

- `server/index.js` fetches each actual driving route from the public OSRM demo server. It keeps data in memory, uses Turf `length` and `along` to road-snap every current position, and broadcasts the fleet through `ws`.
- `src/components/MapView.tsx` renders the returned route GeoJSON and current locations with MapLibre GL JS.
- `src/components/FleetPanel.tsx` sorts the live WebSocket state by ETA, records each vehicle's elapsed arrival time, displays remaining distance in miles on a fixed route-length scale, and provides the shared simulation clock controls. D3 owns the distance chart scale while React renders its SVG, so there are no competing DOM owners.

## Real vs. simulated

The road geometry and baseline duration estimates are **real OSRM results**. There is no GPS feed: the vehicles progress on an intentionally accelerated simulated clock, which makes the demo readable in a short session. Use the **0.5x**, **1x**, **2x**, and **4x** controls to change the shared clock rate, or click **Restart** to reset its elapsed time. These controls affect everyone currently viewing the server.

## Scope

This demo intentionally has no traffic data, dynamic rerouting, persistence, authentication, vehicle editor, or mobile layout.
