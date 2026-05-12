// ─── Theme Store ─────────────────────────────────────────────────────────────
// Dynamic theme generation from album art colors.
// Uses a canvas + pixel sampling approach (no external lib needed in renderer).

import { create } from 'zustand'

export interface ThemeColors {
  bgPrimary: string
  bgSecondary: string
  textPrimary: string
  textSecondary: string
  accent: string
  glow: string
  glowStrong: string
  gradientStart: string
  gradientEnd: string
}

const darkTheme: ThemeColors = {
  bgPrimary: '#0a0a0f',
  bgSecondary: '#14141f',
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.5)',
  accent: '#8b5cf6',
  glow: 'rgba(139,92,246,0.5)',
  glowStrong: 'rgba(139,92,246,0.7)',
  gradientStart: '#0a0a0f',
  gradientEnd: '#1a1025',
}

const lightTheme: ThemeColors = {
  bgPrimary: '#f8f8fc',
  bgSecondary: '#ededf5',
  textPrimary: '#1a1a2e',
  textSecondary: 'rgba(26,26,46,0.5)',
  accent: '#7c3aed',
  glow: 'rgba(124,58,237,0.35)',
  glowStrong: 'rgba(124,58,237,0.55)',
  gradientStart: '#f0eef8',
  gradientEnd: '#e8e0f0',
}

interface ThemeState {
  colors: ThemeColors
  mode: 'auto' | 'dark' | 'light'
  albumArtUrl: string | null

  setMode: (mode: 'auto' | 'dark' | 'light') => void
  generateFromAlbumArt: (imageUrl: string) => Promise<void>
  applyToDOM: () => void
  reset: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  colors: darkTheme,
  mode: 'auto',
  albumArtUrl: null,

  setMode: (mode) => {
    set({ mode })
    if (mode === 'dark') set({ colors: darkTheme })
    else if (mode === 'light') set({ colors: lightTheme })
    // Auto mode will re-generate on next album art change
    get().applyToDOM()
  },

  generateFromAlbumArt: async (imageUrl: string) => {
    const state = get()
    if (state.albumArtUrl === imageUrl && state.mode === 'auto') return
    set({ albumArtUrl: imageUrl })

    if (state.mode !== 'auto') return

    try {
      const colors = await extractColors(imageUrl)
      set({ colors })
      get().applyToDOM()
    } catch (e) {
      console.error('[Theme] Color extraction failed:', e)
      set({ colors: darkTheme })
      get().applyToDOM()
    }
  },

  applyToDOM: () => {
    const { colors } = get()
    const root = document.documentElement
    root.style.setProperty('--bg-primary', colors.bgPrimary)
    root.style.setProperty('--bg-secondary', colors.bgSecondary)
    root.style.setProperty('--text-primary', colors.textPrimary)
    root.style.setProperty('--text-secondary', colors.textSecondary)
    root.style.setProperty('--accent', colors.accent)
    root.style.setProperty('--glow', colors.glow)
    root.style.setProperty('--glow-strong', colors.glowStrong)
    root.style.setProperty('--gradient-start', colors.gradientStart)
    root.style.setProperty('--gradient-end', colors.gradientEnd)
  },

  reset: () => {
    set({ colors: darkTheme, albumArtUrl: null })
    get().applyToDOM()
  },
}))

// ─── Color Extraction ────────────────────────────────────────────────────────
// Extracts dominant colors from album art using canvas pixel sampling.

async function extractColors(imageUrl: string): Promise<ThemeColors> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        const size = 64 // Downsample for speed
        canvas.width = size
        canvas.height = size
        ctx.drawImage(img, 0, 0, size, size)

        const imageData = ctx.getImageData(0, 0, size, size).data
        const colors = getTopColors(imageData)

        const dominant = colors[0]
        const secondary = colors[1] || colors[0]

        // Generate theme from dominant color
        const hsl = rgbToHsl(dominant[0], dominant[1], dominant[2])
        const hsl2 = rgbToHsl(secondary[0], secondary[1], secondary[2])

        // Create a rich, immersive dark theme tinted by album colors
        // Higher saturation values = more vivid, album-specific feel
        const sat1 = Math.min(hsl[1] * 100, 70)
        const sat2 = Math.min(hsl2[1] * 100, 65)

        const bgPrimary = `hsl(${hsl[0]}, ${Math.min(sat1, 45)}%, 7%)`
        const bgSecondary = `hsl(${hsl[0]}, ${Math.min(sat1, 55)}%, 12%)`
        const accent = `hsl(${hsl2[0]}, ${Math.max(hsl2[1] * 100, 55)}%, ${Math.max(hsl2[2] * 100, 55)}%)`
        const gradientStart = `hsl(${hsl[0]}, ${Math.min(sat1, 50)}%, 8%)`
        const gradientEnd = `hsl(${hsl2[0]}, ${Math.min(sat2, 45)}%, 18%)`

        const glowBase = accent.replace(')', ', 0.5)').replace('hsl(', 'hsla(')
        const glowStrong = accent.replace(')', ', 0.7)').replace('hsl(', 'hsla(')

        resolve({
          bgPrimary,
          bgSecondary,
          textPrimary: '#ffffff',
          textSecondary: 'rgba(255,255,255,0.5)',
          accent,
          glow: glowBase,
          glowStrong,
          gradientStart,
          gradientEnd,
        })
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = reject
    img.src = imageUrl
  })
}

function getTopColors(data: Uint8ClampedArray): number[][] {
  const colorMap = new Map<string, { count: number; r: number; g: number; b: number }>()

  for (let i = 0; i < data.length; i += 4) {
    const r = Math.round(data[i] / 16) * 16
    const g = Math.round(data[i + 1] / 16) * 16
    const b = Math.round(data[i + 2] / 16) * 16
    const key = `${r},${g},${b}`

    const existing = colorMap.get(key)
    if (existing) {
      existing.count++
    } else {
      colorMap.set(key, { count: 1, r, g, b })
    }
  }

  const sorted = [...colorMap.values()]
    .filter(c => {
      // Skip very dark and very light colors
      const brightness = (c.r + c.g + c.b) / 3
      return brightness > 20 && brightness < 240
    })
    .sort((a, b) => b.count - a.count)

  return sorted.slice(0, 5).map(c => [c.r, c.g, c.b])
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0

  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
    case g: h = ((b - r) / d + 2) / 6; break
    case b: h = ((r - g) / d + 4) / 6; break
  }

  return [Math.round(h * 360), s, l]
}
