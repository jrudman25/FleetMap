import { useEffect, useRef } from 'react'
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl'
import type { FleetUpdate } from '../types'

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

export default function MapView({ update }: { update: FleetUpdate | null }) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const markers = useRef(new globalThis.Map<string, Marker>())
  const destinationMarker = useRef<Marker | null>(null)

  useEffect(() => {
    if (!container.current) return
    const instance = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: [-122.335, 47.615],
      zoom: 11.2,
      attributionControl: false,
    })
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left')
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    instance.on('load', () => { map.current = instance })
    return () => { map.current = null; instance.remove() }
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!instance || !update) return
    if (!destinationMarker.current) {
      const element = document.createElement('div')
      element.className = 'destination-marker'
      element.title = update.destination.label
      destinationMarker.current = new maplibregl.Marker({ element, anchor: 'bottom' })
        .setLngLat(update.destination.coordinates)
        .addTo(instance)
    }
    update.vehicles.forEach((vehicle) => {
      const sourceId = `route-${vehicle.id}`
      const source = instance.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
      const routeFeature = { type: 'Feature' as const, properties: {}, geometry: vehicle.route }
      if (source) source.setData(routeFeature)
      else {
        instance.addSource(sourceId, { type: 'geojson', data: routeFeature })
        instance.addLayer({ id: sourceId, type: 'line', source: sourceId, paint: { 'line-color': vehicle.color, 'line-width': 4, 'line-opacity': 0.72 } })
      }

      let marker = markers.current.get(vehicle.id)
      if (!marker) {
        const element = document.createElement('div')
        element.className = 'vehicle-marker'
        element.style.setProperty('--vehicle-color', vehicle.color)
        element.title = `${vehicle.id} · ${vehicle.name}`
        marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(vehicle.position).addTo(instance)
        markers.current.set(vehicle.id, marker)
      } else marker.setLngLat(vehicle.position)
    })
  }, [update])

  return <div ref={container} className="map" />
}
