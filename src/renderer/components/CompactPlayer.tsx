import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import { useLyricsStore } from '../stores/lyricsStore'
import { useSettingsStore } from '../stores/settingsStore'
import { ProgressBar } from './ProgressBar'

/**
 * CompactPlayer — Minimalist "live redesign" view.
 * Big album artwork, current lyric in a single line, progress bar.
 */

interface CompactPlayerProps {
  onArtClick?: () => void
}

export const CompactPlayer: React.FC<CompactPlayerProps> = ({ onArtClick }) => {
  const track = usePlayerStore(s => s.track)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const syncState = useLyricsStore(s => s.syncState)
  const settings = useSettingsStore()

  const currentLine = syncState?.currentLine?.text || ''

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '20px 16px',
        overflow: 'hidden',
      }}
    >
      {/* Large Album Art — tap to shrink back to expanded */}
      <motion.div
        onClick={onArtClick}
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
        <AnimatePresence mode="sync">
          {track?.albumArtUrl ? (
            <motion.img
              layoutId="album-art"
              key={track?.id || 'none'}
              src={track.albumArtUrl}
              alt={track.album || 'Album Art'}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28, mass: 0.9 }}
              crossOrigin="anonymous"
            />
          ) : (
            <motion.span
              key="placeholder"
              style={{ fontSize: '48px', opacity: 0.3 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
            >
              🎵
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Track Info */}
      <div style={{ textAlign: 'center', width: '100%', minWidth: 0 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={track?.id || 'empty'}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.3 }}
          >
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {track?.title || 'No track'}
            </div>
            <div
              style={{
                fontSize: '12px',
                opacity: 0.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginTop: '2px',
              }}
            >
              {track?.artist || 'Play something on Spotify'}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Single Line Lyric — generous padding so glow isn't clipped */}
      <div
        style={{
          width: '100%',
          minHeight: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '12px 32px',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentLine || 'empty'}
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontSize: `${settings.fontSize * 0.75}px`,
              fontWeight: 700,
              lineHeight: 1.4,
              color: 'var(--text-primary)',
              textShadow: `0 0 ${20}px var(--glow), 0 0 ${50}px var(--glow)`,
            }}
          >
            {currentLine || (isPlaying ? '♪ · · ·' : 'Paused')}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress Bar */}
      {settings.showProgressBar && track && (
        <div style={{ width: '100%', flexShrink: 0 }}>
          <ProgressBar />
        </div>
      )}

      {!isPlaying && track && (
        <span style={{ fontSize: '10px', opacity: 0.25, letterSpacing: '1px' }}>PAUSED</span>
      )}
    </div>
  )
}
