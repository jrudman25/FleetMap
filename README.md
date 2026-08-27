# FleetMap

A deliberately focused real-time fleet-tracking demo for Seattle. Five hardcoded vehicles follow real road routes toward Seattle City Hall; their progress and ETAs update once per second.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The combined command runs the Vite frontend and the WebSocket server on port 3001. The server needs outbound internet access once at startup to obtain the routes from OSRM.

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
- `src/components/FleetPanel.tsx` sorts the live WebSocket state by ETA. D3 owns the distance chart scale while React renders its SVG, so there are no competing DOM owners.

## Real vs. simulated

The road geometry and baseline duration estimates are **real OSRM results**. There is no GPS feed: the vehicles progress on an intentionally accelerated simulated clock, which makes the demo readable in a short session. Click **Restart** to reset that clock for everyone currently viewing the server.

## Scope

This demo intentionally has no traffic data, dynamic rerouting, persistence, authentication, vehicle editor, or mobile layout.
