// ─── Lyrics Sync Engine ──────────────────────────────────────────────────────
// Calculates which lyric line is current based on playback progress.
// Handles pause, seek, offset, and jitter smoothing. Runs at 60fps via rAF.
// Emits state only when values change meaningfully (smart diffing).

import type { SyncedLyrics, SyncedLyricsLine, LyricsSyncState } from '../types/lyrics'

// ─── Clock controller tuning ─────────────────────────────────────────────────
// The played position comes from one source: the Spotify poll (progress_ms +
// receivedAt), which jitters by the network latency of each request. Instead of
// snapping the clock to every poll (precise but stutters word-fills) or ignoring
// late polls (smooth but drifts), we run a tiny rate-locked controller (mini-PLL):
// the displayed position stays continuous and we only nudge its *speed* within an
// imperceptible margin to converge on the reported position.

/** Position error (ms) above which we treat the poll as a seek / track change and snap. */
const HARD_SNAP_MS = 1000
/** Convergence window (ms) — error is absorbed over roughly this span (~1 poll interval). */
const CORRECTION_WINDOW_MS = 3000
/** Max deviation from 1.0× playback speed while correcting (±5% is invisible in the fill). */
const MAX_RATE_ADJUST = 0.05

export class LyricsSyncEngine {
  private lyrics: SyncedLyrics | null = null
  private offsetMs: number = 0
  private isPlaying: boolean = false
  private animFrameId: number | null = null

  // ─── Rate-locked playback clock ──────────────────────────────────────
  // predicted(now) = anchorProgress + (now - anchorTime) * rate
  private anchorProgress: number = 0
  private anchorTime: number = 0
  private rate: number = 1
  private clockInitialized: boolean = false

  // Smart diffing — only emit when state actually changes
  private lastEmittedIndex: number = -2 // -2 = never emitted
  private lastEmittedProgress: number = -1
  private lastEmittedWordIndex: number = -2
  private lastEmittedWordProgress: number = -1
  private contextCacheIndex: number = Number.NEGATIVE_INFINITY
  private contextCachePrevious: SyncedLyricsLine[] = []
  private contextCacheNext: SyncedLyricsLine[] = []

  public onStateChange: ((state: LyricsSyncState) => void) | null = null

  /**
   * Load new lyrics data. Resets sync state.
   */
  setLyrics(lyrics: SyncedLyrics | null): void {
    this.lyrics = lyrics
    this.lastEmittedIndex = -2
    this.lastEmittedProgress = -1
    this.lastEmittedWordIndex = -2
    this.lastEmittedWordProgress = -1
    this.contextCacheIndex = Number.NEGATIVE_INFINITY
    this.contextCachePrevious = []
    this.contextCacheNext = []
    // New track → re-snap the clock to the next poll instead of correcting toward it.
    this.clockInitialized = false
    this.emitState(true)
  }

  /**
   * Update playback position from a Spotify API poll.
   *
   * Drives the rate-locked clock controller. Rather than snapping to every poll
   * (which makes word-fills stutter as the network latency jitters the reported
   * position), we keep the displayed position continuous and only adjust the
   * clock's speed within ±MAX_RATE_ADJUST to converge on the reported value.
   * Large errors (seeks, track changes) and play-state transitions snap directly.
   */
  updateProgress(reportedMs: number, isPlaying: boolean): void {
    const now = performance.now()
    const wasPlaying = this.isPlaying
    this.isPlaying = isPlaying

    const continuousPlayback = isPlaying && wasPlaying && this.clockInitialized
    const error = continuousPlayback ? reportedMs - this.predictedProgress(now) : 0

    if (!continuousPlayback || Math.abs(error) > HARD_SNAP_MS) {
      // Hard snap: first poll, pause↔play, paused, seek, or track change.
      this.anchorProgress = reportedMs
      this.anchorTime = now
      this.rate = 1
      this.clockInitialized = true
    } else {
      // Soft correction: re-anchor at the *predicted* position (no jump → C0
      // continuity) and absorb the small error by nudging the clock speed.
      this.anchorProgress = this.predictedProgress(now)
      this.anchorTime = now
      const adjust = Math.max(-MAX_RATE_ADJUST, Math.min(MAX_RATE_ADJUST, error / CORRECTION_WINDOW_MS))
      this.rate = 1 + adjust
    }

    if (isPlaying && !this.animFrameId) {
      this.startLoop()
    } else if (!isPlaying) {
      this.stopLoop()
      this.emitState(true) // Force emit on pause
    }
  }

  /**
   * Set user-configurable offset in milliseconds
   */
  setOffset(ms: number): void {
    this.offsetMs = ms
    this.emitState(true) // Force re-emit with new offset
  }

  /**
   * Clean up animation loop
   */
  destroy(): void {
    this.stopLoop()
    this.lyrics = null
  }

  // ─── Internal ────────────────────────────────────────────────────────

  private startLoop(): void {
    if (this.animFrameId) return
    const tick = () => {
      this.emitState(false)
      this.animFrameId = requestAnimationFrame(tick)
    }
    this.animFrameId = requestAnimationFrame(tick)
  }

  private stopLoop(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
  }

