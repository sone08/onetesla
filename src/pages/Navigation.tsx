import { useEffect, useRef, useState } from 'react'

interface Place {
  display_name: string
  lat: string
  lon: string
}

export interface NavDest { lat: number; lon: number; name: string }

const QUICK_DESTINATIONS = [
  { label: '⚡ Supercharger', query: 'Tesla Supercharger' },
  { label: '🍔 Food', query: 'restaurant' },
  { label: '🛒 Grocery', query: 'supermarket' },
  { label: '☕ Coffee', query: 'cafe' },
  { label: '⛽ Gas', query: 'gas station' },
  { label: '🅿️ Parking', query: 'parking' },
  { label: '🏥 Hospital', query: 'hospital' },
  { label: '🛍️ Mall', query: 'shopping mall' },
]

function isTeslaBrowser() {
  return /Tesla/i.test(navigator.userAgent) || /QtCarBrowser/i.test(navigator.userAgent)
}

export default function Navigation({ onOpenMap }: { onOpenMap?: (dest: NavDest) => void }) {
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [carLocation, setCarLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [sent, setSent] = useState<Place | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTesla = isTeslaBrowser()

  useEffect(() => {
    fetch('/api/tesla/vehicles')
      .then(r => r.json())
      .then(d => {
        const id = d.response?.[0]?.id ?? null
        setVehicleId(id)
        if (id) {
          fetch(`/api/tesla/vehicles/${id}/location`)
            .then(r => r.json())
            .then(loc => {
              if (loc.lat) {
                setCarLocation(loc)
              } else if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  pos => setCarLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                  () => {}
                )
              }
            })
            .catch(() => {
              if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                  pos => setCarLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                  () => {}
                )
              }
            })
        }
      })
  }, [])

  useEffect(() => {
    if (!query.trim() || query.length < 3) { setResults([]); return }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => searchPlaces(query), 600)
  }, [query])

  async function searchPlaces(q: string) {
    setSearching(true)
    try {
      const locParam = carLocation ? `&lat=${carLocation.lat}&lon=${carLocation.lon}` : ''
      // For brand/chain searches, Nominatim works better with nearby city appended
      // But we pass location so the backend forces bounded results first
      const r = await fetch(`/api/tesla/geocode?q=${encodeURIComponent(q)}${locParam}`)
      const d: Place[] = await r.json()
      const filtered = d.filter(p => p.display_name).slice(0, 6)
      setResults(filtered)
    } catch { setResults([]) }
    setSearching(false)
  }

  async function sendToTesla(place: Place) {
    if (!vehicleId) return
    setResults([])
    setQuery(place.display_name)
    try {
      const r = await fetch(`/api/tesla/vehicles/${vehicleId}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: place.lat, lon: place.lon })
      })
      const d = await r.json()
      if (d.response?.result) {
        setSent(place)
        setMsg({ text: '✅ Sent to Tesla nav!', ok: true })
      } else {
        setMsg({ text: '❌ Failed — is the car awake?', ok: false })
      }
    } catch {
      setMsg({ text: '❌ Error sending destination', ok: false })
    }
    setTimeout(() => setMsg(null), 4000)
  }

  function openInGoogleMaps(place: Place) {
    const url = `https://www.google.com/maps/dir/Current+Location/${place.lat},${place.lon}/`
    window.open(url, '_blank')
  }

  function openWazeLiveMap(place: Place) {
    const url = `https://www.waze.com/live-map/directions?to=ll.${place.lat}%2C${place.lon}&utm_source=waze_website&utm_campaign=waze_website`
    window.open(url, '_blank')
  }

  function openLiveMap(place: Place) {
    if (onOpenMap) {
      onOpenMap({ lat: parseFloat(place.lat), lon: parseFloat(place.lon), name: place.display_name })
    }
  }

  return (
    <div className="nav-page">
      <h2>Navigation</h2>

      {isTesla && (
        <p className="nav-hint">
          ⚡ <b>Tesla Nav</b> = sends to built-in screen &nbsp;|&nbsp;
          🗺️ <b>Live Map</b> = in-app map with 🚔 police pins + route &nbsp;|&nbsp;
          � <b>Google</b> = opens Google Maps
        </p>
      )}
      {!isTesla && (
        <p className="nav-hint">
          ⚡ = send to Tesla screen &nbsp;·&nbsp; 🗺️ = Live Map with police alerts &nbsp;·&nbsp; 📍 = Google Maps
        </p>
      )}

      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          type="text"
          placeholder="Search destination..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query && (
          <button className="clear-btn" onClick={() => { setQuery(''); setResults([]); setSent(null) }}>✕</button>
        )}
      </div>

      {!query && (
        <div className="quick-section">
          <p className="section-label">Quick Search</p>
          <div className="quick-grid">
            {QUICK_DESTINATIONS.map(d => (
              <button key={d.label} className="quick-btn" onClick={() => { setQuery(d.query); searchPlaces(d.query) }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {searching && <div className="searching">Searching...</div>}

      {results.length > 0 && (
        <div className="results-list">
          {results.map((place, i) => (
            <div key={i} className="result-item">
              <div className="result-name">{place.display_name}</div>
              <div className="result-actions">
                <button className="nav-action-btn tesla" onClick={() => sendToTesla(place)}>
                  ⚡ Tesla Nav
                </button>
                <button className="nav-action-btn livemap" onClick={() => openLiveMap(place)}>
                  🗺️ Live Map
                </button>
                <button className="nav-action-btn gmaps" onClick={() => openInGoogleMaps(place)}>
                  📍 Google
                </button>
                <button className="nav-action-btn waze" onClick={() => openWazeLiveMap(place)}>
                  🚔 Waze
                </button>
                {!isTesla && (
                  <button className="nav-action-btn apple" onClick={() => window.open(`maps://maps.apple.com/?daddr=${place.lat},${place.lon}&dirflg=d`, '_blank')}>
                    🍎 Apple
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div className={`result-toast ${msg.ok ? 'toast-ok' : 'toast-err'}`}>{msg.text}</div>
      )}

      {sent && !msg && (
        <div className="card sent-card">
          <p className="sent-label">📍 Sent to Tesla Nav</p>
          <p className="sent-dest">{sent.display_name}</p>
          <div className="sent-actions">
            <button className="nav-action-btn livemap" onClick={() => openLiveMap(sent)}>��️ Live Map</button>
            <button className="nav-action-btn waze" onClick={() => openWazeLiveMap(sent)}>🚔 Waze</button>
            {!isTesla && (
              <button className="nav-action-btn apple" onClick={() => window.open(`maps://maps.apple.com/?daddr=${sent.lat},${sent.lon}&dirflg=d`, '_blank')}>🍎 Apple Maps</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
