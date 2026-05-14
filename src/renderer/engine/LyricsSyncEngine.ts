// ─── Lyrics Sync Engine ──────────────────────────────────────────────────────
// Calculates which lyric line is current based on playback progress.
// Handles pause, seek, offset, and jitter smoothing. Runs at 60fps via rAF.
// Emits state only when values change meaningfully (smart diffing).

import type { SyncedLyrics, SyncedLyricsLine, LyricsSyncState } from '../types/lyrics'

export class LyricsSyncEngine {
  private lyrics: SyncedLyrics | null = null
  private offsetMs: number = 0
  private isPlaying: boolean = false
  private progressMs: number = 0
  private lastReceivedAt: number = 0
  private animFrameId: number | null = null

  // Smart diffing — only emit when state actually changes
  private lastEmittedIndex: number = -2 // -2 = never emitted
  private lastEmittedProgress: number = -1
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
    this.contextCacheIndex = Number.NEGATIVE_INFINITY
    this.contextCachePrevious = []
    this.contextCacheNext = []
    this.emitState(true)
  }

  /**
   * Update playback position from Spotify API poll
   */
  updateProgress(progressMs: number, isPlaying: boolean): void {
    this.progressMs = progressMs
    this.isPlaying = isPlaying
    this.lastReceivedAt = performance.now()

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
   * Interpolate current progress based on time elapsed since last API update.
   * This gives smooth 60fps progress between the 3-second Spotify API polls.
   */
  private getInterpolatedProgress(): number {
    if (!this.isPlaying) return this.progressMs

    const elapsed = performance.now() - this.lastReceivedAt
    return this.progressMs + elapsed
  }

  private emitState(force: boolean): void {
    if (!this.lyrics || !this.onStateChange) return

    const lines = this.lyrics.lines
    if (lines.length === 0) return

    const currentProgress = this.getInterpolatedProgress() + this.offsetMs
    const currentIndex = this.findCurrentLineIndex(lines, currentProgress)

    // Calculate line progress (0..1) for the breathing glow
    let lineProgress = 0
    if (currentIndex >= 0) {
      const currentLine = lines[currentIndex]
      const lineStart = currentLine.startTimeMs
      const lineEnd = currentLine.endTimeMs || (lines[currentIndex + 1]?.startTimeMs || lineStart + 3000)
      const lineDuration = lineEnd - lineStart
      if (lineDuration > 0) {
        lineProgress = Math.max(0, Math.min(1, (currentProgress - lineStart) / lineDuration))
      }
    }

    // Smart diffing: only emit if something changed meaningfully
    // Index changes are always emitted. Progress changes are batched (threshold 0.01 = ~1%)
    if (!force) {
      const indexChanged = currentIndex !== this.lastEmittedIndex
      const progressDelta = Math.abs(lineProgress - this.lastEmittedProgress)
      if (!indexChanged && progressDelta < 0.015) return
    }

    this.lastEmittedIndex = currentIndex
    this.lastEmittedProgress = lineProgress

    const currentLine = currentIndex >= 0 ? lines[currentIndex] : null

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
      isInterlude
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
