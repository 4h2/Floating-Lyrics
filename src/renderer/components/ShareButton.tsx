import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayerStore } from '../stores/playerStore'
import { useLyricsStore } from '../stores/lyricsStore'
import { generateLyricCard } from '../services/ScreenshotService'

/**
 * ShareButton — generates and exports a premium lyric card.
 * Click: copy to clipboard. Right-click: save as file.
 */

export const ShareButton: React.FC = () => {
  const track = usePlayerStore(s => s.track)
  const currentLine = useLyricsStore(s => s.syncState?.currentLine?.text || '')
  const [status, setStatus] = useState<'idle' | 'generating' | 'copied' | 'saved'>('idle')

  const getThemeColors = useCallback(() => {
    const root = document.documentElement
    const style = getComputedStyle(root)
    return {
      glow: style.getPropertyValue('--glow').trim() || 'rgba(139, 92, 246, 0.5)',
      accent: style.getPropertyValue('--accent').trim() || '#8b5cf6',
    }
  }, [])

  const generate = useCallback(async () => {
    if (!track || !currentLine) return null

    setStatus('generating')
    const colors = getThemeColors()

    try {
      const dataUrl = await generateLyricCard({
        lyricText: currentLine,
        songTitle: track.title,
        artistName: track.artist,
        albumArtUrl: track.albumArtUrl,
        glowColor: colors.glow,
        accentColor: colors.accent,
      })
      return dataUrl
    } catch (e) {
      console.error('[Share] Failed to generate card:', e)
      setStatus('idle')
      return null
    }
  }, [track, currentLine, getThemeColors])

  const handleClick = useCallback(async () => {
    const dataUrl = await generate()
    if (!dataUrl) return

    const success = await window.electronAPI.clipboard.writeImage(dataUrl)
    if (success) {
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2000)
    } else {
      setStatus('idle')
    }
  }, [generate])

  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    const dataUrl = await generate()
    if (!dataUrl) return

    const songName = track?.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'lyric'
    const result = await window.electronAPI.dialog.saveFile(
      `${songName}_lyric.png`,
      dataUrl
    )
    if (result) {
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } else {
      setStatus('idle')
    }
  }, [generate, track])

  if (!track || !currentLine) return null

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <motion.button
        className="share-btn"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        title="Copy lyric card (right-click to save)"
        disabled={status === 'generating'}
      >
        {status === 'generating' ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
            </circle>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        )}
      </motion.button>

      {/* Toast */}
      <AnimatePresence>
        {(status === 'copied' || status === 'saved') && (
          <motion.div
            className="share-toast"
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            {status === 'copied' ? '✓ Copied!' : '✓ Saved!'}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
