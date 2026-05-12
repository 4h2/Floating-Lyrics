import React, { useEffect, useRef, useState, useCallback } from 'react'
import { TitleBar } from './components/TitleBar'
import { LoginScreen } from './components/LoginScreen'
import { LyricsDisplay } from './components/LyricsDisplay'
import { SettingsPanel } from './components/SettingsPanel'
import { usePlayerStore } from './stores/playerStore'
import { useLyricsStore } from './stores/lyricsStore'
import { useSettingsStore } from './stores/settingsStore'
import { useThemeStore } from './stores/themeStore'
import { SpotifyPlaybackService } from './services/SpotifyPlaybackService'
import { LyricsProviderService } from './services/LyricsProviderService'
import { LocalLrcProvider } from './providers/LocalLrcProvider'
import { LrcLibProvider } from './providers/LrcLibProvider'
import { MusixmatchUnofficialProvider } from './providers/MusixmatchUnofficialProvider'
import { FallbackStaticProvider } from './providers/FallbackStaticProvider'
import { LyricsSyncEngine } from './engine/LyricsSyncEngine'
import type { TrackInfo as TrackInfoType } from './types/spotify'
import type { SyncedLyrics } from './types/lyrics'

import './styles/index.css'
import './styles/titlebar.css'
import './styles/lyrics.css'
import './styles/login.css'
import './styles/settings.css'

// ─── App State ─────────────────────────────────────────────────────────────

type AppView = 'login' | 'player'

// ─── Main App ──────────────────────────────────────────────────────────────

