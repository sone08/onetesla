/**
 * MapView — embedded navigation with real-time police/hazard overlays
 * Uses Leaflet + OSM tiles (free) + OSRM routing (free) + incidents via backend proxy
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import markerIconUrl from 'leaflet/dist/images/marker-icon.png'
import markerIcon2xUrl from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
})

export interface MapDest { lat: number; lon: number; name: string }

interface Incident {
  type: string
  lat: number
  lon: number
  street?: string
  reportRating?: number
}

const ICONS: Record<string, string> = {
  POLICE: '🚔', ACCIDENT: '💥', HAZARD: '⚠️', JAM: '🚦', ROAD_CLOSED: '🚧',
}
const COLORS: Record<string, string> = {
  POLICE: '#e31937', ACCIDENT: '#ff6b00', HAZARD: '#f0a500', JAM: '#888',
}

function makeIncidentIcon(type: string) {
  const emoji = ICONS[type] ?? '⚠️'
  const color = COLORS[type] ?? '#4a90d9'
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:19px;box-shadow:0 2px 8px rgba(0,0,0,.5);border:2px solid #fff">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

interface Props { initialDest?: MapDest }

export default function MapView({ initialDest }: Props) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.Polyline | null>(null)
  const incMarkersRef = useRef<L.Marker[]>([])
  const carMarkerRef = useRef<L.Marker | null>(null)
  const initialDestRef = useRef(initialDest)

  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [carPos, setCarPos] = useState<{ lat: number; lon: number } | null>(null)
  const [status, setStatus] = useState('Loading map...')
  const [policeCount, setPoliceCount] = useState(0)
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null)
  const [activeDest, setActiveDest] = useState<MapDest | null>(null)
  const [routing, setRouting] = useState(false)
  const [sentOk, setSentOk] = useState(false)

  const loadIncidents = useCallback(async (map: L.Map, center: { lat: number; lon: number }) => {
    try {
      // Fetch Waze incidents directly from the browser — Waze allows browser-side CORS requests
      const delta = 25 / 111
      const { lat, lon } = center
      const url = `https://www.waze.com/live-map/api/georss?top=${lat + delta}&bottom=${lat - delta}&left=${lon - delta}&right=${lon + delta}&env=row&types=alerts,traffic`
      const res = await fetch(url, {
        headers: { 'Referer': 'https://www.waze.com/live-map' }
      })
      const json = await res.json()
      const alerts: Incident[] = (json.alerts ?? []).map((a: Record<string, unknown>) => ({
        type: (a.type as string) ?? 'HAZARD',
        lat: (a.location as Record<string, number>)?.y ?? a.lat,
        lon: (a.location as Record<string, number>)?.x ?? a.lon,
        street: a.street as string,
        reportRating: a.reportRating as number,
      }))
      const jams: Incident[] = (json.jams ?? []).map((j: Record<string, unknown>) => ({
        type: 'JAM',
        lat: (j.line as {y:number}[])?.[0]?.y,
        lon: (j.line as {x:number}[])?.[0]?.x,
        street: j.street as string,
      }))
      const data = [...alerts, ...jams].filter(i => i.lat && i.lon)
      incMarkersRef.current.forEach(m => m.remove())
      incMarkersRef.current = []
      data.forEach(inc => {
        const m = L.marker([inc.lat, inc.lon], { icon: makeIncidentIcon(inc.type) })
          .addTo(map)
          .bindPopup(`<b>${ICONS[inc.type] ?? '⚠️'} ${inc.type.replace('_', ' ')}</b>${inc.street ? `<br/>📍 ${inc.street}` : ''}${inc.reportRating ? `<br/>👍 ${inc.reportRating} reports` : ''}`)
        incMarkersRef.current.push(m)
      })
      const police = data.filter(i => i.type === 'POLICE').length
      const hazards = data.filter(i => i.type === 'HAZARD' || i.type === 'ACCIDENT').length
      setPoliceCount(police)
      setStatus(police > 0
        ? `🚔 ${police} police · ⚠️ ${hazards} hazards nearby`
        : hazards > 0 ? `⚠️ ${hazards} hazards nearby` : '✅ No alerts nearby')
    } catch {
      setStatus('Map ready — tap 🚔 to refresh alerts')
    }
  }, [])

  const routeTo = useCallback(async (dest: MapDest, origin: { lat: number; lon: number }, map: L.Map) => {
    setRouting(true)
    setActiveDest(dest)
    setRouteInfo(null)
    setSentOk(false)
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`
      const res = await fetch(url)
      const data = await res.json()
      if (data.code !== 'Ok') throw new Error('No route')
      const route = data.routes[0]
      const coords: [number, number][] = route.geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
      )
      if (routeLayerRef.current) routeLayerRef.current.remove()
      routeLayerRef.current = L.polyline(coords, { color: '#4a90d9', weight: 6, opacity: 0.85 }).addTo(map)
      map.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] })
      const km = (route.distance / 1000).toFixed(1)
      const min = Math.round(route.duration / 60)
      setRouteInfo({ distance: `${km} km`, duration: `${min} min` })
      const b = routeLayerRef.current.getBounds()
      loadIncidents(map, { lat: (b.getNorth() + b.getSouth()) / 2, lon: (b.getEast() + b.getWest()) / 2 })
    } catch { /* silent */ }
    setRouting(false)
  }, [loadIncidents])

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return
    const map = L.map(mapDivRef.current, { zoomControl: false, attributionControl: false })
      .setView([37.7749, -122.4194], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
    L.control.zoom({ position: 'topright' }).addTo(map)
    mapRef.current = map

    const init = async () => {
      setStatus('Locating vehicle...')
      try {
        const vd = await fetch('/api/tesla/vehicles').then(r => r.json())
        const id = vd.response?.[0]?.id ?? null
        setVehicleId(id)
        let pos: { lat: number; lon: number } | null = null
        if (id) {
          const loc = await fetch(`/api/tesla/vehicles/${id}/location`).then(r => r.json())
          if (loc.lat) pos = { lat: loc.lat, lon: loc.lon }
        }
        if (!pos) {
          pos = await new Promise(resolve => {
            if (!navigator.geolocation) return resolve(null as unknown as { lat: number; lon: number })
            navigator.geolocation.getCurrentPosition(
              p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
              () => resolve(null as unknown as { lat: number; lon: number })
            )
          })
        }
        if (pos) {
          setCarPos(pos)
          map.setView([pos.lat, pos.lon], 14)
          carMarkerRef.current = L.marker([pos.lat, pos.lon], {
            icon: L.divIcon({
              className: '',
              html: `<div style="background:#e31937;border-radius:50%;width:20px;height:20px;border:3px solid #fff;box-shadow:0 0 0 3px rgba(227,25,55,.4)"></div>`,
              iconSize: [20, 20], iconAnchor: [10, 10],
            })
          }).addTo(map).bindPopup('🚗 Your Tesla')
          loadIncidents(map, pos)
          if (initialDestRef.current) routeTo(initialDestRef.current, pos, map)
        } else {
          setStatus('⚠️ Could not get location')
        }
      } catch {
        setStatus('⚠️ Could not connect to backend')
      }
    }
    init()
  }, [loadIncidents, routeTo])

  function clearRoute() {
    if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null }
    setActiveDest(null)
    setRouteInfo(null)
    setSentOk(false)
    if (carPos && mapRef.current) mapRef.current.setView([carPos.lat, carPos.lon], 14)
  }

  async function sendToTesla() {
    if (!activeDest || !vehicleId) return
    await fetch(`/api/tesla/vehicles/${vehicleId}/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: activeDest.lat, lon: activeDest.lon }),
    })
    setSentOk(true)
    setTimeout(() => setSentOk(false), 3000)
  }

  return (
    <div className="mapview-page">
      <div className={`map-status-bar${policeCount > 0 ? ' has-police' : ''}`}>
        <span className="map-status-text">{status}</span>
        {policeCount > 0 && <span className="police-badge">🚔 {policeCount}</span>}
        <button className="map-refresh-btn" onClick={() => carPos && mapRef.current && loadIncidents(mapRef.current, carPos)}>↻</button>
      </div>

      {routeInfo && activeDest && (
        <div className="route-bar">
          <div className="route-bar-info">
            <span className="route-dest">📍 {activeDest.name.length > 35 ? activeDest.name.slice(0, 35) + '…' : activeDest.name}</span>
            <span className="route-meta">{routeInfo.distance} · {routeInfo.duration}</span>
          </div>
          <div className="route-bar-actions">
            {vehicleId && (
              <button className={`route-send-btn${sentOk ? ' sent' : ''}`} onClick={sendToTesla}>
                {sentOk ? '✅ Sent!' : '⚡ Tesla Nav'}
              </button>
            )}
            <button className="route-clear-btn" onClick={clearRoute}>✕</button>
          </div>
        </div>
      )}

      <div className="map-container" ref={mapDivRef} />

      <div className="map-fabs">
        <button className="map-fab" onClick={() => carPos && mapRef.current?.setView([carPos.lat, carPos.lon], 14)}>🎯</button>
        <button className="map-fab" onClick={() => carPos && mapRef.current && loadIncidents(mapRef.current, carPos)}>🚔</button>
      </div>

      {routing && <div className="map-routing-overlay">Calculating route…</div>}
    </div>
  )
}
