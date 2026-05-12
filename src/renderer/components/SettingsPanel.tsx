import React from 'react'
import { useSettingsStore } from '../stores/settingsStore'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  onLogout: () => void
  onClearCache: () => void
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, onLogout, onClearCache }) => {
  const settings = useSettingsStore()

  if (!isOpen) return null

  const handleFolderPick = async () => {
    const path = await window.electronAPI.dialog.selectFolder()
    if (path) settings.updateSetting('lrcFolderPath', path)
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Display */}
        <div className="settings-section">
          <div className="settings-section-title">Display</div>

          <div className="setting-row">
            <div className="setting-row-header">
              <span className="setting-label">Font Size</span>
              <span className="setting-value">{settings.fontSize}px</span>
            </div>
            <input
              type="range" className="setting-slider"
              min={16} max={48} step={1}
              value={settings.fontSize}
              onChange={e => settings.updateSetting('fontSize', Number(e.target.value))}
            />
          </div>

          <div className="setting-row">
            <div className="setting-row-header">
              <span className="setting-label">Window Opacity</span>
              <span className="setting-value">{Math.round(settings.windowOpacity * 100)}%</span>
            </div>
            <input
              type="range" className="setting-slider"
              min={0.3} max={1} step={0.05}
              value={settings.windowOpacity}
              onChange={e => {
                const v = Number(e.target.value)
                settings.updateSetting('windowOpacity', v)
                window.electronAPI.window.setOpacity(v)
              }}
            />
          </div>

          <div className="setting-row">
            <div className="setting-row-header">
              <span className="setting-label">Theme</span>
            </div>
            <div className="setting-select-group">
              {(['auto', 'dark', 'light'] as const).map(t => (
                <button
                  key={t}
                  className={`setting-select-btn ${settings.theme === t ? 'active' : ''}`}
                  onClick={() => settings.updateSetting('theme', t)}
                >
                  {t === 'auto' ? '🎨 Auto' : t === 'dark' ? '🌙 Dark' : '☀️ Light'}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row-header">
              <span className="setting-label">Album Art Presence</span>
              <span className="setting-value">
                {settings.albumArtPresence === 0 ? 'Off' : `${settings.albumArtPresence}%`}
              </span>
            </div>
            <input
              type="range" className="setting-slider"
              min={0} max={100} step={5}
              value={settings.albumArtPresence}
              onChange={e => settings.updateSetting('albumArtPresence', Number(e.target.value))}
            />
            <div className="setting-hint">Controls blur and visibility of album cover background</div>
          </div>
        </div>

        {/* Lyrics */}
        <div className="settings-section">
          <div className="settings-section-title">Lyrics</div>

          <div className="setting-row">
            <div className="setting-row-header">
              <span className="setting-label">Offset</span>
              <span className="setting-value">{settings.lyricsOffsetMs > 0 ? '+' : ''}{settings.lyricsOffsetMs}ms</span>
            </div>
            <input
              type="range" className="setting-slider"
              min={-2000} max={2000} step={50}
              value={settings.lyricsOffsetMs}
              onChange={e => settings.updateSetting('lyricsOffsetMs', Number(e.target.value))}
            />
          </div>

          <div className="setting-row">
            <div className="setting-row-header">
              <span className="setting-label">Local .lrc Folder</span>
            </div>
            <div className="setting-folder">
              <div className="setting-folder-path">
                {settings.lrcFolderPath || 'Not set'}
              </div>
              <button className="setting-folder-btn" onClick={handleFolderPick}>Browse</button>
            </div>
          </div>

          <div className="setting-row">
            <div className="setting-row-header">
              <span className="setting-label">Musixmatch Provider</span>
              <button
                className={`setting-toggle ${settings.musixmatchEnabled ? 'active' : ''}`}
                onClick={() => settings.updateSetting('musixmatchEnabled', !settings.musixmatchEnabled)}
              >
                <div className="setting-toggle-knob" />
              </button>
            </div>
          </div>
        </div>

        {/* Window */}
        <div className="settings-section">
          <div className="settings-section-title">Window</div>
          <div className="setting-row">
            <div className="setting-row-header">
              <span className="setting-label">Always on Top</span>
              <button
                className={`setting-toggle ${settings.alwaysOnTop ? 'active' : ''}`}
                onClick={() => {
                  const v = !settings.alwaysOnTop
                  settings.updateSetting('alwaysOnTop', v)
                  window.electronAPI.window.setAlwaysOnTop(v)
                }}
              >
                <div className="setting-toggle-knob" />
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="settings-section">
          <div className="settings-section-title">Actions</div>
          <button className="settings-danger-btn" onClick={onClearCache}>Clear Lyrics Cache</button>
          <button className="settings-danger-btn" onClick={onLogout}>Logout from Spotify</button>
        </div>
      </div>
    </div>
  )
}
