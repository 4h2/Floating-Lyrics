import React, { useCallback } from 'react'
import { motion } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'

/**
 * PlaybackControls — prev, play/pause, next buttons.
 *
 * Uses optimistic updates: immediately reflects the action in the UI
 * (e.g. sets isPlaying to false on pause) before the Spotify API responds.
 */

interface PlaybackControlsProps {
  onPlayPause: () => void
  onNext: () => void
  onPrev: () => void
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  onPlayPause,
  onNext,
  onPrev,
}) => {
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const track = usePlayerStore(s => s.track)

  if (!track) return null

  return (
    <div className="playback-controls">
      {/* Previous */}
      <motion.button
        className="playback-btn"
        onClick={onPrev}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.85 }}
        title="Previous"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
        </svg>
      </motion.button>

      {/* Play/Pause */}
      <motion.button
        className="playback-btn playback-btn-main"
        onClick={onPlayPause}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.88 }}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </motion.button>

      {/* Next */}
      <motion.button
        className="playback-btn"
        onClick={onNext}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.85 }}
        title="Next"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6z" transform="scale(-1,1) translate(-24,0)" />
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </motion.button>
    </div>
  )
}
