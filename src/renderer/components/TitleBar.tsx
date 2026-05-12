import React, { useState, useEffect } from 'react'
import { usePlayerStore } from '../stores/playerStore'

interface TitleBarProps {
  onSettingsClick: () => void
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const isConnected = usePlayerStore(s => s.isConnected)

  useEffect(() => {
    window.electronAPI.window.isAlwaysOnTop().then(setAlwaysOnTop)
  }, [])

  const handlePin = async () => {
    const next = await window.electronAPI.window.toggleAlwaysOnTop()
    setAlwaysOnTop(next)
  }

  return (
    <div className="titlebar">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
        <span className="titlebar-title">Floating Lyrics</span>
      </div>
      <div className="titlebar-controls">
        <button className="titlebar-btn" onClick={onSettingsClick} title="Settings">⚙</button>
        <button className={`titlebar-btn ${alwaysOnTop ? 'active' : ''}`} onClick={handlePin} title="Always on Top">📌</button>
        <button className="titlebar-btn" onClick={() => window.electronAPI.window.minimize()} title="Minimize">─</button>
        <button className="titlebar-btn close" onClick={() => window.electronAPI.window.close()} title="Close">✕</button>
      </div>
    </div>
  )
}
