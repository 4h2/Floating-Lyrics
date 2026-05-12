export interface ElectronAPI {
  auth: {
    login(): void
    logout(): void
    getTokens(): Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null>
    saveTokens(tokens: { accessToken: string; refreshToken: string; expiresAt: number }): Promise<void>
    getConfig(): Promise<{ clientId: string; redirectUri: string }>
    onTokensReceived(callback: (tokens: { accessToken: string; refreshToken: string; expiresAt: number }) => void): () => void
    onAuthError(callback: (error: string) => void): () => void
  }
  window: {
    minimize(): void
    close(): void
    toggleAlwaysOnTop(): Promise<boolean>
    setAlwaysOnTop(value: boolean): void
    isAlwaysOnTop(): Promise<boolean>
    setOpacity(value: number): void
    toggleFullscreen(): void
    startDrag(): void
    getWindowBounds(): Promise<{ x: number; y: number; width: number; height: number }>
    setWindowBounds(bounds: { x?: number; y?: number; width?: number; height?: number }): void
  }
  settings: {
    get(key: string): Promise<unknown>
    set(key: string, value: unknown): Promise<void>
    getAll(): Promise<Record<string, unknown>>
  }
  shell: {
    openExternal(url: string): void
  }
  dialog: {
    selectFolder(): Promise<string | null>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
