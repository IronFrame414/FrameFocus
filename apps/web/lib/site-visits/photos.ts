// WHICH PHOTOS THE SITE-VISIT RECORD SHOWS, and how they are grouped.
//
// [S110, RULED Josh Q4 → A] — the record shows SITE-VISIT CAPTURES (files
// marked `site_visit_capture`: photos taken through the record, at any status),
// in two groups split at the visit's `frozen_at`:
//   · "Captured before the estimate was sent" — created at or before frozen_at
//     (everything, while there is no frozen_at yet);
//   · "Added after it was sent" — created after it.
// Photos an estimator drops in through the ordinary Files tab are not captures,
// and stay in Files.
//
// _SUPERSEDED — S108 ruling 4, quoted rather than deleted:_ "[Josh, 2026-09-23,
// ruling 4] VISIT-ERA PHOTOS ONLY on the site-visit record. 'The tab shows what
// was captured during the visit; anything added after promotion lives in
// Files.' THE CUTOFF IS PROMOTION (site_visits.promoted_at), not finish … Not
// yet promoted → every image on the estimate is visit-era." Ruling 2 removed
// the premise (promotion no longer ends anyone's writes), and a time cutoff
// could not tell a site photo from a Files-tab upload — the marker can.
//
// Presentation, not access control: the ROUTE decides who may read which file
// (lib/site-visits/access.ts). Both timestamps are the database's now().

export interface CapturedFile {
  mime_type: string;
  created_at: string | null;
  site_visit_capture: boolean;
}

export type Phase = 'before' | 'after';

/** Captured images, each tagged before/after the send. Undated → 'before'. */
export function sitePhotos<T extends CapturedFile>(files: T[], frozenAt: string | null): Array<T & { phase: Phase }> {
  const cutoff = frozenAt ? new Date(frozenAt).getTime() : null;
  return files
    .filter((f) => f.site_visit_capture && f.mime_type.startsWith('image/'))
    .map((f) => ({
      ...f,
      phase: (cutoff !== null && f.created_at && new Date(f.created_at).getTime() > cutoff ? 'after' : 'before') as Phase,
    }));
}

/** Any dated item (a note, a measurement, a voice note): added after the send? */
export function addedAfterSend(createdAt: string | null | undefined, frozenAt: string | null): boolean {
  if (!frozenAt || !createdAt) return false;
  return new Date(createdAt).getTime() > new Date(frozenAt).getTime();
}
