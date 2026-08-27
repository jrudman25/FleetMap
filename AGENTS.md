# FleetMap Agent Guide

## Project summary

FleetMap is a focused real-time fleet simulation for Seattle. A Node.js server obtains road routes from the public OSRM service, advances an in-memory simulation, and broadcasts snapshots over WebSocket. A React client renders vehicles and routes with MapLibre and presents controls and ETA data.

The application is a demo, not a persistent multi-tenant service. Fleet changes affect every connected client and disappear when the server restarts.

## Stack

- Node.js 18 or newer, npm, ES modules
- React 19 and TypeScript with strict mode
- Vite 6 on port 5173
- Express 4 and `ws` on port 3001
- Turf for route length and position interpolation
- MapLibre GL for the map
- D3 scale utilities for the distance chart
- Vitest for server and client unit tests

Use existing dependencies where possible. Do not edit generated files in `dist/`, `node_modules/`, or TypeScript build-info files.

## Common commands

```bash
npm ci             # Install exactly from package-lock.json
npm run dev        # Start watched server and Vite client
npm start          # Start server and client without watch mode
npm test           # Run the complete Vitest suite once
npm run build      # Type-check and create the production Vite build
```

There is currently no lint script. For normal verification, run both `npm test` and `npm run build`. The build currently reports a known large-chunk warning from the mapping bundle; do not hide the warning by changing the threshold.

## Runtime requirements

- The server requires outbound internet access during startup and fleet edits because it calls `https://router.project-osrm.org`.
- Initial route fetching must finish before normal snapshots are broadcast.
- `GET /health` reports whether the process is alive and how many routes are ready.
- The client WebSocket URL is `VITE_WS_URL`, defaulting to `ws://localhost:3001`. Use `.env.local` for local overrides and never commit environment files.
- The OpenStreetMap raster tiles and public OSRM endpoint are external services. Avoid tests that depend on either service being available.

## Architecture and ownership

### Server

- `server/index.js`: process entry point, Express and WebSocket setup, OSRM adapter, one-second broadcasts, and startup lifecycle. Importing this file starts the real server, so do not import it from unit tests.
- `server/fleetCommandProcessor.js`: parses, validates, and globally serializes incoming commands. Successful commands broadcast once. Failures are sent only to the requesting open socket.
- `server/fleetSimulation.js`: authoritative in-memory fleet state, input validation, clock calculations, route replacement, snapshots, reset behavior, and the 25-truck limit.
- `server/webSocketHeartbeat.js`: ping/pong liveness tracking and stale-connection termination.

Keep external I/O in `server/index.js` and deterministic fleet behavior in `FleetSimulation`. Fleet mutations that await OSRM must remain atomic: failed route requests must not partially change the fleet, destination, or truck numbering.

### Client

- `src/main.tsx`: React entry point and global CSS imports.
- `src/App.tsx`: owns WebSocket state and translates UI callbacks into protocol commands.
- `src/connectFleetSocket.ts`: connection lifecycle, bounded reconnect backoff, outbound serialization, and update/error dispatch.
- `src/components/FleetPanel.tsx`: controls, editors, fleet rows, ETA formatting, and the D3-backed SVG distance chart.
- `src/components/MapView.tsx`: MapLibre lifecycle, route sources/layers, destination marker, and vehicle markers.
- `src/types.ts`: shared client-side snapshot and form-input types.
- `src/styles.css`: application styling; there is no component CSS framework.

MapLibre owns its map DOM. React should only own the container and surrounding interface. On fleet changes, remove obsolete markers, layers, and sources, and clean up the map on component unmount.

## WebSocket protocol

Client commands:

- `{ "type": "simulation:reset" }`
- `{ "type": "simulation:restart" }`, retained as a reset alias
- `{ "type": "simulation:set-speed", "playbackRate": 0.5 | 1 | 2 | 4 }`
- `{ "type": "fleet:add", "name": string, "origin": [longitude, latitude] }`
- `{ "type": "fleet:remove", "id": string }`
- `{ "type": "fleet:set-destination", "label": string, "coordinates": [longitude, latitude] }`

Server messages:

- `fleet:update`: full authoritative snapshot, including destination, elapsed time, playback rate, and all vehicles
- `fleet:error`: requester-specific command failure with a user-facing `message`

Coordinates always use GeoJSON order: `[longitude, latitude]`. Validate protocol input on the server even when the browser already constrains its form fields. Unknown commands, unsupported speeds, and malformed JSON are intentionally ignored.

## Simulation invariants

- The default fleet contains five trucks and targets Seattle City Hall.
- Reset restores the original five routes, destination, 1x playback rate, elapsed time zero, and truck numbering beginning again at `VAN-06`.
- Adding or removing a truck must not rewind existing trucks.
- A newly added truck starts at the current simulation time and routes to the current destination.
- Changing destination reroutes every truck from its current interpolated position without teleporting it.
- Playback-rate changes preserve elapsed simulation time.
- Route duration is accelerated per vehicle but has a minimum simulated duration of 50 seconds.
- Fleet snapshots are the server authority; do not make the client independently simulate movement.

## Testing conventions

Tests are co-located with their modules and use Vitest:

- `server/fleetSimulation.test.js`: simulation behavior, validation, limits, reset, and route-failure atomicity
- `server/fleetCommandProcessor.test.js`: protocol dispatch, serialization, malformed input, broadcasts, and requester errors
- `server/webSocketHeartbeat.test.js`: responsive and stale socket handling
- `src/connectFleetSocket.test.ts`: reconnect behavior, cleanup, sending, and message forwarding

Use injected clocks and route functions for deterministic simulation tests. Route fixtures should return GeoJSON `LineString` geometry plus `durationSeconds` and `distanceMeters`. Use fake sockets for protocol boundaries instead of opening ports. Test observable state and messages rather than private implementation details.

When changing behavior:

1. Add or update a focused test that demonstrates the intended behavior.
2. Make the smallest production change that satisfies it.
3. Run the focused test during iteration.
4. Run `npm test` and `npm run build` before finishing.

Frontend component tests do not currently have a DOM testing environment or React Testing Library. Ask before adding a new testing dependency.

## Code conventions

- Match the existing compact style: two-space indentation, single quotes, no semicolons, and trailing commas in multiline literals.
- Keep TypeScript strict and avoid `any`; define protocol and snapshot shapes in `src/types.ts`.
- Keep modules focused and prefer explicit data flow over hidden shared behavior.
- Preserve the command queue so asynchronous fleet edits cannot race or reorder.
- Do not swallow new errors merely to keep the UI quiet. Expected command failures should become `fleet:error`; startup failures should remain visible.
- Do not add persistence, authentication, traffic data, or infrastructure without an explicit request. These are intentionally outside the current scope.
- Review `TODO.md` for planned product work, but do not implement unrelated items opportunistically.

## Documentation expectations

Update `README.md` when commands, environment configuration, architecture, protocol behavior, or user-visible capabilities change. Update `TODO.md` only when a listed product task changes status or the user asks to revise the roadmap.
