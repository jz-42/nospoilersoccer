import type { CSSProperties } from 'react'

/**
 * Adaptive ink: the sheet's quiet text and icons are translucent white, which
 * fades into a light side (Argentina's sky blue, Brazil's yellow). The
 * lighter the brighter side, the more opaque the ink and the firmer its
 * shadow, so it reads on anything without going heavy on dark sides.
 */
export function inkVars(tint: Record<string, string>): CSSProperties {
  const light = Math.max(luminance(tint['--home-1']), luminance(tint['--away-1']))
  const k = Math.min(1, Math.max(0, (light - 0.2) / 0.45))
  return {
    '--ink-soft': `rgba(242, 246, 250, ${(0.68 + 0.24 * k).toFixed(3)})`,
    '--ink-icon': `rgba(242, 246, 250, ${(0.72 + 0.24 * k).toFixed(3)})`,
    '--ink-shadow': `0 1px ${(2 + 2 * k).toFixed(1)}px rgba(0, 0, 0, ${(0.3 + 0.3 * k).toFixed(3)})`,
    '--ink-drop': `drop-shadow(0 1px ${(1.5 + 1.5 * k).toFixed(1)}px rgba(0, 0, 0, ${(0.3 + 0.35 * k).toFixed(3)}))`,
  } as CSSProperties
}

function luminance(hex: string | undefined): number {
  const m = hex && /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
