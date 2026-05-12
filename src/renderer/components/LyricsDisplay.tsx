import React, { useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLyricsStore } from '../stores/lyricsStore'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * LyricsDisplay — The core visual component.
 * Renders synced lyrics with Apple Music-inspired animations:
 * - Current line: bright, scaled, with glow
 * - Past lines: faded, slightly smaller
 * - Future lines: dimmed
 * - Smooth scroll centering on current line
 */
export const LyricsDisplay: React.FC = () => {
  const { lyrics, status, syncState, errorMessage } = useLyricsStore()
  const fontSize = useSettingsStore(s => s.fontSize)
  const containerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Auto-scroll to current line
  const scrollToLine = useCallback((index: number) => {
    const el = lineRefs.current.get(index)
    if (el && containerRef.current) {
      const container = containerRef.current
      const elRect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const targetScroll = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height * 0.35
      container.scrollTo({ top: targetScroll, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    if (syncState && syncState.currentIndex >= 0) {
      scrollToLine(syncState.currentIndex)
    }
  }, [syncState?.currentIndex, scrollToLine])

  // ─── Loading State ─────────────────────────
  if (status === 'loading') {
    return (
      <div className="lyrics-loading">
        <div className="lyrics-loading-spinner" />
        <div className="lyrics-loading-text">Searching for lyrics...</div>
      </div>
    )
  }

  // ─── Error State ───────────────────────────
  if (status === 'error') {
    return (
      <div className="lyrics-state">
        <div className="lyrics-state-icon">⚠️</div>
        <div className="lyrics-state-title">Something went wrong</div>
        <div className="lyrics-state-subtitle">{errorMessage || 'Failed to load lyrics'}</div>
      </div>
    )
  }

  // ─── No Lyrics Available ──────────────────
  if (status === 'unavailable') {
    return (
      <div className="lyrics-state">
        <div className="lyrics-state-icon">🎵</div>
        <div className="lyrics-state-title">No lyrics available</div>
        <div className="lyrics-state-subtitle">
          Try adding a .lrc file to your local lyrics folder
        </div>
      </div>
    )
  }

  // ─── Plain Lyrics ─────────────────────────
  if (lyrics?.type === 'plain') {
    return (
      <div className="plain-lyrics" style={{ fontSize: fontSize * 0.7 }}>
        {lyrics.text}
      </div>
    )
  }

  // ─── Synced Lyrics ────────────────────────
  if (lyrics?.type === 'synced') {
    const currentIndex = syncState?.currentIndex ?? -1

    return (
      <div className="lyrics-container" ref={containerRef}>
        <div className="lyrics-spacer lyrics-spacer-top" />

        <AnimatePresence mode="sync">
          {lyrics.lines.map((line, i) => {
            const isCurrent = i === currentIndex
            const isPast = i < currentIndex
            const isFutureFar = i > currentIndex + 3

            let className = 'lyric-line'
            if (isCurrent) className += ' current'
            else if (isPast) className += ' past'
            else if (isFutureFar) className += ' future future-far'
            else className += ' future'

            return (
              <motion.div
                key={i}
                ref={el => { if (el) lineRefs.current.set(i, el) }}
                className={className}
                style={{ fontSize: isCurrent ? fontSize * 1.1 : fontSize }}
                layout
                transition={{
                  layout: { type: 'spring', stiffness: 120, damping: 22, mass: 0.8 },
                  opacity: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
                }}
              >
                {line.text}
              </motion.div>
            )
          })}
        </AnimatePresence>

        <div className="lyrics-spacer lyrics-spacer-bottom" />
      </div>
    )
  }

  // ─── Idle / Waiting ───────────────────────
  return (
    <div className="lyrics-state">
      <div className="lyrics-state-icon">🎧</div>
      <div className="lyrics-state-title">Waiting for music</div>
      <div className="lyrics-state-subtitle">Play something on Spotify to see lyrics</div>
    </div>
  )
}
