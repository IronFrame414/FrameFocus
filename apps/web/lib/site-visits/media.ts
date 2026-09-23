import { visitEraPhotos } from '@/lib/site-visits/photos';

/**
 * S109 photo regression — the site-visit record signs its OWN media.
 *
 * WHAT BROKE. `SiteVisitRecord` read `url` off `GET /api/estimates/[id]/files`,
 * which used to sign every file for 300 s at list time. #161 (ruling 161.B)
 * removed that signing — correctly: list-time links died five minutes after
 * load — and the record was a second consumer of the list that #161's sweep
 * missed. Every photo tile fell to the grey fallback and every voice-note
 * player vanished, on /m and on both desktop mounts. Deployed 2026-09-23.
 *
 * THE FIX, RULED [Josh]: the list stays URL-free (`desktop-file-sheet-s109`
 * S2 asserts it). Each media file is resolved through the per-file route
 * `GET /api/estimates/[id]/files/[fileId]/url` — the same
 * `resolveEstimateFileAccess()` floor as the list, before the service role —
 * in PARALLEL, on load. A resolve that fails yields `url: null`, which the
 * record already renders as its fallback; it never throws and never takes
 * the rest of the grid with it.
 *
 * REQUEST COUNT: 1 list request + 1 per visit-era photo + 1 per audio file.
 * Only files the record DISPLAYS are signed — later (post-promotion) photos,
 * PDFs and the like are not.
 */

export interface ListedFile {
  id: string;
  file_name: string;
  mime_type: string;
  created_at: string | null;
}

export interface ResolvedMediaFile extends ListedFile {
  url: string | null;
}

type FetchLike = (input: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

async function resolveOne(estimateId: string, fileId: string, fetchImpl: FetchLike): Promise<string | null> {
  try {
    const res = await fetchImpl(`/api/estimates/${estimateId}/files/${fileId}/url`);
    if (!res.ok) return null;
    const body = (await res.json()) as { url?: unknown };
    return typeof body.url === 'string' ? body.url : null;
  } catch {
    return null;
  }
}

export async function resolveSiteVisitMedia(
  estimateId: string,
  files: ListedFile[],
  promotedAt: string | null,
  fetchImpl: FetchLike
): Promise<{ photos: ResolvedMediaFile[]; audioUrls: Record<string, string | null> }> {
  const photoFiles = visitEraPhotos(files, promotedAt);
  const audioFiles = files.filter((f) => f.mime_type.startsWith('audio/'));

  const [photoUrls, audioList] = await Promise.all([
    Promise.all(photoFiles.map((f) => resolveOne(estimateId, f.id, fetchImpl))),
    Promise.all(audioFiles.map((f) => resolveOne(estimateId, f.id, fetchImpl))),
  ]);

  return {
    photos: photoFiles.map((f, i) => ({ ...f, url: photoUrls[i] })),
    audioUrls: Object.fromEntries(audioFiles.map((f, i) => [f.id, audioList[i]])),
  };
}
