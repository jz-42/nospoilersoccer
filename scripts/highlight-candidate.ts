import type { PlaylistVideo, VideoMeta } from './youtube'

export async function loadTargetedMetadata(
  videoId: string,
  expectedChannelId: string,
  getFromFeed: (id: string, channelId: string) => Promise<VideoMeta>,
  getFallback: (id: string) => Promise<VideoMeta>,
): Promise<VideoMeta> {
  try {
    return await getFromFeed(videoId, expectedChannelId)
  } catch (feedError) {
    try {
      return await getFallback(videoId)
    } catch (fallbackError) {
      throw new AggregateError(
        [feedError, fallbackError],
        `metadata unavailable for ${videoId} from both channel feed and fallback`,
        { cause: fallbackError },
      )
    }
  }
}

export async function loadTargetedUploads(
  videoId: string | null,
  listUploads: () => Promise<PlaylistVideo[]>,
  getMetadata: (id: string) => Promise<VideoMeta>,
): Promise<{ uploads: PlaylistVideo[]; metadata: VideoMeta | null }> {
  if (!videoId) return { uploads: await listUploads(), metadata: null }
  const metadata = await getMetadata(videoId)
  return {
    uploads: [{ id: metadata.id, title: metadata.title }],
    metadata,
  }
}
