// ─── Internal Lyrics Format ───────────────────────────────────────────────────
// These types are provider-agnostic. Every lyrics provider MUST normalize its
// output into one of these shapes before returning.

export interface SyncedLyricsLine {
  startTimeMs: number
  endTimeMs?: number
  text: string
}

export interface SyncedLyrics {
  type: 'synced'
  trackTitle: string
  artistName: string
  albumName?: string
  durationMs?: number
  lines: SyncedLyricsLine[]
}

export interface PlainLyrics {
  type: 'plain'
  trackTitle: string
  artistName: string
  text: string
}

export type Lyrics = SyncedLyrics | PlainLyrics

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface TrackQuery {
  title: string
  artist: string
  album?: string
  durationMs?: number
}

export interface LyricsProvider {
  /** Human-readable name of the provider */
  readonly name: string
  /** Whether this provider is currently enabled */
  isEnabled(): boolean
  /** Search for lyrics matching the given track */
  search(query: TrackQuery): Promise<Lyrics | null>
}

// ─── Sync Engine State ───────────────────────────────────────────────────────

export interface LyricsSyncState {
  currentIndex: number
  /** Lines before current, most recent first */
  previousLines: SyncedLyricsLine[]
  currentLine: SyncedLyricsLine | null
  /** Lines after current */
  nextLines: SyncedLyricsLine[]
  /** Progress within the current line (0..1) */
  lineProgress: number
}
