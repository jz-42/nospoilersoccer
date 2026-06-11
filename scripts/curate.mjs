#!/usr/bin/env node
/**
 * Curation helper for spoiler-free highlight videos.
 *
 * Usage:
 *   node scripts/curate.mjs playlist <playlistId>   # list videos in a playlist
 *   node scripts/curate.mjs check <videoId>...      # vet specific videos
 *
 * `playlist` emits one JSON line per video: { videoId, title }.
 * `check` fetches each watch page and reports:
 *   - title (watch for scores/spoilers — a human still decides)
 *   - durationSeconds
 *   - embeddable (playableInEmbed)
 *   - channel
 * Thumbnails are NOT vetted here: download
 * https://i.ytimg.com/vi/<id>/hqdefault.jpg and look at it.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' } })
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  return res.text()
}

function extract(re, html) {
  const m = html.match(re)
  return m ? m[1] : null
}

async function checkVideo(videoId) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}`)
  const title = extract(/"videoDetails":\{[^]*?"title":"((?:[^"\\]|\\.)*)"/, html)
  const seconds = extract(/"lengthSeconds":"(\d+)"/, html)
  const embeddable = extract(/"playableInEmbed":(true|false)/, html)
  const channel = extract(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/, html)
  return {
    videoId,
    title: title ? JSON.parse(`"${title}"`) : null,
    durationSeconds: seconds ? Number(seconds) : null,
    embeddable: embeddable === 'true',
    channel: channel ? JSON.parse(`"${channel}"`) : null,
  }
}

async function listPlaylist(playlistId) {
  const html = await fetchText(`https://www.youtube.com/playlist?list=${playlistId}`)
  const out = []
  const seen = new Set()
  // Playlist entries are lockupViewModel blocks holding contentId + title.
  for (const block of html.split('"lockupViewModel":').slice(1)) {
    const id = block.match(/"contentId":"([^"]{11})"/)
    const title = block.match(/"title":\{"content":"((?:[^"\\]|\\.)*)"/)
    if (!id || !title || seen.has(id[1])) continue
    seen.add(id[1])
    out.push({ videoId: id[1], title: JSON.parse(`"${title[1]}"`) })
  }
  return out
}

const [, , cmd, ...args] = process.argv
if (cmd === 'playlist' && args[0]) {
  const items = await listPlaylist(args[0])
  for (const item of items) console.log(JSON.stringify(item))
  console.error(`${items.length} videos`)
} else if (cmd === 'check' && args.length > 0) {
  for (const id of args) {
    console.log(JSON.stringify(await checkVideo(id)))
    await new Promise((r) => setTimeout(r, 300))
  }
} else {
  console.error('usage: curate.mjs playlist <playlistId> | check <videoId>...')
  process.exit(1)
}
