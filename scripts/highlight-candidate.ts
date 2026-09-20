import type { PlaylistVideo, VideoMeta } from './youtube'

export function parseTargetedMetadata(
  videoId: string,
  input: { title?: string; channelId?: string; publishedAt?: string },
): VideoMeta | null {
  const values = [input.title, input.channelId, input.publishedAt]
  if (values.every((value) => !value)) return null
  if (!input.title || !input.channelId || !input.publishedAt) {
    throw new Error('supplied candidate metadata must include title, channel id, and publish time')
  }
  if (!/^UC[A-Za-z0-9_-]+$/.test(input.channelId)) throw new Error('supplied candidate channel id is invalid')
  if (!Number.isFinite(Date.parse(input.publishedAt))) throw new Error('supplied candidate publish time is invalid')
  return {
    id: videoId,
    title: input.title,
    durationSeconds: 0,
    channelId: input.channelId,
    channelTitle: null,
    publishedAt: input.publishedAt,
  }
}

export async function loadTargetedMetadata(
  videoId: string,
  expectedChannelId: string,
  provided: VideoMeta | null,
  getFromFeed: (id: string, channelId: string) => Promise<VideoMeta>,
  getFallback: (id: string) => Promise<VideoMeta>,
): Promise<VideoMeta> {
  let metadata: VideoMeta
  if (provided) metadata = provided
  else {
    try {
      metadata = await getFromFeed(videoId, expectedChannelId)
    } catch (feedError) {
      try {
        metadata = await getFallback(videoId)
      } catch (fallbackError) {
        throw new AggregateError(
          [feedError, fallbackError],
          `metadata unavailable for ${videoId} from both channel feed and fallback`,
          { cause: fallbackError },
        )
      }
    }
  }
  if (metadata.id !== videoId) throw new Error(`metadata returned the wrong video id for ${videoId}`)
  if (metadata.channelId !== expectedChannelId) {
    throw new Error(`video ${videoId} does not belong to expected channel ${expectedChannelId}`)
  }
  return metadata
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
