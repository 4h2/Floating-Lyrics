// ─── Musixmatch Unofficial Provider ──────────────────────────────────────────
// ⚠️ EXPERIMENTAL — For local/personal use only.
// This provider uses reverse-engineered Musixmatch API endpoints.
// It may break at any time, suffer rate limits, or violate ToS.
// Disabled by default. Enable only in settings for personal use.

import type { LyricsProvider, TrackQuery, Lyrics, SyncedLyricsLine } from '../types/lyrics'

const MXM_BASE = 'https://apic-desktop.musixmatch.com/ws/1.1'
const TIMEOUT_MS = 6000
const TOKEN_EXPIRY_MS = 10 * 60 * 1000 // 10 minutes

interface MxmToken {
  value: string
  expiresAt: number
}

export class MusixmatchUnofficialProvider implements LyricsProvider {
  readonly name = 'MusixmatchUnofficialProvider'
  private enabled: boolean = false
  private token: MxmToken | null = null

  setEnabled(value: boolean): void {
    this.enabled = value
  }

  isEnabled(): boolean {
    return this.enabled
  }

  async search(query: TrackQuery): Promise<Lyrics | null> {
    if (!this.enabled) return null

    try {
      const token = await this.getToken()
      if (!token) return null

      // Step 1: Find the track
      const trackData = await this.matchTrack(token, query)
      if (!trackData) return null

      const trackId = trackData.track_id
      const hasSubtitles = trackData.has_subtitles === 1
      const hasLyrics = trackData.has_lyrics === 1

      // Step 2: Try synced lyrics (subtitles)
      if (hasSubtitles) {
        const synced = await this.getSubtitles(token, trackId)
        if (synced && synced.length > 0) {
          return {
            type: 'synced',
            trackTitle: query.title,
            artistName: query.artist,
            albumName: query.album,
            durationMs: query.durationMs,
            lines: synced
          }
        }
      }

      // Step 3: Fallback to plain lyrics
      if (hasLyrics) {
        const plain = await this.getLyrics(token, trackId)
        if (plain) {
          return {
            type: 'plain',
            trackTitle: query.title,
            artistName: query.artist,
            text: plain
          }
        }
      }

      return null
    } catch (e) {
      console.error(`[${this.name}] Error:`, e)
      return null
    }
  }

  // ─── Token Management ────────────────────────────────────────────────

  private async getToken(): Promise<string | null> {
    if (this.token && Date.now() < this.token.expiresAt) {
      return this.token.value
    }

    try {
      const response = await this.fetchWithTimeout(
        `${MXM_BASE}/token.get?app_id=web-desktop-app-v1.0`
      )
      const data = await response.json()
      const tokenValue = data?.message?.body?.user_token

      if (tokenValue && tokenValue !== 'MusixmatchUsertoken') {
        this.token = {
          value: tokenValue,
          expiresAt: Date.now() + TOKEN_EXPIRY_MS
        }
        return tokenValue
      }
    } catch (e) {
      console.error(`[${this.name}] Token fetch failed:`, e)
    }

    return null
  }

  // ─── Track Matching ──────────────────────────────────────────────────

  private async matchTrack(
    token: string,
    query: TrackQuery
  ): Promise<{ track_id: number; has_subtitles: number; has_lyrics: number } | null> {
    try {
      const params = new URLSearchParams({
        format: 'json',
        q_track: query.title,
        q_artist: query.artist,
        usertoken: token,
        app_id: 'web-desktop-app-v1.0',
      })

      if (query.durationMs) {
        params.set('f_subtitle_length', String(Math.round(query.durationMs / 1000)))
      }

      const response = await this.fetchWithTimeout(
        `${MXM_BASE}/matcher.track.get?${params.toString()}`
      )
      const data = await response.json()
      const track = data?.message?.body?.track

      if (track) {
        return {
          track_id: track.track_id,
          has_subtitles: track.has_subtitles,
          has_lyrics: track.has_lyrics
        }
      }
    } catch (e) {
      console.error(`[${this.name}] Track match failed:`, e)
    }

    return null
  }

  // ─── Synced Lyrics (Subtitles) ───────────────────────────────────────

  private async getSubtitles(token: string, trackId: number): Promise<SyncedLyricsLine[] | null> {
    try {
      const params = new URLSearchParams({
        format: 'json',
        track_id: String(trackId),
        subtitle_format: 'lrc',
        usertoken: token,
        app_id: 'web-desktop-app-v1.0',
      })

      const response = await this.fetchWithTimeout(
        `${MXM_BASE}/track.subtitle.get?${params.toString()}`
      )
      const data = await response.json()
      const subtitle = data?.message?.body?.subtitle

      if (subtitle?.subtitle_body) {
        return this.parseSubtitles(subtitle.subtitle_body)
      }
    } catch (e) {
      console.error(`[${this.name}] Subtitle fetch failed:`, e)
    }

    return null
  }

  private parseSubtitles(body: string): SyncedLyricsLine[] {
    const lines: SyncedLyricsLine[] = []

    // Try JSON format first (Musixmatch sometimes returns JSON array)
    try {
      const parsed = JSON.parse(body)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.text && item.text.trim()) {
            lines.push({
              startTimeMs: Math.round((item.time?.total || 0) * 1000),
              endTimeMs: item.time?.total
                ? Math.round((item.time.total + (item.time?.minutes || 0) * 60) * 1000)
                : undefined,
              text: item.text.trim()
            })
          }
        }
        if (lines.length > 0) return lines
      }
    } catch {
      // Not JSON, try LRC format
    }

    // LRC format
    const lineRegex = /^\[(\d{1,3}):(\d{2})\.(\d{2,3})\]\s*(.*)$/
    for (const rawLine of body.split('\n')) {
      const match = rawLine.trim().match(lineRegex)
      if (!match) continue

      const minutes = parseInt(match[1], 10)
      const seconds = parseInt(match[2], 10)
      let ms = parseInt(match[3], 10)
      if (match[3].length === 2) ms *= 10

      const text = match[4]
      if (!text) continue

      lines.push({
        startTimeMs: (minutes * 60 + seconds) * 1000 + ms,
        text
      })
    }

    lines.sort((a, b) => a.startTimeMs - b.startTimeMs)
    for (let i = 0; i < lines.length - 1; i++) {
      lines[i].endTimeMs = lines[i + 1].startTimeMs
    }

    return lines
  }

  // ─── Plain Lyrics ────────────────────────────────────────────────────

  private async getLyrics(token: string, trackId: number): Promise<string | null> {
    try {
      const params = new URLSearchParams({
        format: 'json',
        track_id: String(trackId),
        usertoken: token,
        app_id: 'web-desktop-app-v1.0',
      })

      const response = await this.fetchWithTimeout(
        `${MXM_BASE}/track.lyrics.get?${params.toString()}`
      )
      const data = await response.json()
      return data?.message?.body?.lyrics?.lyrics_body || null
    } catch (e) {
      console.error(`[${this.name}] Lyrics fetch failed:`, e)
      return null
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          'Cookie': 'x-mxm-token-guid='
        }
      })
    } finally {
      clearTimeout(timeout)
    }
  }
}
