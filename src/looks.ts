import { useSyncExternalStore } from 'react'

/**
 * Design alternatives being compared in the match-sheet lab
 * (.context/modallab). The app always runs the originals; only the lab
 * switches looks, live, so each can be judged inside the real site. Once one
 * is picked, port it in and delete its switch.
 *
 * Each look is also mirrored onto <html data-look-*> for the CSS side.
 */
export interface Looks {
  /**
   * The poster's play button, YouTube-coded so it reads as "watch it here":
   * our red lozenge, YouTube's own button, YouTube's older dark one that
   * turns red on hover, or YouTube's shape and red in the sheet's glass.
   */
  play: 'youtube' | 'yt-real' | 'yt-dark' | 'yt-glass'
  /** Watch Later: the corner clock, or a bare clock that mirrors Close. */
  save: 'original' | 'bare'
  /** The small reveals: main's rows, this branch's chip, or one ball that opens as a pill or a card. */
  peeks: 'row' | 'chip' | 'pill' | 'card'
  /** The Reveal Result button: green, frosted white, or white tinted with the kits. */
  result: 'green' | 'frost' | 'tint'
  /**
   * What a tap on Reveal Result does before the score arrives: the frost
   * thaws off the glass, off the two kits, or off the winner's colour.
   */
  revealFx: 'none' | 'thaw' | 'kits' | 'winner'
  /** How the frost clears in a thaw: shedding grains, grain only at its edge, a soft mist, or a lit rim. */
  thawClear: 'grains' | 'edge' | 'mist' | 'rim'
  /** The sheet once the result is out: as it was, the winner's colour taking the field, that plus the loser dimmed, or the lights left on the winner. */
  revealed: 'plain' | 'seam' | 'dim' | 'lit'
  /** When the winner's colour moves: early, while the score rolls in, or as it lands, with the dim. */
  settle: 'early' | 'landed'
  /** How the score arrives: at once, or rolling in out of a blur. */
  scoreIn: 'instant' | 'roll'
  /** The end of a video: a prompt 9 seconds early, or full time and a short countdown to the result. */
  autoReveal: 'off' | 'countdown'
  /** The blur settings inside the player: none, a small disc, a bare glyph, or in the title bar. */
  blurInPlayer: 'none' | 'disc' | 'glyph' | 'title'
  /** The mark outside the player: always, or only until the player can take over. */
  blurOutside: 'always' | 'before-play'
  /** What the blur settings open as: the popover, or a sheet over a blurred page. */
  coversSheet: 'popover' | 'sheet'
  /** The chapter-name cover: the 40px band, or a slim line that hugs the text. */
  chapter: 'original' | 'slim'
  /** The sheet's text and icon ink: fixed, or tuned to how light the team colours are. */
  ink: 'original' | 'adaptive'
}

export const ORIGINAL_LOOKS: Looks = {
  play: 'youtube',
  save: 'original',
  peeks: 'chip',
  result: 'green',
  revealFx: 'none',
  thawClear: 'grains',
  revealed: 'plain',
  settle: 'early',
  scoreIn: 'instant',
  autoReveal: 'off',
  blurInPlayer: 'none',
  blurOutside: 'always',
  coversSheet: 'popover',
  chapter: 'original',
  ink: 'original',
}

const listeners = new Set<() => void>()
let current: Looks = ORIGINAL_LOOKS

function mirror(looks: Looks) {
  if (typeof document === 'undefined') return
  const data = document.documentElement.dataset
  for (const [k, v] of Object.entries(looks)) data[`look${k[0].toUpperCase()}${k.slice(1)}`] = v
}

export function setLooks(next: Looks) {
  current = next
  mirror(next)
  listeners.forEach((l) => l())
}

export function useLooks(): Looks {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => ORIGINAL_LOOKS,
  )
}
