import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import { useLyricsStore } from '../stores/lyricsStore'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * CompactLyric — single-line current lyric for the compact view.
 * Uses AnimatePresence for smooth text transitions.
 */

export const CompactLyric: React.FC = () => {
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const currentLine = useLyricsStore(s => s.syncState?.currentLine?.text || '')
  const fontSize = useSettingsStore(s => s.fontSize)

  return (
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
          key={currentLine || `state-${isPlaying ? 'playing' : 'paused'}`}
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontSize: `${fontSize * 0.75}px`,
            fontWeight: 700,
            lineHeight: 1.4,
            color: 'var(--text-primary)',
            textShadow: `0 0 20px var(--glow), 0 0 50px var(--glow)`,
          }}
        >
          {currentLine || (isPlaying ? '♪ · · ·' : 'Paused')}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
