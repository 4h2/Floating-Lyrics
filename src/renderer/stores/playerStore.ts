// ─── Player Store ────────────────────────────────────────────────────────────
// Reactive state for Spotify playback info.

import { create } from 'zustand'
import type { TrackInfo } from '../types/spotify'

interface PlayerState {
  track: TrackInfo | null
  isPlaying: boolean
  progressMs: number
  receivedAt: number
  isConnected: boolean
  error: string | null

  // Actions
  setTrack: (track: TrackInfo | null) => void
  setPlaying: (isPlaying: boolean) => void
  updateProgress: (progressMs: number, receivedAt: number) => void
  setConnected: (connected: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const usePlayerStore = create<PlayerState>((set) => ({
  track: null,
  isPlaying: false,
  progressMs: 0,
  receivedAt: 0,
  isConnected: false,
  error: null,

  setTrack: (track) => set({ track }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  updateProgress: (progressMs, receivedAt) => set({ progressMs, receivedAt }),
  setConnected: (connected) => set({ isConnected: connected, error: connected ? null : undefined }),
  setError: (error) => set({ error }),
  reset: () => set({ track: null, isPlaying: false, progressMs: 0, receivedAt: 0, isConnected: false, error: null }),
}))
