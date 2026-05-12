import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  globalShortcut,
  safeStorage,
  dialog,
  screen,
  net
} from 'electron'
import { join } from 'path'
import { createServer, IncomingMessage, ServerResponse } from 'http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { randomBytes, createHash } from 'crypto'

// ─── Constants ───────────────────────────────────────────────────────────────

const SPOTIFY_CLIENT_ID = import.meta.env.MAIN_VITE_SPOTIFY_CLIENT_ID || ''
const SPOTIFY_REDIRECT_URI = import.meta.env.MAIN_VITE_SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback'
const SPOTIFY_SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state'
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const AUTH_PORT = 8888

// ─── Paths ───────────────────────────────────────────────────────────────────

const userDataPath = app.getPath('userData')
const settingsPath = join(userDataPath, 'settings.json')
const tokensPath = join(userDataPath, 'tokens.enc')

// ─── Settings Store ──────────────────────────────────────────────────────────

interface AppSettings {
  alwaysOnTop: boolean
  windowOpacity: number
  fontSize: number
  lyricsOffsetMs: number
  theme: 'auto' | 'dark' | 'light'
  musixmatchEnabled: boolean
  lrcFolderPath: string
  windowBounds: { x: number; y: number; width: number; height: number } | null
  mode: 'compact' | 'expanded'
  globalShortcut: string
  albumArtPresence: number
  showProgressBar: boolean
}

const defaultSettings: AppSettings = {
  alwaysOnTop: true,
  windowOpacity: 1,
  fontSize: 28,
  lyricsOffsetMs: 0,
  theme: 'auto',
  musixmatchEnabled: false,
  lrcFolderPath: '',
  windowBounds: null,
  mode: 'expanded',
  globalShortcut: 'Ctrl+Shift+L',
  albumArtPresence: 70,
  showProgressBar: true,
}

function loadSettings(): AppSettings {
  try {
    if (existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, 'utf-8')
      return { ...defaultSettings, ...JSON.parse(raw) }
    }
  } catch (e) {
    console.error('[Settings] Failed to load:', e)
  }
  return { ...defaultSettings }
}

function saveSettings(s: AppSettings): void {
  try {
    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(s, null, 2), 'utf-8')
  } catch (e) {
    console.error('[Settings] Failed to save:', e)
  }
}

let settings = loadSettings()

// ─── Token Storage (encrypted) ───────────────────────────────────────────────

interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

function saveTokens(tokens: StoredTokens): void {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(JSON.stringify(tokens))
      writeFileSync(tokensPath, encrypted)
    } else {
      writeFileSync(tokensPath, JSON.stringify(tokens), 'utf-8')
    }
  } catch (e) {
    console.error('[Tokens] Failed to save:', e)
  }
}

function loadTokens(): StoredTokens | null {
  try {
    if (!existsSync(tokensPath)) return null
    const raw = readFileSync(tokensPath)
    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(raw)
      return JSON.parse(decrypted)
    } else {
      return JSON.parse(raw.toString('utf-8'))
    }
  } catch (e) {
    console.error('[Tokens] Failed to load:', e)
    return null
  }
}

function clearTokens(): void {
  try {
    if (existsSync(tokensPath)) {
      writeFileSync(tokensPath, '', 'utf-8')
    }
  } catch (_) { /* ignore */ }
}

// ─── PKCE Helpers ────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

// ─── Token Exchange (done in main process — it has the code_verifier) ────────

async function exchangeCodeForTokens(code: string, verifier: string): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  })

  const response = await net.fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${text}`)
  }

  const data = await response.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

// ─── Main Window ─────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let codeVerifier: string | null = null
let authServer: ReturnType<typeof createServer> | null = null

function createWindow(): void {
  const bounds = settings.windowBounds
  const display = screen.getPrimaryDisplay()
  const defaultWidth = 420
  const defaultHeight = 680

  mainWindow = new BrowserWindow({
    width: bounds?.width || defaultWidth,
    height: bounds?.height || defaultHeight,
    x: bounds?.x ?? Math.round(display.workArea.width - defaultWidth - 40),
    y: bounds?.y ?? Math.round((display.workArea.height - defaultHeight) / 2),
    minWidth: 280,
    minHeight: 100,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.setOpacity(settings.windowOpacity)

  const saveBoundsDebounced = debounce(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      settings.windowBounds = mainWindow.getBounds()
      saveSettings(settings)
    }
  }, 500)

  mainWindow.on('moved', saveBoundsDebounced)
  mainWindow.on('resized', saveBoundsDebounced)

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── OAuth Callback Server ───────────────────────────────────────────────────
// When Spotify redirects back, this server receives the auth code,
// exchanges it for tokens (using the PKCE verifier), saves them,
// and sends them to the renderer.

function startAuthServer(): void {
  if (authServer) return

  authServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '', `http://127.0.0.1:${AUTH_PORT}`)
    if (url.pathname !== '/callback') {
      res.writeHead(404)
      res.end()
      return
    }

    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (!code || !codeVerifier || !mainWindow) {
      res.writeHead(400, { 'Content-Type': 'text/html' })
      res.end(`<html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>Error: ${error || 'Missing code'}</h1></body></html>`)
      return
    }

    try {
      // Exchange code for tokens right here in the main process
      console.log('[Auth] Exchanging code for tokens...')
      const tokens = await exchangeCodeForTokens(code, codeVerifier)
      saveTokens(tokens)
      codeVerifier = null

      // Send tokens to renderer
      mainWindow.webContents.send('auth:tokens', tokens)

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <html>
          <body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
              <h1 style="font-size:2rem;margin-bottom:0.5rem">✅ Connected!</h1>
              <p style="opacity:0.6">You can close this tab and return to Floating Lyrics.</p>
            </div>
          </body>
        </html>
      `)

      // Bring window to front
      mainWindow.show()
      mainWindow.focus()
    } catch (e) {
      console.error('[Auth] Token exchange failed:', e)
      mainWindow.webContents.send('auth:error', String(e))
      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(`<html><body style="background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h1>Auth failed</h1><p style="opacity:0.6">${e}</p></body></html>`)
    }

    setTimeout(() => stopAuthServer(), 2000)
  })

  authServer.listen(AUTH_PORT, '127.0.0.1', () => {
    console.log(`[Auth] Callback server listening on port ${AUTH_PORT}`)
  })

  authServer.on('error', (err) => {
    console.error('[Auth] Server error:', err)
  })
}

