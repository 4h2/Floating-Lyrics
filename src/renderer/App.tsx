import React, { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TitleBar } from './components/TitleBar'
import { LoginScreen } from './components/LoginScreen'
import { LyricsDisplay } from './components/LyricsDisplay'
import { ProgressBar } from './components/ProgressBar'
import { CompactLyric } from './components/CompactLyric'
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

  // ─── Seek to Position ──────────────────────────────────────────────

  const handleSeek = useCallback((positionMs: number) => {
    playbackService.current.seekTo(positionMs)
  }, [])

  // ─── Toggle Expanded / Compact Mode ────────────────────────────────

  const toggleMode = useCallback(() => {
    const next = settings.mode === 'expanded' ? 'compact' : 'expanded'
    settings.updateSetting('mode', next)
  }, [settings.mode])

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
      {/* Background blur layer — crossfade on song change */}
      <div className="app-bg">
        <AnimatePresence mode="sync">
          {settings.albumArtPresence > 0 && player.track?.albumArtUrl && (
            <motion.img
              key={player.track.albumArtUrl}
              className="app-bg-image"
              src={player.track.albumArtUrl}
              alt=""
              crossOrigin="anonymous"
              style={{
                filter: `blur(${80 - settings.albumArtPresence * 0.75}px) saturate(${1.2 + settings.albumArtPresence * 0.01}) brightness(${0.2 + settings.albumArtPresence * 0.003})`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 + settings.albumArtPresence * 0.006 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: 'easeInOut' }}
            />
          )}
        </AnimatePresence>
        <div className="app-bg-overlay" />
      </div>

      {/* Content */}
      <div className="app-content">
        <TitleBar onSettingsClick={() => setSettingsOpen(true)} />

        {view === 'login' ? (
          <LoginScreen onLogin={handleLogin} />
        ) : (
          <>
            {/* Player Content — both modes rendered, one visible at a time.
                This allows layoutId="album-art" to perform a shared-element transition. */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

              {/* ─── Expanded Layer ─── */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: settings.mode === 'expanded' ? 1 : 0,
                  pointerEvents: settings.mode === 'expanded' ? 'auto' : 'none',
                  transition: 'opacity 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: settings.mode === 'expanded' ? 1 : 0,
                }}
              >
                {/* Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '0 16px 12px 16px', flexShrink: 0
                }}>
                  {/* Thumbnail — shared element source */}
                  <motion.div
                    onClick={toggleMode}
                    title="Tap to expand"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      width: '52px', height: '52px', borderRadius: '8px',
                      overflow: 'hidden', flexShrink: 0,
                      background: 'rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    }}
                  >
                    {player.track?.albumArtUrlSmall || player.track?.albumArtUrl ? (
                      <motion.img
                        layoutId="album-art"
                        key={player.track?.id || 'none'}
                        src={player.track.albumArtUrlSmall || player.track.albumArtUrl!}
                        alt=""
                        style={{
                          width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit',
                        }}
                        crossOrigin="anonymous"
                      />
                    ) : (
                      <span style={{ fontSize: '20px', opacity: 0.3 }}>🎵</span>
                    )}
                  </motion.div>

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

                {/* Progress Bar */}
                {settings.showProgressBar && player.track && (
                  <ProgressBar />
                )}

                {/* Lyrics */}
                <LyricsDisplay onSeek={handleSeek} />
              </div>

              {/* ─── Compact Layer ─── */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: settings.mode === 'compact' ? 1 : 0,
                  pointerEvents: settings.mode === 'compact' ? 'auto' : 'none',
                  transition: 'opacity 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  padding: '20px 16px',
                  zIndex: settings.mode === 'compact' ? 1 : 0,
                }}
              >
                {/* Big Album Art — shared element destination */}
                <motion.div
                  onClick={toggleMode}
                  title="Tap to shrink"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  style={{
                    width: 'min(180px, 60vw)',
                    height: 'min(180px, 60vw)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: 'rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
                  }}
                >
                  {player.track?.albumArtUrl ? (
                    <motion.img
                      layoutId="album-art"
                      key={player.track?.id || 'none'}
                      src={player.track.albumArtUrl}
                      alt={player.track?.album || 'Album Art'}
                      style={{
                        width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit',
                      }}
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <span style={{ fontSize: '48px', opacity: 0.3 }}>🎵</span>
                  )}
                </motion.div>

                {/* Track Info */}
                <div style={{ textAlign: 'center', width: '100%', minWidth: 0 }}>
                  <div style={{
                    fontSize: '15px', fontWeight: 700,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {player.track?.title || 'No track'}
                  </div>
                  <div style={{
                    fontSize: '12px', opacity: 0.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginTop: '2px'
                  }}>
                    {player.track?.artist || 'Play something on Spotify'}
                  </div>
                </div>

                {/* Single Line Lyric */}
                <CompactLyric />

                {/* Progress Bar */}
                {settings.showProgressBar && player.track && (
                  <div style={{ width: '100%', flexShrink: 0 }}>
                    <ProgressBar />
                  </div>
                )}

                {!player.isPlaying && player.track && (
                  <span style={{ fontSize: '10px', opacity: 0.25, letterSpacing: '1px' }}>PAUSED</span>
                )}
              </div>
            </div>
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
