import { createClient } from '@/lib/supabase-server';
import { hasMarkup, derivativePathFor } from '@framefocus/shared/utils/markup';
import type { MarkupData } from '@framefocus/shared/types/markup';
import { getFiles, getSignedUrl, type FileRecord } from './files';

// M6M §4.8 / §4.9 — server reads for M-8 (gallery), M-9 (viewer) and M-10.
//
// ---------------------------------------------------------------------------
// D-31: THE DERIVATIVE IS THE DISPLAY SOURCE.
// ---------------------------------------------------------------------------
// Every surface that shows a photo shows ONE flat image file. Which file is the
// only decision: the annotated derivative when the photo carries markup, the
// original when it does not. No overlay is drawn at display time on any of the
// three surfaces (A-23f, A-23g).
//
// The URL is resolved HERE, on the server, before the markup ever reaches a
// component — which is what makes A-23s achievable. A component that received
// "the original URL plus some markup" would necessarily paint the original
// first and swap, showing an annotated photo as unannotated for a full network
// round-trip. Under D-31 that is a correctness failure, not a flicker.

/** §4.8's four source badges. `null` = untagged, which renders NO badge (A-22). */
export type PhotoSource = 'log' | 'delivery' | 'safety' | 'punch' | null;

export interface PhotoRecord {
  id: string;
  file_name: string;
  file_path: string;
  created_at: string | null;
  created_by: string | null;
  tags: string[] | null;
  ai_tags: string[] | null;
  /** §4.10 — "a file carrying marks is flagged from markup_data being non-empty". */
  hasMarkup: boolean;
  markup: MarkupData | null;
  source: PhotoSource;
  /** The record the badge points at, for M-9's tappable Source row (A-25c). */
  sourceId: string | null;
  /** THE ONE FILE THIS PHOTO DISPLAYS AS — derivative when annotated (D-31). */
  displayUrl: string | null;
  /** The unannotated original, for M-9's toggle (A-23e) and M-10's canvas. */
  originalUrl: string | null;
  /**
   * Annotated, but the derivative could not be signed — so `displayUrl` fell
   * back to the ORIGINAL and the marks are not on screen. Carried explicitly
   * rather than inferred, because sharing must warn rather than pass an
   * unmarked photo off as marked (A-23t).
   */
  derivativeMissing: boolean;
}

// ---------------------------------------------------------------------------
// D-15 — THE PUNCH BADGE IS A READ-ONLY JOIN. IT WRITES NOTHING (A-22c).
//
// A file is punch-sourced when its id appears in EITHER
// punch_list_items.reference_photo_file_id OR .completion_photo_file_id. Those
// two columns keep their existing, distinct meanings — "the photo that shows
// the problem" and "the photo that shows it fixed" — and this work neither
// merges, alters, nor writes them. No migration was needed and none was made.
// ---------------------------------------------------------------------------
export async function getPunchPhotoIds(projectId: string): Promise<Set<string>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('punch_list_items')
    .select('reference_photo_file_id, completion_photo_file_id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  if (error || !data) return new Set();

  const ids = new Set<string>();
  for (const row of data) {
    if (row.reference_photo_file_id) ids.add(row.reference_photo_file_id);
    if (row.completion_photo_file_id) ids.add(row.completion_photo_file_id);
  }
  return ids;
}

/**
 * §4.8 — "a photo's badge is its provenance — NEVER INVENT ONE."
 *
 * Derived strictly from the link columns the file itself carries, plus the
 * read-only punch join. A photo with no link column set gets `null` and renders
 * no badge at all (A-22) — not an "Other" badge, not a fallback.
 *
 * Order matters only where a file carries more than one link, which the schema
 * permits. Safety first because it is the one an incident review must not miss.
 */
