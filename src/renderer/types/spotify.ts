// ─── Spotify Web API Types ────────────────────────────────────────────────────
// Only what we need: current playback state, track metadata, and auth tokens.

export interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix timestamp ms
}

export interface SpotifyImage {
  url: string
  height: number | null
  width: number | null
}

export interface SpotifyArtist {
  id: string
  name: string
}

export interface SpotifyAlbum {
  id: string
  name: string
  images: SpotifyImage[]
}

export interface SpotifyTrack {
  id: string
  name: string
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  duration_ms: number
}

export interface SpotifyDevice {
  id: string | null
  name: string
  type: string
  is_active: boolean
}

export interface SpotifyPlaybackState {
  is_playing: boolean
  progress_ms: number | null
  item: SpotifyTrack | null
  device?: SpotifyDevice
  timestamp: number
}

// ─── Internal Track Info ─────────────────────────────────────────────────────

export interface TrackInfo {
  id: string
  title: string
  artist: string
  artistsList: string[]
  album: string
  albumArtUrl: string | null
  durationMs: number
}

export interface PlaybackInfo {
  track: TrackInfo | null
  isPlaying: boolean
  progressMs: number
  /** When this state was received (performance.now()) */
  receivedAt: number
}
