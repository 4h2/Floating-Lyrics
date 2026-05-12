// ─── Fallback Static Lyrics Provider ─────────────────────────────────────────
// Last-resort provider. If a previous provider returned PlainLyrics, this won't
// be needed. This simply acts as a structural placeholder in the chain.

import type { LyricsProvider, TrackQuery, Lyrics } from '../types/lyrics'

export class FallbackStaticProvider implements LyricsProvider {
  readonly name = 'FallbackStaticProvider'

  isEnabled(): boolean {
    return true
  }

  async search(_query: TrackQuery): Promise<Lyrics | null> {
    // This provider doesn't fetch from any source.
    // It exists as the end of the chain — if we get here, no lyrics were found.
    return null
  }
}
