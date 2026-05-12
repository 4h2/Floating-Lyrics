// ─── Local LRC Provider ──────────────────────────────────────────────────────
// Reads synced lyrics from local .lrc files. Serves as the most reliable
// fallback — works offline, no API calls, no rate limits.

import type { LyricsProvider, TrackQuery, Lyrics, SyncedLyricsLine } from '../types/lyrics'

export class LocalLrcProvider implements LyricsProvider {
  readonly name = 'LocalLrcProvider'
  private folderPath: string = ''

  constructor(folderPath?: string) {
    this.folderPath = folderPath || ''
  }

  setFolderPath(path: string): void {
    this.folderPath = path
  }

  isEnabled(): boolean {
    return this.folderPath.length > 0
  }

  async search(query: TrackQuery): Promise<Lyrics | null> {
    if (!this.folderPath) return null

    try {
      // Try different filename patterns
      const patterns = [
        `${query.artist} - ${query.title}.lrc`,
        `${query.title} - ${query.artist}.lrc`,
        `${query.title}.lrc`,
        `${query.artist} - ${query.title}`.replace(/[<>:"/\\|?*]/g, '_') + '.lrc',
      ]

      for (const filename of patterns) {
        const content = await this.readFile(filename)
        if (content) {
          const lines = this.parseLrc(content)
          if (lines.length > 0) {
            return {
              type: 'synced',
              trackTitle: query.title,
              artistName: query.artist,
              albumName: query.album,
              durationMs: query.durationMs,
              lines
            }
          }
        }
      }
    } catch (e) {
      console.error(`[${this.name}] Error:`, e)
    }

    return null
  }

  private async readFile(filename: string): Promise<string | null> {
    try {
      // Use fetch with file:// protocol in renderer context
      const path = `${this.folderPath}/${filename}`.replace(/\\/g, '/')
      const response = await fetch(`file:///${path}`)
      if (response.ok) {
        return await response.text()
      }
    } catch {
      // File not found — this is expected, not an error
    }
    return null
  }

  /**
   * Parses standard LRC format timestamps like [mm:ss.xx] or [mm:ss.xxx]
   */
  private parseLrc(content: string): SyncedLyricsLine[] {
    const lines: SyncedLyricsLine[] = []
    const lineRegex = /^\[(\d{1,3}):(\d{2})\.(\d{2,3})\]\s*(.*)$/

    for (const rawLine of content.split('\n')) {
      const trimmed = rawLine.trim()
      if (!trimmed) continue

      const match = trimmed.match(lineRegex)
      if (!match) continue

      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      let centiseconds = parseInt(match[3], 10)

      // If it's 3 digits, it's milliseconds; if 2, it's centiseconds
      if (match[3].length === 2) {
        centiseconds *= 10
      }

      const startTimeMs = (minutes * 60 + seconds) * 1000 + centiseconds
      const text = match[4]

      // Skip empty instrumental breaks
      if (text === '') continue

      lines.push({ startTimeMs, text })
    }

    // Sort by time and compute endTimeMs
    lines.sort((a, b) => a.startTimeMs - b.startTimeMs)
    for (let i = 0; i < lines.length - 1; i++) {
      lines[i].endTimeMs = lines[i + 1].startTimeMs
    }

    return lines
  }
}
