// ─── LRCLIB Provider ─────────────────────────────────────────────────────────
// Free, open-source API for synced lyrics. No auth required.
// API docs: https://lrclib.net/docs
// This is the primary online provider — reliable, legal, and free.

import type { LyricsProvider, TrackQuery, Lyrics, SyncedLyricsLine } from '../types/lyrics'

const LRCLIB_BASE = 'https://lrclib.net/api'
const TIMEOUT_MS = 8000
const USER_AGENT = 'FloatingLyrics/1.0.0 (https://github.com/user/floating-lyrics)'

interface LrcLibResponse {
  id: number
  name: string
  trackName: string
  artistName: string
  albumName: string
  duration: number
  instrumental: boolean
  plainLyrics: string | null
  syncedLyrics: string | null
}

export class LrcLibProvider implements LyricsProvider {
  readonly name = 'LrcLibProvider'

  isEnabled(): boolean {
    return true // Always enabled — free and open
  }

  async search(query: TrackQuery): Promise<Lyrics | null> {
    try {
      const result = await this.fetchLyrics(query)
      if (!result) return null

      if (result.instrumental) {
        return {
          type: 'plain',
          trackTitle: query.title,
          artistName: query.artist,
          text: '♪ Instrumental ♪'
        }
      }

      // Prefer synced lyrics
      if (result.syncedLyrics) {
        const lines = this.parseSyncedLyrics(result.syncedLyrics)
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

      // Fallback to plain lyrics
      if (result.plainLyrics) {
        return {
          type: 'plain',
          trackTitle: query.title,
          artistName: query.artist,
          text: result.plainLyrics
        }
      }

      return null
    } catch (e) {
      console.error(`[${this.name}] Error:`, e)
      return null
    }
  }

  private async fetchLyrics(query: TrackQuery): Promise<LrcLibResponse | null> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const params = new URLSearchParams({
        artist_name: query.artist,
        track_name: query.title,
      })

      if (query.album) params.set('album_name', query.album)
      if (query.durationMs) params.set('duration', String(Math.round(query.durationMs / 1000)))

      const response = await fetch(`${LRCLIB_BASE}/get?${params.toString()}`, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT }
      })

      if (!response.ok) {
        if (response.status === 404) return null
        console.warn(`[${this.name}] HTTP ${response.status}`)
        return null
      }

      return await response.json() as LrcLibResponse
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        console.warn(`[${this.name}] Request timed out`)
      } else {
        throw e
      }
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Parses LRC format synced lyrics into internal format
   */
  private parseSyncedLyrics(raw: string): SyncedLyricsLine[] {
    const lines: SyncedLyricsLine[] = []
    const lineRegex = /^\[(\d{1,3}):(\d{2})\.(\d{2,3})\]\s*(.*)$/

    for (const rawLine of raw.split('\n')) {
      const trimmed = rawLine.trim()
      if (!trimmed) continue

      const match = trimmed.match(lineRegex)
      if (!match) continue

      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      let ms = parseInt(match[3], 10)
      if (match[3].length === 2) ms *= 10

      const startTimeMs = (minutes * 60 + seconds) * 1000 + ms
      const text = match[4]

      if (text === '') continue

      lines.push({ startTimeMs, text })
    }

    lines.sort((a, b) => a.startTimeMs - b.startTimeMs)
    for (let i = 0; i < lines.length - 1; i++) {
      lines[i].endTimeMs = lines[i + 1].startTimeMs
    }

    return lines
  }
}
