// ─── Lyrics Provider Service ─────────────────────────────────────────────────
// Orchestrates multiple lyrics providers in fallback order.
// Handles caching, deduplication, and normalization.

import type { LyricsProvider, TrackQuery, Lyrics } from '../types/lyrics'

/** True if a result carries word-level timing on at least one line (karaoke-ready). */
function hasWordTiming(lyrics: Lyrics): boolean {
  return lyrics.type === 'synced' && lyrics.lines.some(l => l.words && l.words.length > 0)
}

export class LyricsProviderService {
  private providers: LyricsProvider[] = []
  private cache = new Map<string, Lyrics | null>()
  private pendingRequests = new Map<string, Promise<Lyrics | null>>()
  /**
   * When true (karaoke mode), a line-level synced result does NOT short-circuit
   * the search — we keep probing later providers (e.g. Musixmatch RichSync) for
   * word-level timing and prefer that. Trades extra network calls for the karaoke
   * visual, which is the priority for this app.
   */
  private preferWordTiming: boolean = false

  setProviders(providers: LyricsProvider[]): void {
    this.providers = providers
  }

  setPreferWordTiming(value: boolean): void {
    this.preferWordTiming = value
  }

  /**
   * Searches all enabled providers in order until lyrics are found.
   * Results are cached by track identity.
   */
  async search(query: TrackQuery): Promise<Lyrics | null> {
    const cacheKey = this.getCacheKey(query)

    // Check cache first.
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
    // A line-level synced result we'll fall back to if no word-level one shows up.
    let syncedFallback: Lyrics | null = null

    for (const provider of this.providers) {
      if (!provider.isEnabled()) {
        console.log(`[LyricsService] Skipping disabled provider: ${provider.name}`)
        continue
      }

      try {
        console.log(`[LyricsService] Trying provider: ${provider.name}`)
        const result = await provider.search(query)

        if (result) {
          if (result.type === 'synced') {
            const hasWords = hasWordTiming(result)

            // Word-level (karaoke) timing always wins immediately.
            if (hasWords) {
              console.log(`[LyricsService] Word-level synced lyrics found via ${provider.name}`)
              this.cache.set(cacheKey, result)
              return result
            }

            // Line-level synced: in karaoke mode keep probing later providers
            // (e.g. Musixmatch RichSync) for word timing; otherwise use it now.
            if (!this.preferWordTiming) {
              console.log(`[LyricsService] Synced lyrics found via ${provider.name}`)
              this.cache.set(cacheKey, result)
              return result
            }

            if (!syncedFallback) {
              console.log(`[LyricsService] Line-level synced via ${provider.name}, continuing search for word-level`)
              syncedFallback = result
            }
            continue
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

    // No word-level result — prefer any line-level synced, then plain.
    const best = syncedFallback || plainFallback || null
    this.cache.set(cacheKey, best)
    return best
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
