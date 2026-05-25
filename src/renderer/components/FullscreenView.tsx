import React, { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LyricsDisplay } from './LyricsDisplay'
import { ProgressBar } from './ProgressBar'
import { QueuePreview } from './QueuePreview'
import { usePlayerStore } from '../stores/playerStore'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * FullscreenView — ambient display mode for large screens.
 *
 * Layout: album art (left) | lyrics (right), blurred album art background.
 * Features auto-hiding cursor and a floating exit button.
 */

interface FullscreenViewProps {
  onExit: () => void
  onSeek: (positionMs: number) => void
}

export const FullscreenView: React.FC<FullscreenViewProps> = ({ onExit, onSeek }) => {
  const track = usePlayerStore(s => s.track)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const showProgressBar = useSettingsStore(s => s.showProgressBar)

  const [showControls, setShowControls] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-hide cursor and controls after 3s of no mouse movement
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false)
    }, 3000)
  }, [])

  useEffect(() => {
    resetHideTimer()
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [resetHideTimer])

  useEffect(() => {
    const handleMouseMove = () => resetHideTimer()
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [resetHideTimer])

  // ESC to exit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onExit])

  return (
    <div
      ref={containerRef}
      className={`fullscreen-view ${showControls ? '' : 'cursor-hidden'}`}
    >
      {/* Split Layout */}
      <div className="fullscreen-layout">
        {/* Left: Album Art */}
        <div className="fullscreen-left">
          <AnimatePresence mode="wait">
            <motion.div
              key={track?.id || 'empty'}
              className="fullscreen-art-wrapper"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {track?.albumArtUrl ? (
                <img
                  className="fullscreen-art"
                  src={track.albumArtUrl}
                  alt={track.album}
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="fullscreen-art-placeholder">
                  <span>🎵</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Track Info below art */}
          <AnimatePresence mode="wait">
            <motion.div
              key={track?.id || 'empty-info'}
              className="fullscreen-track-info"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
            >
              <div className="fullscreen-title">
                {track?.title || 'No track'}
              </div>
              <div className="fullscreen-artist">
                {track?.artist || 'Play something on Spotify'}
              </div>
              {!isPlaying && track && (
                <div className="fullscreen-paused">PAUSED</div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Queue in fullscreen */}
          <QueuePreview />
        </div>

        {/* Right: Lyrics */}
        <div className="fullscreen-right">
          <LyricsDisplay onSeek={onSeek} />
        </div>
      </div>

      {/* Bottom: Progress Bar */}
      {showProgressBar && track && (
        <div className="fullscreen-progress">
          <ProgressBar />
        </div>
      )}

      {/* Exit Button — auto-hides */}
      <AnimatePresence>
        {showControls && (
          <motion.button
            className="fullscreen-exit-btn"
            onClick={onExit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            title="Exit Fullscreen (Esc)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
