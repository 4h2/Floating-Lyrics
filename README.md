# 🎵 Floating Lyrics

A premium floating lyrics miniplayer for Windows that connects to your Spotify account, detects the currently playing track, and displays synced lyrics with smooth, Apple Music-inspired animations.

![Status](https://img.shields.io/badge/status-MVP-blueviolet)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

- **Spotify Integration** — OAuth login, automatic track detection, album art, and playback state
- **Synced Lyrics** — Line-by-line lyrics synchronized with your music
- **Beautiful Animations** — Apple Music-inspired glow, scale, and scroll effects at 60fps
- **Dynamic Themes** — Auto-generated color scheme from album artwork
- **Floating Window** — Always-on-top, freely resizable, adjustable opacity
- **Multiple Lyrics Providers** — Local .lrc files, LRCLIB (free API), and optional Musixmatch
- **Smart Fallbacks** — Graceful degradation: synced → plain → unavailable

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- A Spotify account (free or premium)

### 1. Clone & Install

```bash
git clone https://github.com/4h2/floating-lyrics.git
cd floating-lyrics
npm install
```

### 2. Create a Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Set **Redirect URI** to: `http://127.0.0.1:8888/callback`
4. Check **Web API** under "Which API/SDKs are you planning to use?"
5. Save, then note your **Client ID**

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your Client ID:

```
MAIN_VITE_SPOTIFY_CLIENT_ID=your_client_id_here
MAIN_VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
```

### 4. Run in Development

```bash
npm run dev
```

### 5. Build Executable (optional)

```bash
# Build installer (.exe setup)
npm run package

# Build portable (no installer, run directly from folder)
npm run package:dir
```

The output will be in the `dist/` folder.

## 🎤 Lyrics Providers

Lyrics are fetched in this order:

| Priority | Provider | Type | Description |
|----------|----------|------|-------------|
| 1 | **LocalLrcProvider** | Local | Reads `.lrc` files from a configured folder |
| 2 | **LrcLibProvider** | Online (Free) | Open-source API, no auth needed |
| 3 | **MusixmatchUnofficialProvider** | Online (Experimental) | Disabled by default |
| 4 | **FallbackStaticProvider** | Fallback | Plain text lyrics if available |

### Using Local .lrc Files

1. Create a folder for your `.lrc` files
2. In Settings, click **Browse** to set the folder path
3. Name files as: `Artist - Title.lrc`

Example: `Radiohead - Creep.lrc`

### LRCLIB

[LRCLIB](https://lrclib.net) is a free, open-source lyrics database. It requires no API key and provides both synced and plain lyrics. This is the primary online provider.

### Musixmatch Unofficial Provider

> ⚠️ **EXPERIMENTAL — Personal/Local Use Only**
>
> This provider uses reverse-engineered Musixmatch API endpoints. It is:
> - **Disabled by default** — Enable in Settings if you want to try it
> - **Unstable** — May break at any time without notice
> - **Rate-limited** — Musixmatch may throttle or block requests
> - **Not for distribution** — Using this in a public/commercial app violates Musixmatch ToS
> - **Not the primary source** — LRCLIB is preferred and more reliable
>
> This provider exists solely as an experimental fallback for local development and personal use.

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+L` | Show/Hide window (global) |

## 🎨 Themes

- **Auto** — Colors extracted from album artwork
- **Dark** — Always dark theme
- **Light** — Always light theme

## ⚙️ Settings

- Font size (16–48px)
- Lyrics offset (±2000ms)
- Window opacity (30–100%)
- Always on top toggle
- Theme selection
- LRC folder path
- Musixmatch provider toggle
- Clear lyrics cache
- Spotify logout

## 🏗️ Architecture

```
src/
├── main/           # Electron main process
│   └── index.ts    # Window, IPC, OAuth server, settings
├── preload/        # Context bridge
│   └── index.ts    # Typed IPC API
└── renderer/       # React UI
    ├── App.tsx     # Root orchestrator
    ├── components/ # UI components
    ├── providers/  # Lyrics provider implementations
    ├── services/   # Spotify playback, lyrics orchestration
    ├── engine/     # Lyrics sync engine (60fps)
    ├── stores/     # Zustand state management
    ├── styles/     # CSS design system
    └── types/      # TypeScript interfaces
```

## ⚠️ Known Limitations

- **Spotify Web API** does not provide lyrics. All lyrics come from third-party sources.
- **Polling interval** is ~3 seconds. Lyrics sync uses local interpolation between polls.
- **Musixmatch provider** is experimental and may stop working at any time.
- **LRCLIB** coverage depends on community contributions.
- The app does **not** play, download, record, or redistribute any audio.

## 📋 Spotify API Usage

This app uses the Spotify Web API exclusively for:
- User authentication (OAuth 2.0 PKCE)
- Current track metadata (title, artist, album, art)
- Playback state (progress, duration, play/pause)
- Active device info

It does **not** control playback, access audio streams, or store any Spotify content.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

> **Note:** The Musixmatch Unofficial Provider is experimental and uses reverse-engineered endpoints. If you distribute this app, consider disabling or removing that provider to avoid potential ToS violations. The rest of the app (Spotify OAuth, LRCLIB, local .lrc files) is fully compliant.