  /**
   * Current playback position from the rate-locked clock.
   * Smooth 60fps progress between Spotify polls; while paused it stays frozen at
   * the anchor. The controller in updateProgress keeps this converged on reality.
   */
  private getInterpolatedProgress(): number {
    if (!this.isPlaying) return this.anchorProgress
    return this.predictedProgress(performance.now())
  }

  /** Predicted position (ms) at time `now` (performance.now): anchor + elapsed × rate. */
  private predictedProgress(now: number): number {
    return this.anchorProgress + (now - this.anchorTime) * this.rate
  }

  private emitState(force: boolean): void {
    if (!this.lyrics || !this.onStateChange) return

    const lines = this.lyrics.lines
    if (lines.length === 0) return

    const currentProgress = this.getInterpolatedProgress() + this.offsetMs
    const currentIndex = this.findCurrentLineIndex(lines, currentProgress)
    const currentLine = currentIndex >= 0 ? lines[currentIndex] : null

    // Calculate line progress (0..1) for the breathing glow
    let lineProgress = 0
    if (currentLine) {
      const lineStart = currentLine.startTimeMs
      const lineEnd = currentLine.endTimeMs || (lines[currentIndex + 1]?.startTimeMs || lineStart + 3000)
      const lineDuration = lineEnd - lineStart
      if (lineDuration > 0) {
        lineProgress = Math.max(0, Math.min(1, (currentProgress - lineStart) / lineDuration))
      }
    }

    // ─── Word-level karaoke timing ──────────────────────────────────
    // Computed before the diff gate so word changes can drive emission on long
    // lines (where lineProgress barely moves between frames).
    let activeWordIndex = -1
    let wordProgress = 0

    if (currentLine?.words && currentLine.words.length > 0) {
      const lineStart = currentLine.startTimeMs
      const elapsedInLine = currentProgress - lineStart // ms since line started

      // Find which word we're on (binary search would be overkill for ~10 words)
      for (let i = currentLine.words.length - 1; i >= 0; i--) {
        if (elapsedInLine >= currentLine.words[i].offsetMs) {
          activeWordIndex = i
          // Calculate progress within this word (0..1)
          const wordStart = currentLine.words[i].offsetMs
          const wordEnd = i < currentLine.words.length - 1
            ? currentLine.words[i + 1].offsetMs
            : (currentLine.endTimeMs ? currentLine.endTimeMs - lineStart : wordStart + 500)
          const wordDuration = wordEnd - wordStart
          if (wordDuration > 0) {
            wordProgress = Math.max(0, Math.min(1, (elapsedInLine - wordStart) / wordDuration))
          }
          break
        }
      }
    }

    // Smart diffing: only emit if something changed meaningfully.
    // Keep a very small progress threshold so long lyric lines still feel
    // continuously animated instead of stepping. Word state is included so the
    // karaoke fill keeps advancing even when lineProgress is nearly static.
    if (!force) {
      const indexChanged = currentIndex !== this.lastEmittedIndex
      const progressDelta = Math.abs(lineProgress - this.lastEmittedProgress)
      const wordIndexChanged = activeWordIndex !== this.lastEmittedWordIndex
      const wordProgressDelta = Math.abs(wordProgress - this.lastEmittedWordProgress)
      if (!indexChanged && !wordIndexChanged && progressDelta < 0.001 && wordProgressDelta < 0.001) return
    }

    this.lastEmittedIndex = currentIndex
    this.lastEmittedProgress = lineProgress
    this.lastEmittedWordIndex = activeWordIndex
    this.lastEmittedWordProgress = wordProgress

    // Detect instrumental interludes (gap > 8s between current line end and next line start)
    let isInterlude = false
    if (currentIndex >= 0 && currentIndex < lines.length - 1) {
      const lineEnd = lines[currentIndex].endTimeMs || lines[currentIndex + 1]?.startTimeMs
      const nextStart = lines[currentIndex + 1]?.startTimeMs
      if (lineEnd && nextStart) {
        const gap = nextStart - lineEnd
        // Only flag as interlude if we're past the current line's text (lineProgress > 0.9)
        // AND the gap is > 8 seconds
        isInterlude = gap > 8000 && lineProgress > 0.9
      }
    }

    // Context slices are only recomputed when the active index changes.
    // During line-progress updates we reuse stable array references to reduce churn/GC.
    if (currentIndex !== this.contextCacheIndex) {
      this.contextCacheIndex = currentIndex
      this.contextCachePrevious = currentIndex > 0
        ? lines.slice(Math.max(0, currentIndex - 4), currentIndex).reverse()
        : []
      this.contextCacheNext = currentIndex >= 0
        ? lines.slice(currentIndex + 1, currentIndex + 6)
        : lines.slice(0, 5)
    }

    this.onStateChange({
      currentIndex,
      previousLines: this.contextCachePrevious,
      currentLine,
      nextLines: this.contextCacheNext,
      lineProgress,
      isInterlude,
      activeWordIndex,
      wordProgress,
    })
  }

  /**
   * Binary search for the current line index.
   * Returns the index of the line whose startTime <= currentProgress.
   */
  private findCurrentLineIndex(lines: SyncedLyricsLine[], progressMs: number): number {
    if (progressMs < lines[0].startTimeMs) return -1

    let low = 0
    let high = lines.length - 1
    let result = -1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (lines[mid].startTimeMs <= progressMs) {
        result = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    return result
  }
}
