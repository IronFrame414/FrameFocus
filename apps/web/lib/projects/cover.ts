import { thumbProxyUrl } from '@/lib/photos/thumb-url';

// S128 Part F — the ONE reading of a project's cover, for every staff surface (desktop list,
// desktop project header, /m list). PARITY: not under app/dashboard or app/m, because both use it.
//
// ⚠️ A CLIENT NEVER SEES A COVER (F-2). This module is only ever handed rows that came through a
// staff read (getProjects / getProject) — and project_covers has no client or subcontractor RLS
// policy, so a client's read of the same join returns null. The portal's own reads
// (lib/services/portal.ts getPortalProjects) never select it at all.
//
// ⚠️ F-3: the image is ALWAYS the thumbnail proxy (lib/photos/thumb-proxy.ts) — a stable,
// versioned, `private` URL. Never a signed URL, never the original's bytes.

/** The cover join as getProjects/getProject select it. */
export type ProjectCoverJoin = {
  file_id: string | null;
  file: { id: string; markup_data: unknown; is_deleted: boolean | null; mime_type: string } | null;
} | null;

export const PROJECT_COVER_SELECT =
  'cover:project_covers(file_id, file:files(id, markup_data, is_deleted, mime_type))';

/**
 * The cover's image URL, or null for the empty state:
 *   · no photos yet / no cover row                → null
 *   · the cover was permanently deleted (file_id NULL, F-5) → null
 *   · the cover is TRASHED (F-5)                  → null — the pointer is kept, so restoring the
 *                                                   photo brings the cover back by itself
 */
export function coverThumbSrc(cover: ProjectCoverJoin | undefined): string | null {
  const f = cover?.file;
  if (!f || f.is_deleted) return null;
  return thumbProxyUrl(f.id, f.markup_data);
}
