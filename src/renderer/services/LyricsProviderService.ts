// ─── Lyrics Provider Service ─────────────────────────────────────────────────
// Orchestrates multiple lyrics providers in fallback order.
// Handles caching, deduplication, and normalization.

import type { LyricsProvider, TrackQuery, Lyrics } from '../types/lyrics'

export class LyricsProviderService {
  private providers: LyricsProvider[] = []
  private cache = new Map<string, Lyrics | null>()
  private pendingRequests = new Map<string, Promise<Lyrics | null>>()

  setProviders(providers: LyricsProvider[]): void {
    this.providers = providers
  }

  /**
   * Searches all enabled providers in order until lyrics are found.
   * Results are cached by track identity.
   */
  async search(query: TrackQuery): Promise<Lyrics | null> {
    const cacheKey = this.getCacheKey(query)

    // Check cache first
    if (this.cache.has(cacheKey)) {
      console.log('[LyricsService] Cache hit:', cacheKey)
      return this.cache.get(cacheKey) || null
    }

    // Deduplicate concurrent requests for the same track
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey)!
    }

    const request = this.doSearch(query, cacheKey)
    this.pendingRequests.set(cacheKey, request)

    try {
      return await request
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }

  private async doSearch(query: TrackQuery, cacheKey: string): Promise<Lyrics | null> {
    let plainFallback: Lyrics | null = null

    for (const provider of this.providers) {
      if (!provider.isEnabled()) {
        console.log(`[LyricsService] Skipping disabled provider: ${provider.name}`)
        continue
      }

      try {
        console.log(`[LyricsService] Trying provider: ${provider.name}`)
        const result = await provider.search(query)

        if (result) {
          // If we got synced lyrics, use them immediately
          if (result.type === 'synced') {
            console.log(`[LyricsService] Synced lyrics found via ${provider.name}`)
            this.cache.set(cacheKey, result)
            return result
          }

          // Store plain lyrics as fallback, keep searching for synced
          if (result.type === 'plain' && !plainFallback) {
            console.log(`[LyricsService] Plain lyrics found via ${provider.name}, continuing search for synced`)
            plainFallback = result
          }
        }
      } catch (e) {
        console.error(`[LyricsService] Provider ${provider.name} failed:`, e)
        // Continue to next provider
      }
    }

    // No synced lyrics found anywhere — return plain fallback if we have one
    if (plainFallback) {
      this.cache.set(cacheKey, plainFallback)
      return plainFallback
    }

    // Nothing found at all
    this.cache.set(cacheKey, null)
    return null
  }

  clearCache(): void {
    this.cache.clear()
  }

  removeCacheEntry(query: TrackQuery): void {
    this.cache.delete(this.getCacheKey(query))
  }

  private getCacheKey(query: TrackQuery): string {
    return `${query.artist}::${query.title}::${query.album || ''}`.toLowerCase()
  }
}
