import type { PlaylistVideo, VideoMeta } from './youtube'

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
