import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  auth: {
    login: () => ipcRenderer.send('auth:login'),
    logout: () => ipcRenderer.send('auth:logout'),
    getTokens: () => ipcRenderer.invoke('auth:getTokens'),
    saveTokens: (tokens: { accessToken: string; refreshToken: string; expiresAt: number }) =>
      ipcRenderer.invoke('auth:saveTokens', tokens),
    getConfig: () => ipcRenderer.invoke('auth:getConfig'),
    // Main process sends tokens after completing the PKCE exchange
    onTokensReceived: (callback: (tokens: { accessToken: string; refreshToken: string; expiresAt: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, tokens: { accessToken: string; refreshToken: string; expiresAt: number }) => callback(tokens)
      ipcRenderer.on('auth:tokens', handler)
      return () => ipcRenderer.removeListener('auth:tokens', handler)
    },
    onAuthError: (callback: (error: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
      ipcRenderer.on('auth:error', handler)
      return () => ipcRenderer.removeListener('auth:error', handler)
    }
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    close: () => ipcRenderer.send('window:close'),
    toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
    setAlwaysOnTop: (value: boolean) => ipcRenderer.send('window:setAlwaysOnTop', value),
    isAlwaysOnTop: () => ipcRenderer.invoke('window:isAlwaysOnTop'),
    setOpacity: (value: number) => ipcRenderer.send('window:setOpacity', value),
    toggleFullscreen: () => ipcRenderer.send('window:toggleFullscreen'),
    startDrag: () => ipcRenderer.send('window:startDrag'),
    getWindowBounds: () => ipcRenderer.invoke('window:getBounds'),
    setWindowBounds: (bounds: { x?: number; y?: number; width?: number; height?: number }) =>
      ipcRenderer.send('window:setBounds', bounds)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.send('shell:openExternal', url)
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder')
  }
})
