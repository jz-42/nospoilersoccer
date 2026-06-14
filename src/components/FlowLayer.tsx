import { useLayoutEffect, useRef, useState } from 'react'

/**
 * A flow line between two measured DOM nodes inside the bracket scroll box.
 * `srcKey` / `tgtKey` match `data-feed-src` / `data-feed-tgt` attributes.
 * `show` controls whether the line is always drawn or only while focused;
 * `tone` colours it by meaning (green = advancing for sure, yellow = maybe,
 * red = eliminated, grey = the losers' path to the third-place match).
 */
export interface FeedLink {
  id: string
  srcKey: string
  tgtKey: string
  show: 'always' | 'focus'
  tone: 'green' | 'yellow' | 'red' | 'grey'
  on: boolean
}

interface Point {
  x: number
  y: number
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Both endpoints in content coordinates, with edges chosen by direction. */
function endpoints(
  container: HTMLElement,
  crect: DOMRect,
  srcKey: string,
  tgtKey: string,
): { src: Point; tgt: Point; horiz: boolean } | null {
  const s = container.querySelector<HTMLElement>(`[data-feed-src="${srcKey}"]`)
  const t = container.querySelector<HTMLElement>(`[data-feed-tgt="${tgtKey}"]`)
  if (!s || !t) return null
  const sx = container.scrollLeft
  const sy = container.scrollTop
  const box = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return { l: r.left - crect.left + sx, t: r.top - crect.top + sy, w: r.width, h: r.height }
  }
  const a = box(s)
  const b = box(t)
  const acx = a.l + a.w / 2
  const acy = a.t + a.h / 2
  const bcx = b.l + b.w / 2
  const bcy = b.t + b.h / 2
  const dx = bcx - acx
  const dy = bcy - acy
  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      horiz: true,
      src: { x: dx > 0 ? a.l + a.w : a.l, y: acy },
      tgt: { x: dx > 0 ? b.l : b.l + b.w, y: bcy },
    }
  }
  return {
    horiz: false,
    src: { x: acx, y: dy > 0 ? a.t + a.h : a.t },
    tgt: { x: bcx, y: dy > 0 ? b.t : b.t + b.h },
  }
}

function path(src: Point, tgt: Point, horiz: boolean): string {
  if (horiz) {
    const dx = Math.max(24, Math.abs(tgt.x - src.x) * 0.4)
    const c1x = src.x < tgt.x ? src.x + dx : src.x - dx
    const c2x = tgt.x < src.x ? tgt.x + dx : tgt.x - dx
    return `M ${src.x} ${src.y} C ${c1x} ${src.y}, ${c2x} ${tgt.y}, ${tgt.x} ${tgt.y}`
  }
  const dy = Math.max(20, Math.abs(tgt.y - src.y) * 0.5)
  const c1y = src.y < tgt.y ? src.y + dy : src.y - dy
  const c2y = tgt.y < src.y ? tgt.y + dy : tgt.y - dy
  return `M ${src.x} ${src.y} C ${src.x} ${c1y}, ${tgt.x} ${c2y}, ${tgt.x} ${tgt.y}`
}

/**
 * Draws the feed lines as an absolutely-positioned SVG spanning the bracket's
 * full scroll content, so the lines scroll with it. `show: 'always'` lines draw
 * whenever both ends exist; `show: 'focus'` lines draw only while pinned/hovered
 * (their endpoints in activeKeys). Every line is clipped against a mask of the
 * match cards and side leaderboards, so a line that runs past a game is cut at
 * its edge — it reads as tucking behind the match rather than fading through it.
 */
export function FlowLayer({
  boardRef,
  links,
  activeKeys,
  marksSig,
}: {
  boardRef: React.RefObject<HTMLDivElement | null>
  links: FeedLink[]
  activeKeys: ReadonlySet<string>
  marksSig: string
}) {
  const [segments, setSegments] = useState<{ id: string; d: string; cls: string }[]>([])
  const [mask, setMask] = useState<Rect[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const raf = useRef(0)

  useLayoutEffect(() => {
    const container = boardRef.current
    if (!container) return

    const measure = () => {
      const crect = container.getBoundingClientRect()
      const sx = container.scrollLeft
      const sy = container.scrollTop

      const out: { id: string; d: string; cls: string }[] = []
      for (const link of links) {
        const active = activeKeys.has(link.srcKey) || activeKeys.has(link.tgtKey)
        if (link.show === 'focus' && !active) continue
        const ends = endpoints(container, crect, link.srcKey, link.tgtKey)
        if (!ends) continue
        const state = active ? 'is-active' : link.on ? 'is-on' : 'faint'
        out.push({
          id: link.id,
          d: path(ends.src, ends.tgt, ends.horiz),
          cls: `flow-line ${state} tone-${link.tone}`,
        })
      }
      // Active lines paint last so they sit above the always-on ones.
      out.sort((a, b) => Number(a.cls.includes('is-active')) - Number(b.cls.includes('is-active')))

      const pad = 3
      const rects: Rect[] = []
      container.querySelectorAll<HTMLElement>('.ko-card, .ko-flank .feed-table').forEach((el) => {
        const r = el.getBoundingClientRect()
        rects.push({
          x: r.left - crect.left + sx - pad,
          y: r.top - crect.top + sy - pad,
          w: r.width + pad * 2,
          h: r.height + pad * 2,
        })
      })

      setSize({ w: container.scrollWidth, h: container.scrollHeight })
      setMask(rects)
      setSegments(out)
    }

    const schedule = () => {
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(measure)
    }

    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(container)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(raf.current)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [boardRef, links, activeKeys, marksSig])

  return (
    <svg
      className="flow-layer"
      width={size.w}
      height={size.h}
      aria-hidden="true"
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      <defs>
        <mask id="flow-occlude" maskUnits="userSpaceOnUse" x="0" y="0" width={size.w} height={size.h}>
          <rect x="0" y="0" width={size.w} height={size.h} fill="white" />
          {mask.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx="8" fill="black" />
          ))}
        </mask>
      </defs>
      <g mask="url(#flow-occlude)">
        {segments.map((s) => (
          <path key={s.id} d={s.d} className={s.cls} fill="none" />
        ))}
      </g>
    </svg>
  )
}
