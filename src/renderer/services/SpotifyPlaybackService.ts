// ─── Spotify Playback Service ────────────────────────────────────────────────
// Polls the Spotify Web API for current playback state.
// Handles token refresh, track change detection, and progress interpolation.

import type { SpotifyPlaybackState, TrackInfo, PlaybackInfo, SpotifyTokens } from '../types/spotify'

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const POLL_INTERVAL_MS = 3000
const POLL_INTERVAL_PAUSED_MS = 5000

export class SpotifyPlaybackService {
  private tokens: SpotifyTokens | null = null
  private clientId: string = ''
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastTrackId: string | null = null

  // Callbacks
  public onPlaybackUpdate: ((info: PlaybackInfo) => void) | null = null
  public onTrackChange: ((track: TrackInfo) => void) | null = null
  public onError: ((error: string) => void) | null = null
  public onAuthError: (() => void) | null = null

  setClientId(id: string): void {
    this.clientId = id
  }

  setTokens(tokens: SpotifyTokens): void {
    this.tokens = tokens
  }

  clearTokens(): void {
    this.tokens = null
    this.lastTrackId = null
  }

  /**
   * Seek to a position in the currently playing track.
   */
  async seekTo(positionMs: number): Promise<void> {
    if (!this.tokens) return

    try {
      if (Date.now() >= this.tokens.expiresAt - 60000) {
        await this.refreshAccessToken()
      }

      const response = await fetch(
        `${SPOTIFY_API_BASE}/me/player/seek?position_ms=${Math.round(positionMs)}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${this.tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (response.status === 401) {
        this.onAuthError?.()
        return
      }

      if (!response.ok && response.status !== 204) {
        console.error('[SpotifyPlayback] Seek failed:', response.status)
      }
    } catch (e) {
      console.error('[SpotifyPlayback] Seek error:', e)
    }
  }

  /**
   * Exchange authorization code for tokens using PKCE flow
   */
  async exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<SpotifyTokens> {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId,
        code_verifier: codeVerifier,
      })
    })

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`)
    }

    const data = await response.json()
    const tokens: SpotifyTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000
    }

    this.tokens = tokens
    return tokens
  }

  /**
   * Start polling the Spotify API for playback state
   */
  startPolling(): void {
    if (this.pollTimer) return
    this.poll() // Immediate first poll
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS)
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async poll(): Promise<void> {
    if (!this.tokens) return

    try {
      // Refresh token if needed
      if (Date.now() >= this.tokens.expiresAt - 60000) {
        await this.refreshAccessToken()
      }

      const state = await this.getCurrentPlayback()

      if (!state || !state.item) {
        this.onPlaybackUpdate?.({
          track: null,
          isPlaying: false,
          progressMs: 0,
          receivedAt: performance.now()
        })
        return
      }

      const track = this.extractTrackInfo(state)
      const playbackInfo: PlaybackInfo = {
        track,
        isPlaying: state.is_playing,
        progressMs: state.progress_ms || 0,
        receivedAt: performance.now()
      }

      // Detect track change
      if (track.id !== this.lastTrackId) {
        this.lastTrackId = track.id
        this.onTrackChange?.(track)
      }

      this.onPlaybackUpdate?.(playbackInfo)

      // Adjust polling rate when paused
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        const interval = state.is_playing ? POLL_INTERVAL_MS : POLL_INTERVAL_PAUSED_MS
        this.pollTimer = setInterval(() => this.poll(), interval)
      }
    } catch (e) {
      console.error('[SpotifyPlayback] Poll error:', e)
      this.onError?.(e instanceof Error ? e.message : 'Unknown error')
    }
  }

  private async getCurrentPlayback(): Promise<SpotifyPlaybackState | null> {
    const response = await fetch(`${SPOTIFY_API_BASE}/me/player/currently-playing`, {
      headers: {
        Authorization: `Bearer ${this.tokens!.accessToken}`
      }
    })

    if (response.status === 204) return null // No active playback
    if (response.status === 401) {
      this.onAuthError?.()
      return null
    }
    if (!response.ok) return null

    return await response.json() as SpotifyPlaybackState
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      this.onAuthError?.()
      return
    }

    try {
      const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.refreshToken,
          client_id: this.clientId,
        })
      })

      if (!response.ok) {
        this.onAuthError?.()
        return
      }

      const data = await response.json()
      this.tokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || this.tokens.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000
      }

      // Persist the refreshed tokens
      await window.electronAPI.auth.saveTokens(this.tokens)
    } catch (e) {
      console.error('[SpotifyPlayback] Token refresh failed:', e)
      this.onAuthError?.()
    }
  }

  /**
   * Extract track info from the Spotify API response.
   * Album art comes directly from the official Spotify Web API:
   *   item.album.images[] — typically 3 sizes: 640px, 300px, 64px.
   * We select the largest for the blurred background and a mid-size for thumbnails.
   */
  private extractTrackInfo(state: SpotifyPlaybackState): TrackInfo {
    const item = state.item!
    const images = [...item.album.images]

    // Sort by width descending — largest first
    images.sort((a, b) => (b.width || 0) - (a.width || 0))

    const bestImage = images[0] || null
    // Pick a mid-size image for thumbnails (~300px), fallback to largest
    const smallImage = images.find(img => img.width && img.width <= 300) || bestImage

    return {
      id: item.id,
      title: item.name,
      artist: item.artists.map(a => a.name).join(', '),
      artistsList: item.artists.map(a => a.name),
      album: item.album.name,
      albumArtUrl: bestImage?.url || null,
      albumArtUrlSmall: smallImage?.url || null,
      durationMs: item.duration_ms
    }
  }
}
