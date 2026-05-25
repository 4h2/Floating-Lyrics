// ─── Screenshot Service ──────────────────────────────────────────────────────
// Generates a premium "story card" from the current lyric + album art.
// Renders entirely via an offscreen <canvas> for maximum quality.

export interface LyricCardOptions {
  lyricText: string
  songTitle: string
  artistName: string
  albumArtUrl: string | null
  glowColor: string        // CSS color for text glow
  accentColor: string      // CSS color for accent elements
}

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1920

/**
 * Generate a premium lyric card as a data URL (PNG).
 */
export async function generateLyricCard(options: LyricCardOptions): Promise<string> {
  const { lyricText, songTitle, artistName, albumArtUrl, glowColor, accentColor } = options

  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')!

  // ── Background: album art (blurred) + dark overlay ───────────────────
  if (albumArtUrl) {
    const img = await loadImage(albumArtUrl)
    // Draw scaled to fill
    const scale = Math.max(CARD_WIDTH / img.width, CARD_HEIGHT / img.height)
    const w = img.width * scale
    const h = img.height * scale
    const x = (CARD_WIDTH - w) / 2
    const y = (CARD_HEIGHT - h) / 2

    ctx.filter = 'blur(60px) brightness(0.4) saturate(1.4)'
    ctx.drawImage(img, x, y, w, h)
    ctx.filter = 'none'
  } else {
    // Fallback: dark gradient
    const grad = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT)
    grad.addColorStop(0, '#0a0a1a')
    grad.addColorStop(1, '#1a0a2a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
  }

  // ── Dark overlay for contrast ────────────────────────────────────────
  const overlay = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT)
  overlay.addColorStop(0, 'rgba(0, 0, 0, 0.3)')
  overlay.addColorStop(0.5, 'rgba(0, 0, 0, 0.4)')
  overlay.addColorStop(1, 'rgba(0, 0, 0, 0.6)')
  ctx.fillStyle = overlay
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // ── Lyric Text (center) ──────────────────────────────────────────────
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const lyricFontSize = calculateFontSize(ctx, lyricText, CARD_WIDTH - 160, 64)
  ctx.font = `800 ${lyricFontSize}px "Inter", "Segoe UI", system-ui, sans-serif`

  // Glow layers
  ctx.shadowColor = glowColor
  ctx.shadowBlur = 80
  ctx.fillStyle = '#ffffff'
  ctx.fillText(lyricText, CARD_WIDTH / 2, CARD_HEIGHT * 0.45, CARD_WIDTH - 120)

  // Second pass for stronger glow
  ctx.shadowBlur = 40
  ctx.fillText(lyricText, CARD_WIDTH / 2, CARD_HEIGHT * 0.45, CARD_WIDTH - 120)

  // Clean text on top
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
  ctx.fillText(lyricText, CARD_WIDTH / 2, CARD_HEIGHT * 0.45, CARD_WIDTH - 120)

  // ── Wrap long lyrics ─────────────────────────────────────────────────
  // If text was truncated, re-render with word wrap
  const textWidth = ctx.measureText(lyricText).width
  if (textWidth > CARD_WIDTH - 160) {
    // Clear the lyric area and re-draw with wrapped text
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'

    // Redraw background over lyric area
    if (albumArtUrl) {
      const img = await loadImage(albumArtUrl)
      const scale = Math.max(CARD_WIDTH / img.width, CARD_HEIGHT / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const xPos = (CARD_WIDTH - w) / 2
      const yPos = (CARD_HEIGHT - h) / 2
      ctx.filter = 'blur(60px) brightness(0.4) saturate(1.4)'
      ctx.drawImage(img, xPos, yPos, w, h)
      ctx.filter = 'none'
    }
    ctx.fillStyle = overlay
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)
    ctx.restore()

    // Draw wrapped
    const wrappedFontSize = Math.min(lyricFontSize, 52)
    ctx.font = `800 ${wrappedFontSize}px "Inter", "Segoe UI", system-ui, sans-serif`
    drawWrappedText(ctx, lyricText, CARD_WIDTH / 2, CARD_HEIGHT * 0.42, CARD_WIDTH - 160, wrappedFontSize * 1.4, glowColor)
  }

  // ── Bottom Section: album art thumb + song info + watermark ──────────
  const bottomY = CARD_HEIGHT - 280

  // Album art thumbnail
  if (albumArtUrl) {
    const img = await loadImage(albumArtUrl)
    const thumbSize = 80
    const thumbX = CARD_WIDTH / 2 - thumbSize / 2
    const thumbY = bottomY

    // Rounded rect clip
    ctx.save()
    roundRect(ctx, thumbX, thumbY, thumbSize, thumbSize, 12)
    ctx.clip()
    ctx.drawImage(img, thumbX, thumbY, thumbSize, thumbSize)
    ctx.restore()

    // Subtle border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 1
    roundRect(ctx, thumbX, thumbY, thumbSize, thumbSize, 12)
    ctx.stroke()
  }

  // Song title
  ctx.textAlign = 'center'
  ctx.font = '600 28px "Inter", "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.shadowBlur = 0
  ctx.fillText(songTitle, CARD_WIDTH / 2, bottomY + 110, CARD_WIDTH - 120)

  // Artist name
  ctx.font = '400 22px "Inter", "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.fillText(artistName, CARD_WIDTH / 2, bottomY + 145, CARD_WIDTH - 120)

  // Watermark
  ctx.font = '500 16px "Inter", "Segoe UI", system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.fillText('Floating Lyrics', CARD_WIDTH / 2, CARD_HEIGHT - 60)

  // ── Accent line ──────────────────────────────────────────────────────
  ctx.fillStyle = accentColor
  ctx.globalAlpha = 0.3
  ctx.fillRect(CARD_WIDTH / 2 - 30, bottomY + 170, 60, 2)
  ctx.globalAlpha = 1.0

  return canvas.toDataURL('image/png')
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function calculateFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number
): number {
  let size = startSize
  ctx.font = `800 ${size}px "Inter", "Segoe UI", system-ui, sans-serif`
  while (ctx.measureText(text).width > maxWidth && size > 28) {
    size -= 2
    ctx.font = `800 ${size}px "Inter", "Segoe UI", system-ui, sans-serif`
  }
  return size
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  glowColor: string,
): void {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = test
    }
  }
  if (currentLine) lines.push(currentLine)

  const totalHeight = lines.length * lineHeight
  const startY = y - totalHeight / 2 + lineHeight / 2

  for (let i = 0; i < lines.length; i++) {
    const ly = startY + i * lineHeight

    // Glow
    ctx.shadowColor = glowColor
    ctx.shadowBlur = 60
    ctx.fillStyle = '#ffffff'
    ctx.fillText(lines[i], x, ly)

    // Clean
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    ctx.fillText(lines[i], x, ly)
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
