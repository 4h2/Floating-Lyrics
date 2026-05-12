import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'

export const AlbumArt: React.FC = () => {
  const track = usePlayerStore(s => s.track)
  const artUrl = track?.albumArtUrl

  return (
    <div className="album-art-wrapper">
      <AnimatePresence mode="wait">
        {artUrl ? (
          <motion.img
            key={artUrl}
            src={artUrl}
            alt={track?.album || 'Album Art'}
            className="album-art-image"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            crossOrigin="anonymous"
          />
        ) : (
          <motion.div
            key="placeholder"
            className="album-art-placeholder"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            🎵
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const TrackInfo: React.FC = () => {
  const track = usePlayerStore(s => s.track)

  if (!track) return null

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={track.id}
        className="track-info"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="track-title text-truncate">{track.title}</div>
        <div className="track-artist text-truncate">{track.artist}</div>
      </motion.div>
    </AnimatePresence>
  )
}