function stopAuthServer(): void {
  if (authServer) {
    authServer.close()
    authServer = null
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function setupIPC(): void {
  // ── Auth ──────────────────────────────────────────
  ipcMain.on('auth:login', () => {
    if (!SPOTIFY_CLIENT_ID) {
      console.error('[Auth] SPOTIFY_CLIENT_ID is not set! Check your .env file.')
      mainWindow?.webContents.send('auth:error', 'SPOTIFY_CLIENT_ID is not configured. Check your .env file.')
      return
    }

    console.log('[Auth] Starting login flow...')
    console.log('[Auth] Client ID:', SPOTIFY_CLIENT_ID.substring(0, 8) + '...')

    codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    startAuthServer()

    const authUrl = new URL('https://accounts.spotify.com/authorize')
    authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI)
    authUrl.searchParams.set('scope', SPOTIFY_SCOPES)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('show_dialog', 'true')

    console.log('[Auth] Opening browser for authorization...')
    shell.openExternal(authUrl.toString())
  })

  ipcMain.on('auth:logout', () => {
    clearTokens()
    codeVerifier = null
  })

  ipcMain.handle('auth:getTokens', async () => {
    return loadTokens()
  })

  ipcMain.handle('auth:saveTokens', async (_event, tokens: StoredTokens) => {
    saveTokens(tokens)
  })

  // Also expose client ID and redirect URI so renderer can do token refresh
  ipcMain.handle('auth:getConfig', () => {
    return {
      clientId: SPOTIFY_CLIENT_ID,
      redirectUri: SPOTIFY_REDIRECT_URI,
    }
  })

  // ── Window Controls ──────────────────────────────
  ipcMain.on('window:minimize', () => mainWindow?.minimize())

  ipcMain.on('window:close', () => {
    mainWindow?.close()
    app.quit()
  })

  ipcMain.handle('window:toggleAlwaysOnTop', () => {
    if (!mainWindow) return false
    const next = !mainWindow.isAlwaysOnTop()
    mainWindow.setAlwaysOnTop(next, 'floating')
    settings.alwaysOnTop = next
    saveSettings(settings)
    return next
  })

  ipcMain.on('window:setAlwaysOnTop', (_event, value: boolean) => {
    mainWindow?.setAlwaysOnTop(value, 'floating')
    settings.alwaysOnTop = value
    saveSettings(settings)
  })

  ipcMain.handle('window:isAlwaysOnTop', () => {
    return mainWindow?.isAlwaysOnTop() || false
  })

  ipcMain.on('window:setOpacity', (_event, value: number) => {
    const clamped = Math.max(0.3, Math.min(1, value))
    mainWindow?.setOpacity(clamped)
    settings.windowOpacity = clamped
    saveSettings(settings)
  })

  ipcMain.on('window:toggleFullscreen', () => {
    if (!mainWindow) return
    mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })

  ipcMain.on('window:startDrag', () => { /* CSS -webkit-app-region: drag */ })

  ipcMain.handle('window:getBounds', () => mainWindow?.getBounds())

  ipcMain.on('window:setBounds', (_event, bounds) => {
    if (mainWindow) mainWindow.setBounds(bounds)
  })

  // ── Settings ─────────────────────────────────────
  ipcMain.handle('settings:get', (_event, key: string) => {
    return (settings as Record<string, unknown>)[key] ?? null
  })

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    ;(settings as Record<string, unknown>)[key] = value
    saveSettings(settings)
  })

  ipcMain.handle('settings:getAll', () => ({ ...settings }))

  // ── Shell ────────────────────────────────────────
  ipcMain.on('shell:openExternal', (_event, url: string) => {
    shell.openExternal(url)
  })

  // ── Dialog ───────────────────────────────────────
  ipcMain.handle('dialog:selectFolder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function debounce(fn: () => void, delay: number): () => void {
  let timer: NodeJS.Timeout | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, delay)
  }
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  console.log('[App] Starting Floating Lyrics...')
  console.log('[App] Client ID configured:', !!SPOTIFY_CLIENT_ID)

  setupIPC()
  createWindow()

  const shortcutKey = settings.globalShortcut || 'Ctrl+Shift+L'
  try {
    globalShortcut.register(shortcutKey, () => {
      if (!mainWindow) return
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  } catch (e) {
    console.error('[Shortcut] Failed to register:', e)
  }
})

app.on('window-all-closed', () => {
  stopAuthServer()
  globalShortcut.unregisterAll()
  app.quit()
})

app.on('before-quit', () => {
  stopAuthServer()
  globalShortcut.unregisterAll()
})
