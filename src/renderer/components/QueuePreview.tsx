import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'

/**
 * QueuePreview — shows the next 1-3 tracks from Spotify queue.
 * Collapsed by default with a subtle "Up Next" label. Expands on click.
 */

export const QueuePreview: React.FC = () => {
  const queue = usePlayerStore(s => s.queue)
  const [expanded, setExpanded] = useState(false)

  if (!queue || queue.length === 0) return null

  return (
    <div className="queue-preview">
      <button
        className="queue-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="queue-label">Up Next</span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: 'inline-flex', fontSize: '10px', opacity: 0.4 }}
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            className="queue-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {queue.map((track, i) => (
              <div key={track.id + i} className="queue-item">
                <div className="queue-item-art">
                  {track.albumArtUrlSmall || track.albumArtUrl ? (
                    <img
                      src={track.albumArtUrlSmall || track.albumArtUrl!}
                      alt=""
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <span>🎵</span>
                  )}
                </div>
                <div className="queue-item-info">
                  <div className="queue-item-title">{track.title}</div>
                  <div className="queue-item-artist">{track.artist}</div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
