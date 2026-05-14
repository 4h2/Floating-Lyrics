import React, { useRef, useEffect, useCallback } from 'react'
import { usePlayerStore } from '../stores/playerStore'

/**
 * ProgressBar — premium smooth interpolation without per-frame React renders.
 *
 * The bar width and current-time text are updated imperatively in rAF,
 * preserving 60fps smoothness while avoiding full component re-renders.
 */

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export const ProgressBar: React.FC = () => {
  const track = usePlayerStore(s => s.track)
  const isPlaying = usePlayerStore(s => s.isPlaying)
  const progressMs = usePlayerStore(s => s.progressMs)
  const receivedAt = usePlayerStore(s => s.receivedAt)

  const fillRef = useRef<HTMLDivElement>(null)
  const currentTimeRef = useRef<HTMLSpanElement>(null)
  const rafRef = useRef<number | null>(null)
  const lastRenderedSecondRef = useRef<number>(-1)

  const durationMs = track?.durationMs || 0
  const initialCurrentMs = Math.min(progressMs, durationMs)

  const tick = useCallback(() => {
    const fillEl = fillRef.current
    const timeEl = currentTimeRef.current

    if (!fillEl || !timeEl) return

    if (!track || durationMs <= 0) {
      fillEl.style.width = '0%'
      if (lastRenderedSecondRef.current !== 0) {
        timeEl.textContent = '0:00'
        lastRenderedSecondRef.current = 0
      }
      return
    }

    let currentMs = progressMs
    if (isPlaying && receivedAt > 0) {
      currentMs = progressMs + (performance.now() - receivedAt)
    }

    currentMs = Math.min(currentMs, durationMs)
    const pct = Math.min(1, Math.max(0, currentMs / durationMs))
    fillEl.style.width = `${pct * 100}%`

    const currentSecond = Math.floor(currentMs / 1000)
    if (currentSecond !== lastRenderedSecondRef.current) {
      timeEl.textContent = formatTime(currentMs)
      lastRenderedSecondRef.current = currentSecond
    }

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [track, durationMs, isPlaying, progressMs, receivedAt])

  useEffect(() => {
    lastRenderedSecondRef.current = -1
    tick()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [tick])

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-track">
        <div
          ref={fillRef}
          className="progress-bar-fill"
          style={{ width: `${Math.min(1, Math.max(0, durationMs > 0 ? initialCurrentMs / durationMs : 0)) * 100}%` }}
        />
      </div>
      <div className="progress-bar-times">
        <span ref={currentTimeRef} className="progress-bar-time">{formatTime(initialCurrentMs)}</span>
        <span className="progress-bar-time">{formatTime(durationMs)}</span>
      </div>
    </div>
  )
}
