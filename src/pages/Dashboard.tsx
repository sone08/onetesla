import { useEffect, useState } from 'react'

interface VehicleState {
  battery_level: number
  battery_range: number
  charging_state: string
  charge_limit_soc: number
  charge_port_door_open: boolean
  locked: boolean
  inside_temp: number
  outside_temp: number
  vehicle_name: string
  odometer: number
  is_climate_on: boolean
  sentry_mode: boolean
  car_version: string
  is_user_present: boolean
  media_title: string
  media_artist: string
  media_source: string
  tpms_fl: number
  tpms_fr: number
  tpms_rl: number
  tpms_rr: number
}

export default function Dashboard() {
  const [vehicles, setVehicles] = useState<any[]>([])
  const [state, setState] = useState<VehicleState | null>(null)
  const [loading, setLoading] = useState(true)
  const [waking, setWaking] = useState(false)
  const [wakeStatus, setWakeStatus] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    fetch('/api/tesla/vehicles')
      .then(r => r.json())
      .then(d => {
        setVehicles(d.response || [])
        if (d.response?.[0]) loadState(d.response[0].id, d.response[0].display_name)
      })
      .catch(() => setLoading(false))
  }, [])

  async function loadState(id: number, displayName?: string) {
    setLoading(true)
    try {
      const r = await fetch(`/api/tesla/vehicles/${id}/state`)
      const d = await r.json()
      if (d.asleep) { setLoading(false); return }
      const cs = d.chargeState?.response
      const cl = d.climateState?.response
      const vs = d.vehicle?.response
      setState({
        battery_level: cs?.battery_level ?? 0,
        battery_range: Math.round(cs?.battery_range ?? 0),
        charging_state: cs?.charging_state ?? 'Unknown',
        charge_limit_soc: cs?.charge_limit_soc ?? 80,
        charge_port_door_open: cs?.charge_port_door_open ?? false,
        locked: vs?.locked ?? true,
        inside_temp: cl?.inside_temp ? Math.round((cl.inside_temp * 9/5) + 32) : 0,
        outside_temp: cl?.outside_temp ? Math.round((cl.outside_temp * 9/5) + 32) : 0,
        vehicle_name: displayName || vs?.vehicle_name || 'My Tesla',
        odometer: Math.round(vs?.odometer ?? 0),
        is_climate_on: cl?.is_climate_on ?? false,
        sentry_mode: vs?.sentry_mode ?? false,
        car_version: vs?.car_version ?? '',
        is_user_present: vs?.is_user_present ?? false,
        media_title: vs?.media_info?.now_playing_title ?? '',
        media_artist: vs?.media_info?.now_playing_artist ?? '',
        media_source: vs?.media_info?.now_playing_source ?? '',
        tpms_fl: vs?.tpms_pressure_fl ?? 0,
        tpms_fr: vs?.tpms_pressure_fr ?? 0,
        tpms_rl: vs?.tpms_pressure_rl ?? 0,
        tpms_rr: vs?.tpms_pressure_rr ?? 0,
      })
      setLastUpdated(new Date())
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function wakeVehicle() {
    const id = vehicles[0]?.id
    if (!id) return
    setWaking(true)
    setWakeStatus('Sending wake signal...')

    let attempts = 0

    const sendWake = async () => {
      try {
        await fetch(`/api/tesla/vehicles/${id}/wake`, { method: 'POST' })
      } catch (_) {}
    }

    const poll = async () => {
      attempts++
      // Re-send wake every 10s — offline cars need repeated pings
      if (attempts % 2 === 0) {
        setWakeStatus(`Still waking… retrying (${attempts * 5}s)`)
        await sendWake()
      } else {
        setWakeStatus(`Waiting for car to come online… (${attempts * 5}s)`)
      }

      try {
        const r = await fetch(`/api/tesla/vehicles/${id}/online`)
        const d = await r.json()
        if (d.online) {
          setWakeStatus('Online! Loading data...')
          setWaking(false)
          loadState(id, vehicles[0]?.display_name)
          return
        }
      } catch (_) {}

      if (attempts < 24) { // up to 2 minutes
        setTimeout(poll, 5000)
      } else {
        setWakeStatus('')
        setWaking(false)
      }
    }

    await sendWake()
    setTimeout(poll, 5000)
  }

  function refresh() {
    const v = vehicles[0]
    if (v) loadState(v.id, v.display_name)
  }

  if (loading) return <div className="loading"><div className="spinner" />Loading vehicle data...</div>

  if (!state) return (
    <div className="wake-screen">
      <div className="car-icon">🚗</div>
      <h2>Vehicle is asleep</h2>
      <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '8px' }}>
        ONE Y · offline
      </p>
      <button className="wake-btn" onClick={wakeVehicle} disabled={waking}>
        {waking ? '⏳ ' + (wakeStatus || 'Waking up…') : '⚡ Wake Vehicle'}
      </button>
      {waking && (
        <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '12px' }}>
          Offline cars can take 1–2 minutes. Keep this screen open.
        </p>
      )}
    </div>
  )

  const battColor = state.battery_level > 50 ? '#00d084' : state.battery_level > 20 ? '#f0a500' : '#e53e3e'
  const psiToBar = (b: number) => (b * 14.504).toFixed(0)

  return (
    <div className="dashboard">
      <div className="dash-header">
        <div>
          <h2 className="vehicle-name">{state.vehicle_name}</h2>
          <span className="fw-version">v{state.car_version}</span>
        </div>
        <button className="refresh-btn" onClick={refresh}>↻</button>
      </div>

      {/* Battery card */}
      <div className="card battery-card">
        <div className="battery-header">
          <span className="battery-pct" style={{ color: battColor }}>{state.battery_level}%</span>
          <div className="battery-right">
            <span className="battery-range">{state.battery_range} mi</span>
            <span className="charge-limit">Limit: {state.charge_limit_soc}%</span>
          </div>
        </div>
        <div className="battery-bar-bg">
          <div className="battery-bar-fill" style={{ width: `${state.battery_level}%`, background: battColor }} />
        </div>
        <div className="battery-footer">
          <span className={`charge-status ${state.charging_state === 'Charging' ? 'charging' : ''}`}>
            {state.charging_state === 'Charging' ? '⚡ Charging' : state.charging_state}
          </span>
          {state.charge_port_door_open && <span className="port-open">🔌 Port Open</span>}
        </div>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">{state.locked ? '🔒' : '🔓'}</span>
          <span className="stat-label">{state.locked ? 'Locked' : 'Unlocked'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">{state.is_climate_on ? '❄️' : '🌡️'}</span>
          <span className="stat-label">Inside {state.inside_temp}°F</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🌤️</span>
          <span className="stat-label">Outside {state.outside_temp}°F</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📍</span>
          <span className="stat-label">{state.odometer.toLocaleString()} mi</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">{state.sentry_mode ? '👁️' : '😴'}</span>
          <span className="stat-label">Sentry {state.sentry_mode ? 'On' : 'Off'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">{state.is_user_present ? '🧑' : '🪑'}</span>
          <span className="stat-label">{state.is_user_present ? 'Occupied' : 'Empty'}</span>
        </div>
      </div>

      {/* Media card */}
      {state.media_title && (
        <div className="card media-card">
          <div className="media-icon">🎵</div>
          <div className="media-info">
            <div className="media-title">{state.media_title}</div>
            <div className="media-sub">{state.media_artist || state.media_source}</div>
          </div>
        </div>
      )}

      {/* TPMS card */}
      <div className="card tpms-card">
        <h3>Tire Pressure <span className="tpms-unit">(PSI)</span></h3>
        <div className="tpms-grid">
          <div className="tpms-tire"><span>{psiToBar(state.tpms_fl)}</span><label>FL</label></div>
          <div className="tpms-tire"><span>{psiToBar(state.tpms_fr)}</span><label>FR</label></div>
          <div className="tpms-tire"><span>{psiToBar(state.tpms_rl)}</span><label>RL</label></div>
          <div className="tpms-tire"><span>{psiToBar(state.tpms_rr)}</span><label>RR</label></div>
        </div>
      </div>

      {lastUpdated && (
        <p className="last-updated">Updated {lastUpdated.toLocaleTimeString()}</p>
      )}
    </div>
  )
}
