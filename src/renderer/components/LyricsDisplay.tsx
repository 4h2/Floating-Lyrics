import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLyricsStore } from '../stores/lyricsStore'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * LyricsDisplay — Apple Music-inspired synced lyrics.
 *
 * Key animation techniques:
 * - Proximity-based visual weight (opacity/scale/blur gradient across lines)
 * - Custom spring scroll via rAF (no browser scrollTo)
 * - Per-line Framer Motion spring animations (not layout)
 * - Line-progress "breathing" glow on current line
 * - Multi-layered text-shadow for premium depth
 * - User scroll detection with sync button
 */

// ─── Spring Scroll Hook ──────────────────────────────────────────────────────
// Returns { scrollTo, isAnimating } — we need isAnimating to distinguish
// programmatic scrolls from user scrolls.

function useSpringScroll(containerRef: React.RefObject<HTMLDivElement | null>) {
  const targetRef = useRef(0)
  const currentRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const isAnimatingRef = useRef(false)

  const tick = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const diff = targetRef.current - currentRef.current

    if (Math.abs(diff) < 0.5) {
      currentRef.current = targetRef.current
      container.scrollTop = targetRef.current
      isAnimatingRef.current = false
      return
    }

    currentRef.current += diff * 0.065
    container.scrollTop = currentRef.current
    rafRef.current = requestAnimationFrame(tick)
  }, [containerRef])

  const scrollTo = useCallback((target: number) => {
    targetRef.current = Math.max(0, target)
    if (!isAnimatingRef.current) {
      const container = containerRef.current
      if (container) currentRef.current = container.scrollTop
      isAnimatingRef.current = true
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [containerRef, tick])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return { scrollTo, isAnimating: isAnimatingRef }
}

// ─── Visual Weight Calculation ───────────────────────────────────────────────

interface LineVisuals {
  opacity: number
  scale: number
  blur: number
  glowIntensity: number
  y: number
}

function computeLineVisuals(
  index: number,
  currentIndex: number,
  lineProgress: number,
): LineVisuals {
  if (currentIndex < 0) {
    return { opacity: 0.3, scale: 0.95, blur: 0, glowIntensity: 0, y: 0 }
  }

  const distance = index - currentIndex
  const absDistance = Math.abs(distance)

  if (absDistance === 0) {
    const breathCurve = Math.sin(lineProgress * Math.PI * 0.85)
    return {
      opacity: 1,
      // Scale is the ONLY size change — no fontSize change = no text reflow
      scale: 1.05,
      blur: 0,
      glowIntensity: 0.6 + breathCurve * 0.4,
      y: 0,
    }
  }

  const falloff = Math.exp(-absDistance * 0.55)
  const pastBias = distance < 0 ? 0.85 : 1.0

  return {
    opacity: Math.max(0.08, falloff * 0.55 * pastBias),
    scale: Math.max(0.92, 1.0 - absDistance * 0.015),
    blur: Math.min(1.5, absDistance * 0.25),
    glowIntensity: 0,
    y: distance < 0 ? -absDistance * 0.5 : absDistance * 0.3,
  }
}

// ─── Spring Configs ──────────────────────────────────────────────────────────

const lineSpring = {
  type: 'spring' as const,
  stiffness: 80,
  damping: 20,
  mass: 1.2,
  restDelta: 0.001,
}

const opacitySpring = {
  type: 'spring' as const,
  stiffness: 100,
  damping: 24,
  mass: 0.8,
}

// ─── Glow Renderer ──────────────────────────────────────────────────────────

function buildGlowShadow(intensity: number, color: string): string {
  if (intensity <= 0.01) return 'none'
  const i = intensity
  return [
    `0 0 ${8 * i}px ${color}`,
    `0 0 ${25 * i}px ${color}`,
    `0 0 ${60 * i}px ${color}`,
    `0 0 ${100 * i}px ${color}`,
  ].join(', ')
}

// ─── Lyric Line Component ───────────────────────────────────────────────────

interface LyricLineProps {
  text: string
  index: number
  currentIndex: number
  lineProgress: number
  fontSize: number
  glowColor: string
}

const LyricLine = React.memo<LyricLineProps>(({
  text,
  index,
  currentIndex,
  lineProgress,
  fontSize,
  glowColor,
}) => {
  const v = computeLineVisuals(index, currentIndex, lineProgress)
  const isCurrent = index === currentIndex

  return (
    <motion.div
      className={`lyric-line ${isCurrent ? 'lyric-line-active' : ''}`}
      animate={{
        opacity: v.opacity,
        scale: v.scale,
        y: v.y,
        filter: v.blur > 0.01 ? `blur(${v.blur}px)` : 'blur(0px)',
      }}
      transition={{
        opacity: opacitySpring,
        scale: lineSpring,
        y: lineSpring,
        filter: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
      }}
      style={{
        // FIXED: fontSize is CONSTANT for all lines — no reflow!
        // The active line uses transform: scale() for emphasis instead.
        fontSize,
        fontWeight: 700,
        textShadow: buildGlowShadow(v.glowIntensity, glowColor),
        willChange: isCurrent ? 'transform, opacity, filter' : 'auto',
      }}
    >
      {text}
    </motion.div>
  )
})

LyricLine.displayName = 'LyricLine'

// ─── Main Component ─────────────────────────────────────────────────────────

export const LyricsDisplay: React.FC = () => {
  const { lyrics, status, syncState, errorMessage } = useLyricsStore()
  const fontSize = useSettingsStore(s => s.fontSize)
  const containerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const { scrollTo: springScrollTo, isAnimating } = useSpringScroll(containerRef)
  const prevLyricsRef = useRef<unknown>(null)

  // ─── User Scroll Detection ─────────────────────────────────────────
  // When the user scrolls manually (not our spring scroll), pause auto-scroll
  // and show a "sync" button.
  const [userScrolled, setUserScrolled] = useState(false)
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleScroll = useCallback(() => {
    // If our spring animation is driving the scroll, ignore
    if (isAnimating.current) return

    setUserScrolled(true)

    // Auto-resume after 5 seconds of no scrolling
    if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current)
    userScrollTimeout.current = setTimeout(() => {
      setUserScrolled(false)
    }, 5000)
  }, [isAnimating])

  const handleSyncClick = useCallback(() => {
    setUserScrolled(false)
    if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current)
    // Immediately scroll to current line
    if (syncState && syncState.currentIndex >= 0) {
      scrollToLine(syncState.currentIndex)
    }
  }, [syncState?.currentIndex])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current)
    }
  }, [])

  // Read CSS glow color from theme
  const glowColor = useMemo(() => {
    const root = document.documentElement
    return getComputedStyle(root).getPropertyValue('--glow').trim() || 'rgba(255, 255, 255, 0.3)'
  }, [syncState?.currentIndex])

  // ─── Reset scroll to top on new song ───────────────────────────────
  useEffect(() => {
    if (lyrics && lyrics !== prevLyricsRef.current) {
      prevLyricsRef.current = lyrics
      if (containerRef.current) {
        containerRef.current.scrollTop = 0
      }
      lineRefs.current.clear()
      setUserScrolled(false)
    }
  }, [lyrics])

  // ─── Spring Scroll to Current Line ─────────────────────────────────
  const scrollToLine = useCallback((index: number) => {
    const el = lineRefs.current.get(index)
    if (el && containerRef.current) {
      const container = containerRef.current
      const elRect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      // Position the current line at ~38% from the top (slightly above center)
      const target = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height * 0.38
      springScrollTo(target)
    }
  }, [springScrollTo])

  // Auto-scroll to current line (only if user hasn't scrolled away)
  useEffect(() => {
    if (syncState && syncState.currentIndex >= 0 && !userScrolled) {
      scrollToLine(syncState.currentIndex)
    }
  }, [syncState?.currentIndex, scrollToLine, userScrolled])

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
    const lineProgress = syncState?.lineProgress ?? 0

    return (
      <div className="lyrics-wrapper">
        <div
          className="lyrics-container"
          ref={containerRef}
          onScroll={handleScroll}
        >
          <div className="lyrics-spacer lyrics-spacer-top" />

          {lyrics.lines.map((line, i) => (
            <div
              key={i}
              ref={el => { if (el) lineRefs.current.set(i, el) }}
            >
              <LyricLine
                text={line.text}
                index={i}
                currentIndex={currentIndex}
                lineProgress={lineProgress}
                fontSize={fontSize}
                glowColor={glowColor}
              />
            </div>
          ))}

          <div className="lyrics-spacer lyrics-spacer-bottom" />
        </div>

        {/* Sync Button — appears when user scrolls away */}
        <AnimatePresence>
          {userScrolled && currentIndex >= 0 && (
            <motion.button
              className="lyrics-sync-btn"
              onClick={handleSyncClick}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="7 13 12 18 17 13" />
                <line x1="12" y1="2" x2="12" y2="18" />
              </svg>
              Sync
            </motion.button>
          )}
        </AnimatePresence>
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