function sourceOf(
  file: FileRecord,
  punchIds: Set<string>
): { source: PhotoSource; sourceId: string | null } {
  if (file.safety_incident_id) return { source: 'safety', sourceId: file.safety_incident_id };
  if (punchIds.has(file.id)) return { source: 'punch', sourceId: null };
  if (file.delivery_id || file.delivery_item_id) {
    return { source: 'delivery', sourceId: file.delivery_id ?? null };
  }
  if (file.daily_log_id) return { source: 'log', sourceId: file.daily_log_id };
  return { source: null, sourceId: null };
}

function readMarkup(raw: unknown): MarkupData | null {
  if (!hasMarkup(raw)) return null;
  return raw as MarkupData;
}

/**
 * Resolve the two URLs a photo needs.
 *
 * A-23t / §4.7a.5 — **a missing derivative degrades to the original.** Under
 * D-31 that is not merely a share concern: if the signed URL for the derivative
 * cannot be produced (never written, or removed), the alternative to showing
 * the original is showing a broken image. It degrades, and `hasMarkup` stays
 * true so the indicator still renders — the user is told the photo is annotated
 * even in the frame where the annotated bytes are unavailable.
 */
async function resolveUrls(
  file: FileRecord,
  annotated: boolean
): Promise<{ displayUrl: string | null; originalUrl: string | null; derivativeMissing: boolean }> {
  const originalUrl = await getSignedUrl(file.file_path);
  if (!annotated) return { displayUrl: originalUrl, originalUrl, derivativeMissing: false };

  // A-23l — the derivative is reached through the SAME signed-URL flow, from
  // the same {company_id}/{project_id}/ prefix. A path that skipped signing
  // would work in testing and leak in production.
  const derivative = await getSignedUrl(derivativePathFor(file.file_path));
  return {
    displayUrl: derivative ?? originalUrl,
    originalUrl,
    derivativeMissing: derivative === null,
  };
}

/** M-8's list. Newest first — §4.8 groups by day, newest day first. */
export async function getProjectPhotos(projectId: string): Promise<PhotoRecord[]> {
  const [files, punchIds] = await Promise.all([
    getFiles({ project_id: projectId, category: 'photos' }),
    getPunchPhotoIds(projectId),
  ]);

  return Promise.all(
    files.map(async (file) => {
      const markup = readMarkup(file.markup_data);
      const annotated = markup !== null;
      const { source, sourceId } = sourceOf(file, punchIds);
      const { displayUrl, originalUrl, derivativeMissing } = await resolveUrls(file, annotated);

      return {
        id: file.id,
        file_name: file.file_name,
        file_path: file.file_path,
        created_at: file.created_at,
        created_by: file.created_by,
        tags: file.tags,
        ai_tags: file.ai_tags,
        hasMarkup: annotated,
        markup,
        source,
        sourceId,
        displayUrl,
        originalUrl,
        derivativeMissing,
      } satisfies PhotoRecord;
    })
  );
}

/** One photo, with the same URL resolution the gallery uses. */
export async function getPhoto(fileId: string, projectId: string): Promise<PhotoRecord | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('files')
    .select('*')
    .eq('id', fileId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (!data) return null;
  const file = data as FileRecord;

  const punchIds = await getPunchPhotoIds(projectId);
  const markup = readMarkup(file.markup_data);
  const annotated = markup !== null;
  const { source, sourceId } = sourceOf(file, punchIds);
  const { displayUrl, originalUrl, derivativeMissing } = await resolveUrls(file, annotated);

  return {
    id: file.id,
    file_name: file.file_name,
    file_path: file.file_path,
    created_at: file.created_at,
    created_by: file.created_by,
    tags: file.tags,
    ai_tags: file.ai_tags,
    hasMarkup: annotated,
    markup,
    source,
    sourceId,
    displayUrl,
    originalUrl,
    derivativeMissing,
  } satisfies PhotoRecord;
}

/**
 * §4.9's "By" metadata row. `files.created_by` is an auth user id, not a
 * company_members id, so the display name comes through profiles — the same
 * hop getMyMember() makes in the other direction.
 */
export async function getUploaderNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return names;

  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name')
    .in('user_id', unique);

  for (const p of data ?? []) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (p.user_id && name) names.set(p.user_id, name);
  }
  return names;
}
