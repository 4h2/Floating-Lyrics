import React, { useRef, useEffect, useState, useCallback } from 'react'
import { usePlayerStore } from '../stores/playerStore'

/**
 * ProgressBar — 60fps-interpolated song progress indicator.
 *
 * Reads the last known progress + timestamp from the player store,
 * then uses requestAnimationFrame to smoothly interpolate between
 * Spotify API polls (every 3 seconds). This gives a perfectly fluid
 * progress bar despite infrequent API updates.
 */

export const ProgressBar: React.FC = () => {
  const { track, isPlaying, progressMs, receivedAt } = usePlayerStore()
  const [progress, setProgress] = useState(0)
  const rafRef = useRef<number | null>(null)

  const tick = useCallback(() => {
    if (!track) {
      setProgress(0)
      return
    }

    const durationMs = track.durationMs
    if (durationMs <= 0) {
      setProgress(0)
      return
    }

    let currentMs = progressMs
    if (isPlaying && receivedAt > 0) {
      // Interpolate: add elapsed time since last API update
      const elapsed = performance.now() - receivedAt
      currentMs = progressMs + elapsed
    }

    const pct = Math.min(1, Math.max(0, currentMs / durationMs))
    setProgress(pct)

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [track, isPlaying, progressMs, receivedAt])

  useEffect(() => {
    // Start the interpolation loop
    tick()

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [tick])

  // Format time as M:SS
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const durationMs = track?.durationMs || 0
  let currentMs = progressMs
  if (isPlaying && receivedAt > 0) {
    currentMs = progressMs + (performance.now() - receivedAt)
  }
  currentMs = Math.min(currentMs, durationMs)

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-track">
        <div
          className="progress-bar-fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="progress-bar-times">
        <span className="progress-bar-time">{formatTime(currentMs)}</span>
        <span className="progress-bar-time">{formatTime(durationMs)}</span>
      </div>
    </div>
  )
}
