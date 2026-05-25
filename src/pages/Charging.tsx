import { useEffect, useState } from 'react'

export default function Charging() {
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [chargeState, setChargeState] = useState<any>(null)
  const [limit, setLimit] = useState<number>(80)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tesla/vehicles')
      .then(r => r.json())
      .then(d => {
        const id = d.response?.[0]?.id
        setVehicleId(id)
        if (id) loadChargeState(id)
      })
  }, [])

  async function loadChargeState(id: number) {
    setLoading(true)
    const r = await fetch(`/api/tesla/vehicles/${id}/state`)
    const d = await r.json()
    const cs = d.chargeState?.response
    setChargeState(cs)
    setLimit(cs?.charge_limit_soc ?? 80)
    setLoading(false)
  }

  async function sendChargingCmd(command: string, body?: object) {
    if (!vehicleId) return
    const r = await fetch(`/api/tesla/vehicles/${vehicleId}/command/${command}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    })
    const d = await r.json()
    setMsg(d.response?.result ? '✅ Done' : '❌ Failed')
    setTimeout(() => setMsg(null), 3000)
    loadChargeState(vehicleId!)
  }

  if (loading) return <div className="loading"><div className="spinner" />Loading charge data...</div>

  const battColor = (chargeState?.battery_level ?? 0) > 50 ? '#00d084'
    : (chargeState?.battery_level ?? 0) > 20 ? '#f0a500' : '#e53e3e'

  return (
    <div className="charging-page">
      <h2>Charging</h2>
      {msg && <div className="result-toast">{msg}</div>}

      {/* Status cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon" style={{ color: battColor }}>⚡</span>
          <span className="stat-label">{chargeState?.battery_level ?? '--'}%</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📏</span>
          <span className="stat-label">{Math.round(chargeState?.battery_range ?? 0)} mi</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🔌</span>
          <span className="stat-label">{chargeState?.charging_state ?? '--'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⏱️</span>
          <span className="stat-label">
            {chargeState?.minutes_to_full_charge
              ? `${chargeState.minutes_to_full_charge} min`
              : 'N/A'}
          </span>
        </div>
      </div>

      {/* Charge limit slider */}
      <div className="card limit-card">
        <div className="limit-header">
          <span>Charge Limit</span>
          <span className="limit-value">{limit}%</span>
        </div>
        <input
          type="range" min={50} max={100} value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          className="limit-slider"
        />
        <button className="set-limit-btn"
          onClick={() => sendChargingCmd('set_charge_limit', { percent: limit })}>
          Set Limit
        </button>
      </div>

      {/* Start / Stop */}
      <div className="charge-actions">
        <button className="cmd-btn" onClick={() => sendChargingCmd('charge_start')}>
          <span className="cmd-icon">▶️</span>
          <span className="cmd-label">Start Charging</span>
        </button>
        <button className="cmd-btn" onClick={() => sendChargingCmd('charge_stop')}>
          <span className="cmd-icon">⏹️</span>
          <span className="cmd-label">Stop Charging</span>
        </button>
      </div>
    </div>
  )
}
