import type { FoxHighlightVideo, HighlightSource, HighlightVideo, YouTubeHighlightVideo } from './types'

const FOX_EMBED_BASE = 'https://statics.foxsports.com/static/orion/player-embed.html'
const FOX_WATCH_BASE = 'https://www.foxsports.com/watch'

export function highlightSource(v: HighlightVideo): HighlightSource {
  return v.source ?? 'youtube'
}

export function isYouTubeHighlight(v: HighlightVideo): v is YouTubeHighlightVideo {
  return highlightSource(v) === 'youtube'
}

export function isFoxHighlight(v: HighlightVideo): v is FoxHighlightVideo {
  return highlightSource(v) === 'fox'
}

export function highlightKey(v: HighlightVideo): string {
  return isFoxHighlight(v) ? `fox:${v.foxId}` : `youtube:${v.youtubeId}`
}

export function preferredHighlightVideos(videos: HighlightVideo[]): HighlightVideo[] {
  const byKind = new Map<HighlightVideo['kind'], HighlightVideo>()
  for (const video of videos) {
    const current = byKind.get(video.kind)
    if (!current || (isFoxHighlight(current) && isYouTubeHighlight(video))) {
      byKind.set(video.kind, video)
    }
  }
  return [...byKind.values()]
}

export function foxWatchUrl(foxId: string): string {
  return `${FOX_WATCH_BASE}/${foxId}`
}

export function foxEmbedUrl(foxId: string): string {
  return `${FOX_EMBED_BASE}?id=${encodeURIComponent(foxId)}`
}

export function highlightExternalUrl(v: HighlightVideo): string {
  return isFoxHighlight(v) ? foxWatchUrl(v.foxId) : `https://www.youtube.com/watch?v=${v.youtubeId}`
}

export function highlightEmbedUrl(v: HighlightVideo): string {
  return isFoxHighlight(v)
    ? foxEmbedUrl(v.foxId)
    : `https://www.youtube-nocookie.com/embed/${v.youtubeId}`
}
