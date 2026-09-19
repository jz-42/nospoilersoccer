/**
 * Regenerates src/assets/crests from ESPN's team-logo CDN.
 *
 * Every club in the registry carries `espnId`, which is also the key ESPN's
 * logo CDN uses, so the whole set is derivable — no hand-maintained mapping
 * table, and a club we add to `clubs.ts` gets its crest by re-running this.
 *
 * Why crests are club marks rather than original art: showing a club's badge
 * to identify a match we're reporting on is nominative use, the same thing
 * every scoreboard and stats site does. Size matters to that argument, so the
 * marks ship as small thumbnails — 256px, which is a badge on a card, not
 * reproduction art — and are drawn at the size of a fixture's team mark:
 * identifying, not decorating. If a rights holder ever objects, swapping a
 * single file back to original art needs no code change.
 *
 * Pipeline per club: fetch the 500px master, trim the transparent padding
 * (ESPN's padding is inconsistent, and untrimmed marks read at different
 * optical weights in the same row), square it, and encode lossy WebP. q90 is
 * the knee of the curve here — 330 KB for all 66 versus 614 KB lossless, with
 * no visible artefact on flat badge colour at render size.
 *
 * Usage: npx tsx scripts/fetch-crests.ts [--dry]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { clubs } from '../src/data/club/clubs'

/**
 * 3x the largest place a crest is drawn — the match sheet's team mark, 75 CSS
 * px — so a phone at DPR 3 gets one source pixel per device pixel and nothing
 * is ever upscaled. At 96 (2x of the 48px mark this started as) every Retina
 * desktop was resampling 96 up to 144 and the fine engraving in a crest —
 * Palace's "1905", the lettering on a ribbon — turned to mush.
 *
 * Resolution beats quality on this kind of art: it is flat colour and hard
 * edges, which WebP encodes almost for free, while detail lost to downscaling
 * is gone forever. 256@q75 is the same total weight as 192@q90 and visibly
 * sharper, and is indistinguishable from 256@q90 at any size we draw.
 */
const SIZE = 256
const QUALITY = 75

const OUT_DIR = fileURLToPath(new URL('../src/assets/crests/', import.meta.url))

function logoUrl(espnId: string): string {
  return `https://a.espncdn.com/i/teamlogos/soccer/500/${espnId}.png`
}

async function fetchLogo(espnId: string): Promise<Buffer> {
  const res = await fetch(logoUrl(espnId), {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/png,image/*' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  // A missing logo comes back as a tiny placeholder rather than a 404, so size
  // is the only reliable signal that we got real art.
  if (buf.length < 800) throw new Error(`suspiciously small (${buf.length} bytes)`)
  return buf
}

async function main() {
  const dry = process.argv.includes('--dry')
  mkdirSync(OUT_DIR, { recursive: true })

  const entries = Object.values(clubs)
  const failures: string[] = []
  let total = 0

  for (const club of entries) {
    const espnId = club.espnId
    if (!espnId) {
      failures.push(`${club.id}: no espnId in the registry`)
      continue
    }
    try {
      const master = await fetchLogo(espnId)
      const webp = await sharp(master)
        .trim({ threshold: 1 })
        .resize(SIZE, SIZE, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .webp({ quality: QUALITY, alphaQuality: 100, effort: 6 })
        .toBuffer()
      total += webp.length
      if (!dry) writeFileSync(`${OUT_DIR}${club.id}.webp`, webp)
    } catch (e) {
      failures.push(`${club.id} (espn ${espnId}): ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const written = entries.length - failures.length
  console.log(
    `${dry ? 'would write' : 'wrote'} ${written}/${entries.length} crests, ${(total / 1024).toFixed(0)} KB total`,
  )
  if (failures.length) {
    // Loud, but not fatal: a single club ESPN has renamed should not stop the
    // other 65 from refreshing. Flag.tsx falls back to a monogram for any club
    // whose file is missing, so a partial set degrades rather than breaks.
    console.error(`\n${failures.length} failed:`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exitCode = 1
  }
}

void main()
