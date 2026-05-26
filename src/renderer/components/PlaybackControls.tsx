import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'

/**
 * PlaybackControls — prev · play/pause · next
 *
 * Design canon: same ghost/transparent language as .titlebar-btn.
 * Play/pause is the focal point — slightly larger, accent glow on hover.
 * Prev/next are quieter, matching the secondary text weight of the app.
 */

interface PlaybackControlsProps {
  onPlayPause: () => void
  onNext: () => void
  onPrev: () => void
}

// ─── SVG Icons ─────────────────────────────────────────────────────────────

const IconPrev = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="3" height="16" rx="1.5" />
    <path d="M20 4.8 9.6 12 20 19.2V4.8z" />
  </svg>
)

const IconNext = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <rect x="17" y="4" width="3" height="16" rx="1.5" />
    <path d="M4 19.2 14.4 12 4 4.8v14.4z" />
  </svg>
)

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 4.8 19.2 12 6 19.2V4.8z" />
  </svg>
)

const IconPause = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="4" width="4.5" height="16" rx="1.5" />
    <rect x="14.5" y="4" width="4.5" height="16" rx="1.5" />
  </svg>
)

// ─── Component ──────────────────────────────────────────────────────────────

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
        className="playback-btn playback-btn-side"
        onClick={onPrev}
        whileTap={{ scale: 0.82 }}
        title="Previous"
      >
        <IconPrev />
      </motion.button>

      {/* Play / Pause — focal element */}
      <motion.button
        className="playback-btn playback-btn-primary"
        onClick={onPlayPause}
        whileTap={{ scale: 0.88 }}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isPlaying ? 'pause' : 'play'}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {isPlaying ? <IconPause /> : <IconPlay />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* Next */}
      <motion.button
        className="playback-btn playback-btn-side"
        onClick={onNext}
        whileTap={{ scale: 0.82 }}
        title="Next"
      >
        <IconNext />
      </motion.button>
    </div>
  )
}
