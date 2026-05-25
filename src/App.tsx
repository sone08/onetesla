import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
import Controls from './pages/Controls'
import Charging from './pages/Charging'
import Navigation from './pages/Navigation'
import MapView from './pages/MapView'
import type { MapDest } from './pages/MapView'
import './App.css'

export type Page = 'dashboard' | 'controls' | 'charging' | 'navigation' | 'map'

function isTeslaBrowser() {
  return /Tesla/i.test(navigator.userAgent) || /QtCarBrowser/i.test(navigator.userAgent)
}

async function subscribeToPush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) { alert('✅ Already subscribed to police alerts!'); return }

    const keyRes = await fetch('/api/tesla/push-key')
    const { publicKey } = await keyRes.json()
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey
    })
    await fetch('/api/tesla/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    })
    alert('🚔 Police alert notifications enabled!')
  } catch (e) {
    alert('Could not enable notifications: ' + String(e))
  }
}

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [mapDest, setMapDest] = useState<MapDest | undefined>(undefined)
  const isTesla = isTeslaBrowser()

  useEffect(() => {
    fetch('/api/tesla/status')
      .then(r => r.json())
      .then(d => {
        setAuthed(d.authenticated)
        if (isTesla && !sessionStorage.getItem('banner-dismissed')) {
          setShowBanner(true)
        }
      })
      .catch(() => setAuthed(false))
  }, [])

  function openMap(dest: MapDest) {
    setMapDest(dest)
    setPage('map')
  }

  if (authed === null) return <div className="splash">Connecting…</div>

  if (!authed) return (
    <div className="login-screen">
      <div className="tesla-logo">⚡</div>
      <h1>OneTesla</h1>
      <p>Connect your Tesla account to get started</p>
      <a href="/api/tesla/auth" className="auth-btn">Sign in with Tesla</a>
      {isTesla && (
        <p className="tesla-hint">💡 Tip: Bookmark this page for quick access</p>
      )}
    </div>
  )

  return (
    <div className={`app${isTesla ? ' tesla-browser' : ''}`}>
      {showBanner && (
        <div className="tesla-banner">
          ⭐ Bookmark this page for quick access from your Tesla browser
          <button onClick={() => { setShowBanner(false); sessionStorage.setItem('banner-dismissed', '1') }}>✕</button>
        </div>
      )}
      <main className="content">
        {page === 'dashboard' && <Dashboard />}
        {page === 'controls' && <Controls />}
        {page === 'charging' && <Charging />}
        {page === 'navigation' && <Navigation onOpenMap={openMap} />}
        {page === 'map' && <MapView initialDest={mapDest} />}
      </main>
      <nav className="bottom-nav">
        <button onClick={() => setPage('dashboard')} className={page === 'dashboard' ? 'active' : ''}>
          <span>🏠</span><label>Home</label>
        </button>
        <button onClick={() => setPage('controls')} className={page === 'controls' ? 'active' : ''}>
          <span>🎛️</span><label>Controls</label>
        </button>
        <button onClick={() => setPage('charging')} className={page === 'charging' ? 'active' : ''}>
          <span>⚡</span><label>Charging</label>
        </button>
        <button onClick={() => setPage('navigation')} className={page === 'navigation' ? 'active' : ''}>
          <span>🔍</span><label>Search</label>
        </button>
        <button onClick={() => setPage('map')} className={page === 'map' ? 'active' : ''}>
          <span>🗺️</span><label>Map</label>
        </button>
        {'serviceWorker' in navigator && 'PushManager' in window && (
          <button onClick={subscribeToPush} className="bell-btn">
            <span>🔔</span><label>Alerts</label>
          </button>
        )}
      </nav>
    </div>
  )
}

export default App
