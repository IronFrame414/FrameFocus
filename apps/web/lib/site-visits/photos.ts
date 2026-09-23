// [Josh, 2026-09-23, ruling 4] VISIT-ERA PHOTOS ONLY on the site-visit record.
// "The tab shows what was captured during the visit; anything added after
// promotion lives in Files."
//
// THE CUTOFF IS PROMOTION (site_visits.promoted_at), not finish:
//   · Finishing is not a lock (ASK-A8) — the recorder may still add a missed
//     shot between Finish and promotion, and that shot is visit evidence.
//     So a photo uploaded between finish and promotion IS visit-era.
//   · Promotion is the boundary the rest of the rules already use: it is
//     where the recorder loses upload (Q3 condition 1) and the estimate begins.
//   · Inclusive (created_at <= promoted_at). Both timestamps are the
//     database's now(), so there is no client clock in the comparison.
//   · Not yet promoted → every image on the estimate is visit-era: a site
//     visit has no Files tab (the builder redirects it), so the only way a
//     photo lands on it is through the visit.
//
// Presentation, not access control: nothing here hides a file from someone
// entitled to it — the Files tab still lists every file on the estimate.

export interface DatedFile {
  mime_type: string;
  created_at: string | null;
}

export function visitEraPhotos<T extends DatedFile>(files: T[], promotedAt: string | null): T[] {
  const cutoff = promotedAt ? new Date(promotedAt).getTime() : null;
  return files.filter((f) => {
    if (!f.mime_type.startsWith('image/')) return false;
    if (cutoff === null) return true;
    if (!f.created_at) return false;
    return new Date(f.created_at).getTime() <= cutoff;
  });
}
