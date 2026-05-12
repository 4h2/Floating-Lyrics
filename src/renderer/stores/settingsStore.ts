// ─── Settings Store ──────────────────────────────────────────────────────────
// Persistent user preferences. Syncs with Electron main process via IPC.

import { create } from 'zustand'

export interface AppSettings {
  alwaysOnTop: boolean
  windowOpacity: number
  fontSize: number
  lyricsOffsetMs: number
  theme: 'auto' | 'dark' | 'light'
  musixmatchEnabled: boolean
  lrcFolderPath: string
  mode: 'compact' | 'expanded'
}

const defaults: AppSettings = {
  alwaysOnTop: true,
  windowOpacity: 1,
  fontSize: 28,
  lyricsOffsetMs: 0,
  theme: 'auto',
  musixmatchEnabled: false,
  lrcFolderPath: '',
  mode: 'expanded',
}

interface SettingsState extends AppSettings {
  isLoaded: boolean
  loadSettings: () => Promise<void>
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>
  resetDefaults: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...defaults,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const all = await window.electronAPI.settings.getAll() as Partial<AppSettings>
      set({ ...defaults, ...all, isLoaded: true })
    } catch (e) {
      console.error('[Settings] Failed to load:', e)
      set({ isLoaded: true })
    }
  },

  updateSetting: async (key, value) => {
    set({ [key]: value } as Partial<AppSettings>)
    try {
      await window.electronAPI.settings.set(key, value)
    } catch (e) {
      console.error('[Settings] Failed to save:', e)
    }
  },

  resetDefaults: async () => {
    set({ ...defaults })
    for (const [key, value] of Object.entries(defaults)) {
      await window.electronAPI.settings.set(key, value)
    }
  },
}))
