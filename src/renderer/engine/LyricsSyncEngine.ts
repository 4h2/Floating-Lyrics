// ─── Lyrics Sync Engine ──────────────────────────────────────────────────────
// Calculates which lyric line is current based on playback progress.
// Handles pause, seek, offset, and jitter smoothing. Runs at 60fps via rAF.

import type { SyncedLyrics, SyncedLyricsLine, LyricsSyncState } from '../types/lyrics'

export class LyricsSyncEngine {
  private lyrics: SyncedLyrics | null = null
  private offsetMs: number = 0
  private isPlaying: boolean = false
  private progressMs: number = 0
  private lastReceivedAt: number = 0 // performance.now() when last progress was received
  private animFrameId: number | null = null

  public onStateChange: ((state: LyricsSyncState) => void) | null = null

  /**
   * Load new lyrics data. Resets sync state.
   */
  setLyrics(lyrics: SyncedLyrics | null): void {
    this.lyrics = lyrics
    this.emitState()
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
      this.emitState()
    }
  }

  /**
   * Set user-configurable offset in milliseconds
   */
  setOffset(ms: number): void {
    this.offsetMs = ms
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
      this.emitState()
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

  private emitState(): void {
    if (!this.lyrics || !this.onStateChange) return

    const lines = this.lyrics.lines
    if (lines.length === 0) return

    const currentProgress = this.getInterpolatedProgress() + this.offsetMs
    const currentIndex = this.findCurrentLineIndex(lines, currentProgress)

    const currentLine = currentIndex >= 0 ? lines[currentIndex] : null

    // Calculate line progress (0..1)
    let lineProgress = 0
    if (currentLine) {
      const lineStart = currentLine.startTimeMs
      const lineEnd = currentLine.endTimeMs || (lines[currentIndex + 1]?.startTimeMs || lineStart + 3000)
      const lineDuration = lineEnd - lineStart
      if (lineDuration > 0) {
        lineProgress = Math.max(0, Math.min(1, (currentProgress - lineStart) / lineDuration))
      }
    }

    // Gather context lines
    const previousLines = currentIndex > 0
      ? lines.slice(Math.max(0, currentIndex - 4), currentIndex).reverse()
      : []
    const nextLines = currentIndex >= 0
      ? lines.slice(currentIndex + 1, currentIndex + 6)
      : lines.slice(0, 5)

    this.onStateChange({
      currentIndex,
      previousLines,
      currentLine,
      nextLines,
      lineProgress
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
