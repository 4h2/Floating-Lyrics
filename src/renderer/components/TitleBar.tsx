import React, { useState, useEffect } from 'react'
import { usePlayerStore } from '../stores/playerStore'

interface TitleBarProps {
  onSettingsClick: () => void
  onFullscreen?: () => void
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick, onFullscreen }) => {
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
        {onFullscreen && (
          <button className="titlebar-btn" onClick={onFullscreen} title="Fullscreen">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        )}
        <button className={`titlebar-btn ${alwaysOnTop ? 'active' : ''}`} onClick={handlePin} title="Always on Top">📌</button>
        <button className="titlebar-btn" onClick={() => window.electronAPI.window.minimize()} title="Minimize">─</button>
        <button className="titlebar-btn close" onClick={() => window.electronAPI.window.close()} title="Close">✕</button>
      </div>
    </div>
  )
}