export const App: React.FC = () => {
  const [view, setView] = useState<AppView>('login')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Stores
  const player = usePlayerStore()
  const lyrics = useLyricsStore()
  const settings = useSettingsStore()
  const theme = useThemeStore()

  // Services (stable refs)
  const playbackService = useRef(new SpotifyPlaybackService())
  const lyricsService = useRef(new LyricsProviderService())
  const syncEngine = useRef(new LyricsSyncEngine())
  const localProvider = useRef(new LocalLrcProvider())
  const mxmProvider = useRef(new MusixmatchUnofficialProvider())

  // ─── Initialize ────────────────────────────────────────────────────

  useEffect(() => {
    settings.loadSettings()
  }, [])

  // Configure providers when settings change
  useEffect(() => {
    if (!settings.isLoaded) return

    localProvider.current.setFolderPath(settings.lrcFolderPath)
    mxmProvider.current.setEnabled(settings.musixmatchEnabled)
    theme.setMode(settings.theme)

    lyricsService.current.setProviders([
      localProvider.current,
      new LrcLibProvider(),
      mxmProvider.current,
      new FallbackStaticProvider(),
    ])
  }, [settings.isLoaded, settings.lrcFolderPath, settings.musixmatchEnabled, settings.theme])

  // Sync engine offset
  useEffect(() => {
    syncEngine.current.setOffset(settings.lyricsOffsetMs)
  }, [settings.lyricsOffsetMs])

  // Sync engine state -> store
  useEffect(() => {
    syncEngine.current.onStateChange = (state) => {
      lyrics.setSyncState(state)
    }
    return () => { syncEngine.current.onStateChange = null }
  }, [])

  // ─── Auth Flow (all PKCE is handled by main process) ───────────────

  useEffect(() => {
    // 1. Check for existing tokens on startup
    window.electronAPI.auth.getTokens().then(async (tokens) => {
      if (tokens && tokens.accessToken) {
        console.log('[App] Found existing tokens, connecting...')
        const config = await window.electronAPI.auth.getConfig()
        playbackService.current.setClientId(config.clientId)
        playbackService.current.setTokens(tokens)
        player.setConnected(true)
        setView('player')
        playbackService.current.startPolling()
      }
    })

    // 2. Listen for tokens from main process (after OAuth flow completes)
    const unsubTokens = window.electronAPI.auth.onTokensReceived(async (tokens) => {
      console.log('[App] Received tokens from main process')
      const config = await window.electronAPI.auth.getConfig()
      playbackService.current.setClientId(config.clientId)
      playbackService.current.setTokens(tokens)
      player.setConnected(true)
      player.setError(null)
      setView('player')
      playbackService.current.startPolling()
    })

    // 3. Listen for auth errors
    const unsubError = window.electronAPI.auth.onAuthError((error) => {
      console.error('[App] Auth error:', error)
      player.setError(error)
    })

    return () => {
      unsubTokens()
      unsubError()
    }
  }, [])

  // ─── Spotify Playback Handlers ─────────────────────────────────────

  useEffect(() => {
    const service = playbackService.current

    service.onPlaybackUpdate = (info) => {
      if (info.track) {
        player.setTrack(info.track)
        player.setPlaying(info.isPlaying)
        player.updateProgress(info.progressMs, info.receivedAt)
        syncEngine.current.updateProgress(info.progressMs, info.isPlaying)
      } else {
        player.setTrack(null)
        player.setPlaying(false)
      }
    }

    service.onTrackChange = (track) => {
      handleTrackChange(track)
    }

    service.onAuthError = () => {
      player.setConnected(false)
      player.setError('Session expired')
      service.stopPolling()
      setView('login')
    }

    service.onError = (error) => {
      console.error('[Playback]', error)
    }

    return () => {
      service.onPlaybackUpdate = null
      service.onTrackChange = null
      service.onAuthError = null
      service.onError = null
    }
  }, [])

  // ─── Track Change Handler ──────────────────────────────────────────

  const handleTrackChange = useCallback(async (track: TrackInfoType) => {
    if (track.albumArtUrl) {
      theme.generateFromAlbumArt(track.albumArtUrl)
    } else {
      theme.reset()
    }

    lyrics.setStatus('loading')
    syncEngine.current.setLyrics(null)

    try {
      const result = await lyricsService.current.search({
        title: track.title,
        artist: track.artistsList[0] || track.artist,
        album: track.album,
        durationMs: track.durationMs,
      })

      lyrics.setLyrics(result)

      if (result?.type === 'synced') {
        syncEngine.current.setLyrics(result as SyncedLyrics)
      }
    } catch (e) {
      console.error('[Lyrics] Fetch error:', e)
      lyrics.setError('Failed to fetch lyrics')
    }
  }, [])

  // ─── Login (just tells main process to start the flow) ─────────────

  const handleLogin = useCallback(() => {
    console.log('[App] Login button clicked')
    window.electronAPI.auth.login()
  }, [])

  // ─── Logout ────────────────────────────────────────────────────────

  const handleLogout = useCallback(() => {
    playbackService.current.stopPolling()
    playbackService.current.clearTokens()
    window.electronAPI.auth.logout()
    player.reset()
    lyrics.reset()
    theme.reset()
    setView('login')
    setSettingsOpen(false)
  }, [])

  // ─── Clear Cache ───────────────────────────────────────────────────

  const handleClearCache = useCallback(() => {
    lyricsService.current.clearCache()
  }, [])

  // ─── Apply theme to DOM ────────────────────────────────────────────

  useEffect(() => {
    theme.applyToDOM()
  }, [theme.colors])

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      {/* Background blur layer */}
      <div className="app-bg">
        {settings.albumArtBackground && player.track?.albumArtUrl && (
          <img
            className="app-bg-image"
            src={player.track.albumArtUrl}
            alt=""
            crossOrigin="anonymous"
          />
        )}
        <div className="app-bg-overlay" />
      </div>

      {/* Content */}
      <div className="app-content">
        <TitleBar onSettingsClick={() => setSettingsOpen(true)} />

        {view === 'login' ? (
          <LoginScreen onLogin={handleLogin} />
        ) : (
          <>
            {/* Player Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '0 16px 12px 16px', flexShrink: 0
            }}>
              <div style={{
                width: '52px', height: '52px', borderRadius: '8px',
                overflow: 'hidden', flexShrink: 0,
                background: 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {player.track?.albumArtUrl ? (
                  <img
                    src={player.track.albumArtUrl} alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    crossOrigin="anonymous"
                  />
                ) : (
                  <span style={{ fontSize: '20px', opacity: 0.3 }}>🎵</span>
                )}
              </div>
              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <div style={{
                  fontSize: '14px', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {player.track?.title || 'No track'}
                </div>
                <div style={{
                  fontSize: '12px', opacity: 0.5,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {player.track?.artist || 'Play something on Spotify'}
                </div>
              </div>
              {!player.isPlaying && player.track && (
                <span style={{ fontSize: '11px', opacity: 0.3, flexShrink: 0 }}>PAUSED</span>
              )}
            </div>

            {/* Lyrics */}
            <LyricsDisplay />
          </>
        )}

        {/* Error toast */}
        {player.error && (
          <div style={{
            position: 'absolute', bottom: '16px', left: '16px', right: '16px',
            padding: '10px 14px', background: 'rgba(255,60,60,0.15)',
            border: '1px solid rgba(255,60,60,0.3)', borderRadius: '8px',
            fontSize: '12px', color: '#ff8888', zIndex: 300,
            backdropFilter: 'blur(12px)'
          }}>
            {player.error}
          </div>
        )}

        {/* Settings Panel */}
        <SettingsPanel
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onLogout={handleLogout}
          onClearCache={handleClearCache}
        />
      </div>
    </div>
  )
}

export default App
