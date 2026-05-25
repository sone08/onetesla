import { useEffect, useState } from 'react'

interface Cmd { label: string; icon: string; command: string; body?: object }

const COMMANDS: Cmd[] = [
  { label: 'Lock',          icon: '🔒', command: 'door_lock' },
  { label: 'Unlock',        icon: '🔓', command: 'door_unlock' },
  { label: 'Climate On',    icon: '❄️',  command: 'auto_conditioning_start' },
  { label: 'Climate Off',   icon: '🌬️', command: 'auto_conditioning_stop' },
  { label: 'Honk Horn',     icon: '📯', command: 'honk_horn' },
  { label: 'Flash Lights',  icon: '💡', command: 'flash_lights' },
  { label: 'Open Trunk',    icon: '🚪', command: 'actuate_trunk', body: { which_trunk: 'rear' } },
  { label: 'Open Frunk',    icon: '📦', command: 'actuate_trunk', body: { which_trunk: 'front' } },
]

export default function Controls() {
  const [vehicleId, setVehicleId] = useState<number | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tesla/vehicles')
      .then(r => r.json())
      .then(d => setVehicleId(d.response?.[0]?.id ?? null))
  }, [])

  async function sendCommand(cmd: Cmd) {
    if (!vehicleId) return
    setLoading(cmd.command)
    setResult(null)
    try {
      const r = await fetch(`/api/tesla/vehicles/${vehicleId}/command/${cmd.command}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmd.body || {})
      })
      const d = await r.json()
      setResult(d.response?.result ? `✅ ${cmd.label} successful` : `❌ ${cmd.label} failed`)
    } catch {
      setResult(`❌ Command failed`)
    }
    setLoading(null)
    setTimeout(() => setResult(null), 3000)
  }

  return (
    <div className="controls">
      <h2>Vehicle Controls</h2>
      {result && <div className="result-toast">{result}</div>}
      <div className="commands-grid">
        {COMMANDS.map(cmd => (
          <button
            key={cmd.command + cmd.label}
            className={`cmd-btn ${loading === cmd.command ? 'loading' : ''}`}
            onClick={() => sendCommand(cmd)}
            disabled={!!loading || !vehicleId}
          >
            <span className="cmd-icon">{loading === cmd.command ? '⏳' : cmd.icon}</span>
            <span className="cmd-label">{cmd.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
