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

  // Player state/actions (granular selectors to avoid global re-renders)
  const track = usePlayerStore(s => s.track)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const playerError = usePlayerStore(s => s.error)
  const setTrack = usePlayerStore(s => s.setTrack)
  const setPlaying = usePlayerStore(s => s.setPlaying)
  const updateProgress = usePlayerStore(s => s.updateProgress)
  const setConnected = usePlayerStore(s => s.setConnected)
  const setPlayerError = usePlayerStore(s => s.setError)
  const resetPlayer = usePlayerStore(s => s.reset)

  // Lyrics state/actions
  const setLyrics = useLyricsStore(s => s.setLyrics)
  const setLyricsStatus = useLyricsStore(s => s.setStatus)
  const setLyricsError = useLyricsStore(s => s.setError)
  const setSyncState = useLyricsStore(s => s.setSyncState)
  const resetLyrics = useLyricsStore(s => s.reset)

  // Settings state/actions used by App
  const loadSettings = useSettingsStore(s => s.loadSettings)
  const updateSetting = useSettingsStore(s => s.updateSetting)
  const settingsLoaded = useSettingsStore(s => s.isLoaded)
  const lrcFolderPath = useSettingsStore(s => s.lrcFolderPath)
  const musixmatchEnabled = useSettingsStore(s => s.musixmatchEnabled)
  const themeMode = useSettingsStore(s => s.theme)
  const lyricsOffsetMs = useSettingsStore(s => s.lyricsOffsetMs)
  const mode = useSettingsStore(s => s.mode)
  const albumArtPresence = useSettingsStore(s => s.albumArtPresence)
  const showProgressBar = useSettingsStore(s => s.showProgressBar)

  // Theme actions/state used by App
  const themeColors = useThemeStore(s => s.colors)
  const setThemeMode = useThemeStore(s => s.setMode)
  const generateFromAlbumArt = useThemeStore(s => s.generateFromAlbumArt)
  const applyThemeToDOM = useThemeStore(s => s.applyToDOM)
  const resetTheme = useThemeStore(s => s.reset)

  // Services (stable refs)
  const playbackService = useRef(new SpotifyPlaybackService())
  const lyricsService = useRef(new LyricsProviderService())
  const syncEngine = useRef(new LyricsSyncEngine())
  const localProvider = useRef(new LocalLrcProvider())
  const lrcLibProvider = useRef(new LrcLibProvider())
  const mxmProvider = useRef(new MusixmatchUnofficialProvider())
  const fallbackProvider = useRef(new FallbackStaticProvider())

  // ─── Initialize ────────────────────────────────────────────────────

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Configure providers when settings change
  useEffect(() => {
    if (!settingsLoaded) return

    localProvider.current.setFolderPath(lrcFolderPath)
    mxmProvider.current.setEnabled(musixmatchEnabled)
    setThemeMode(themeMode)

    lyricsService.current.setProviders([
      localProvider.current,
      lrcLibProvider.current,
      mxmProvider.current,
      fallbackProvider.current,
    ])
  }, [settingsLoaded, lrcFolderPath, musixmatchEnabled, themeMode, setThemeMode])

  // Sync engine offset
  useEffect(() => {
    syncEngine.current.setOffset(lyricsOffsetMs)
  }, [lyricsOffsetMs])

  // Sync engine state -> store
  useEffect(() => {
    syncEngine.current.onStateChange = (state) => {
      setSyncState(state)
    }
    return () => { syncEngine.current.onStateChange = null }
  }, [setSyncState])

  // ─── Auth Flow (all PKCE is handled by main process) ───────────────

  useEffect(() => {
    // 1. Check for existing tokens on startup
    window.electronAPI.auth.getTokens().then(async (tokens) => {
      if (tokens && tokens.accessToken) {
        console.log('[App] Found existing tokens, connecting...')
        const config = await window.electronAPI.auth.getConfig()
        playbackService.current.setClientId(config.clientId)
        playbackService.current.setTokens(tokens)
        setConnected(true)
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
      setConnected(true)
      setPlayerError(null)
      setView('player')
      playbackService.current.startPolling()
    })

    // 3. Listen for auth errors
    const unsubError = window.electronAPI.auth.onAuthError((error) => {
      console.error('[App] Auth error:', error)
      setPlayerError(error)
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
        setTrack(info.track)
        setPlaying(info.isPlaying)
        updateProgress(info.progressMs, info.receivedAt)
        syncEngine.current.updateProgress(info.progressMs, info.isPlaying)
      } else {
        setTrack(null)
        setPlaying(false)
      }
    }

    service.onTrackChange = (track) => {
      handleTrackChange(track)
    }

    service.onAuthError = () => {
      setConnected(false)
      setPlayerError('Session expired')
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
      generateFromAlbumArt(track.albumArtUrl)
    } else {
      resetTheme()
    }

    setLyricsStatus('loading')
    syncEngine.current.setLyrics(null)

    try {
      const result = await lyricsService.current.search({
        title: track.title,
        artist: track.artistsList[0] || track.artist,
        album: track.album,
        durationMs: track.durationMs,
      })

      setLyrics(result)

      if (result?.type === 'synced') {
        syncEngine.current.setLyrics(result as SyncedLyrics)
      }
    } catch (e) {
      console.error('[Lyrics] Fetch error:', e)
      setLyricsError('Failed to fetch lyrics')
    }
  }, [generateFromAlbumArt, resetTheme, setLyricsStatus, setLyrics, setLyricsError])

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
    resetPlayer()
    resetLyrics()
    resetTheme()
    setView('login')
    setSettingsOpen(false)
  }, [resetPlayer, resetLyrics, resetTheme])

  // ─── Seek to Position ──────────────────────────────────────────────

  const handleSeek = useCallback((positionMs: number) => {
    playbackService.current.seekTo(positionMs)
  }, [])

  // ─── Toggle Expanded / Compact Mode ────────────────────────────────

  const toggleMode = useCallback(() => {
    const next = mode === 'expanded' ? 'compact' : 'expanded'
    updateSetting('mode', next)
  }, [mode, updateSetting])

  // ─── Clear Cache ───────────────────────────────────────────────────

  const handleClearCache = useCallback(() => {
    lyricsService.current.clearCache()
  }, [])

  // ─── Apply theme to DOM ────────────────────────────────────────────

  useEffect(() => {
    applyThemeToDOM()
  }, [themeColors])

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      {/* Background blur layer — crossfade on song change */}
      <div className="app-bg">
        <AnimatePresence mode="sync">
          {albumArtPresence > 0 && track?.albumArtUrl && (
            <motion.img
              key={track.albumArtUrl}
              className="app-bg-image"
              src={track.albumArtUrl}
              alt=""
              crossOrigin="anonymous"
              style={{
                filter: `blur(${80 - albumArtPresence * 0.75}px) saturate(${1.2 + albumArtPresence * 0.01}) brightness(${0.2 + albumArtPresence * 0.003})`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 + albumArtPresence * 0.006 }}
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
                  opacity: mode === 'expanded' ? 1 : 0,
                  pointerEvents: mode === 'expanded' ? 'auto' : 'none',
                  transition: 'opacity 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: mode === 'expanded' ? 1 : 0,
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
                    {track?.albumArtUrlSmall || track?.albumArtUrl ? (
                      <motion.img
                        layoutId="album-art"
                        key={track?.id || 'none'}
                        src={track.albumArtUrlSmall || track.albumArtUrl!}
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
                      {track?.title || 'No track'}
                    </div>
                    <div style={{
                      fontSize: '12px', opacity: 0.5,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {track?.artist || 'Play something on Spotify'}
                    </div>
                  </div>

                  {!isPlaying && track && (
                    <span style={{ fontSize: '11px', opacity: 0.3, flexShrink: 0 }}>PAUSED</span>
                  )}
                </div>

                {/* Progress Bar */}
                {showProgressBar && track && mode === 'expanded' && (
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
                  opacity: mode === 'compact' ? 1 : 0,
                  pointerEvents: mode === 'compact' ? 'auto' : 'none',
                  transition: 'opacity 0.3s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  padding: '20px 16px',
                  zIndex: mode === 'compact' ? 1 : 0,
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
                  {track?.albumArtUrl ? (
                    <motion.img
                      layoutId="album-art"
                      key={track?.id || 'none'}
                      src={track.albumArtUrl}
                      alt={track?.album || 'Album Art'}
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
                    {track?.title || 'No track'}
                  </div>
                  <div style={{
                    fontSize: '12px', opacity: 0.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginTop: '2px'
                  }}>
                    {track?.artist || 'Play something on Spotify'}
                  </div>
                </div>

                {/* Single Line Lyric */}
                {mode === 'compact' && <CompactLyric />}

                {/* Progress Bar */}
                {showProgressBar && track && mode === 'compact' && (
                  <div style={{ width: '100%', flexShrink: 0 }}>
                    <ProgressBar />
                  </div>
                )}

                {!isPlaying && track && (
                  <span style={{ fontSize: '10px', opacity: 0.25, letterSpacing: '1px' }}>PAUSED</span>
                )}
              </div>
            </div>
          </>
        )}

        {/* Error toast */}
        {playerError && (
          <div style={{
            position: 'absolute', bottom: '16px', left: '16px', right: '16px',
            padding: '10px 14px', background: 'rgba(255,60,60,0.15)',
            border: '1px solid rgba(255,60,60,0.3)', borderRadius: '8px',
            fontSize: '12px', color: '#ff8888', zIndex: 300,
            backdropFilter: 'blur(12px)'
          }}>
            {playerError}
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
