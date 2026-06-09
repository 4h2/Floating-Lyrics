// ─── Internal Lyrics Format ───────────────────────────────────────────────────
// These types are provider-agnostic. Every lyrics provider MUST normalize its
// output into one of these shapes before returning.

/** Word-level timing for karaoke mode */
export interface WordTiming {
  /** The word or characters (may include leading space) */
  word: string
  /** Offset from the line's startTimeMs (in milliseconds) */
  offsetMs: number
}

export interface SyncedLyricsLine {
  startTimeMs: number
  endTimeMs?: number
  text: string
  /** Word-level timing for karaoke rendering (optional — only from richsync / enhanced LRC) */
  words?: WordTiming[]
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
  /** True when there's a long instrumental gap (>8s) between lines */
  isInterlude: boolean
  /** Index of the currently active word within the line (for karaoke) — -1 if N/A */
  activeWordIndex: number
  /** Progress within the current word (0..1, for karaoke fill animation) */
  wordProgress: number
}

