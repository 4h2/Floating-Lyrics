import React, { useRef, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
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
 */

// ─── Spring Scroll Hook ──────────────────────────────────────────────────────
// Replaces browser scrollTo with smooth exponential ease-out scrolling.

function useSpringScroll(containerRef: React.RefObject<HTMLDivElement | null>) {
  const targetRef = useRef(0)
  const currentRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const isAnimatingRef = useRef(false)

  const tick = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const diff = targetRef.current - currentRef.current

    // Spring-like interpolation — lower factor = smoother/slower
    // 0.065 gives a nice heavy, organic feel
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

  return scrollTo
}

// ─── Visual Weight Calculation ───────────────────────────────────────────────
// Compute per-line appearance based on distance from current line.
// Creates the Apple Music "gradient of focus" effect.

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
  totalLines: number
): LineVisuals {
  if (currentIndex < 0) {
    // No active line — all lines dim
    return { opacity: 0.3, scale: 0.95, blur: 0, glowIntensity: 0, y: 0 }
  }

  const distance = index - currentIndex
  const absDistance = Math.abs(distance)

  if (absDistance === 0) {
    // ── CURRENT LINE ──
    // Glow breathes with line progress (peaks at ~60%, fades toward end)
    const breathCurve = Math.sin(lineProgress * Math.PI * 0.85)
    return {
      opacity: 1,
      scale: 1.0,
      blur: 0,
      glowIntensity: 0.6 + breathCurve * 0.4, // 0.6 → 1.0 → 0.6
      y: 0,
    }
  }

  // ── NEARBY LINES (graduated falloff) ──
  // Smooth exponential decay — not linear!
  const falloff = Math.exp(-absDistance * 0.55)

  // Past lines fade more than future lines (Apple Music pattern)
  const pastBias = distance < 0 ? 0.85 : 1.0

  const opacity = Math.max(0.08, falloff * 0.55 * pastBias)
  const scale = Math.max(0.92, 1.0 - absDistance * 0.015)
  const blur = Math.min(1.5, absDistance * 0.25)

  // Subtle vertical offset — lines "push away" from current
  const y = distance < 0 ? -absDistance * 0.5 : absDistance * 0.3

  return {
    opacity,
    scale,
    blur,
    glowIntensity: 0,
    y,
  }
}

// ─── Spring Configs ──────────────────────────────────────────────────────────

// Organic, heavy spring — feels like the text has weight
const lineSpring = {
  type: 'spring' as const,
  stiffness: 80,
  damping: 20,
  mass: 1.2,
  restDelta: 0.001,
}

// Faster spring for opacity (so glow appears before movement finishes)
const opacitySpring = {
  type: 'spring' as const,
  stiffness: 100,
  damping: 24,
  mass: 0.8,
}

// Very soft spring for glow (slow bloom/fade)
const glowSpring = {
  type: 'spring' as const,
  stiffness: 50,
  damping: 18,
  mass: 1.5,
}

// ─── Glow Renderer ──────────────────────────────────────────────────────────
// Multi-layered text-shadow for premium Apple Music depth.

function buildGlowShadow(intensity: number, color: string): string {
  if (intensity <= 0.01) return 'none'

  const i = intensity
  return [
    // Inner glow — tight, bright
    `0 0 ${8 * i}px ${color}`,
    // Mid glow — softer spread
    `0 0 ${25 * i}px ${color}`,
    // Outer glow — wide, atmospheric
    `0 0 ${60 * i}px ${color}`,
    // Extra halo for that premium "bloom"
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
  totalLines: number
  glowColor: string
}

const LyricLine = React.memo<LyricLineProps>(({
  text,
  index,
  currentIndex,
  lineProgress,
  fontSize,
  totalLines,
  glowColor,
}) => {
  const v = computeLineVisuals(index, currentIndex, lineProgress, totalLines)
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
        fontSize: isCurrent ? fontSize * 1.08 : fontSize,
        fontWeight: isCurrent ? 800 : 600,
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
  const springScroll = useSpringScroll(containerRef)

  // Read CSS glow color from theme
  const glowColor = useMemo(() => {
    const root = document.documentElement
    return getComputedStyle(root).getPropertyValue('--glow').trim() || 'rgba(255, 255, 255, 0.3)'
  }, [syncState?.currentIndex])

  // ─── Spring Scroll to Current Line ─────────────────────────────────
  const scrollToLine = useCallback((index: number) => {
    const el = lineRefs.current.get(index)
    if (el && containerRef.current) {
      const container = containerRef.current
      const elRect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      // Target: position the current line at ~35% from the top
      const target = container.scrollTop + (elRect.top - containerRect.top) - containerRect.height * 0.35
      springScroll(target)
    }
  }, [springScroll])

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
    const lineProgress = syncState?.lineProgress ?? 0

    return (
      <div className="lyrics-container" ref={containerRef}>
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
              totalLines={lyrics.lines.length}
              glowColor={glowColor}
            />
          </div>
        ))}

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
