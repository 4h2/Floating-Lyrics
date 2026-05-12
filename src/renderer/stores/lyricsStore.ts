// ─── Lyrics Store ────────────────────────────────────────────────────────────
// Reactive state for lyrics data and sync engine output.

import { create } from 'zustand'
import type { Lyrics, LyricsSyncState } from '../types/lyrics'

type LyricsStatus = 'idle' | 'loading' | 'synced' | 'plain' | 'unavailable' | 'error'

interface LyricsState {
  lyrics: Lyrics | null
  status: LyricsStatus
  errorMessage: string | null
  syncState: LyricsSyncState | null

  // Actions
  setLyrics: (lyrics: Lyrics | null) => void
  setStatus: (status: LyricsStatus) => void
  setError: (message: string) => void
  setSyncState: (state: LyricsSyncState) => void
  reset: () => void
}

export const useLyricsStore = create<LyricsState>((set) => ({
  lyrics: null,
  status: 'idle',
  errorMessage: null,
  syncState: null,

  setLyrics: (lyrics) =>
    set({
      lyrics,
      status: lyrics ? (lyrics.type === 'synced' ? 'synced' : 'plain') : 'unavailable',
      errorMessage: null
    }),
  setStatus: (status) => set({ status }),
  setError: (message) => set({ status: 'error', errorMessage: message }),
  setSyncState: (syncState) => set({ syncState }),
  reset: () => set({ lyrics: null, status: 'idle', errorMessage: null, syncState: null }),
}))
