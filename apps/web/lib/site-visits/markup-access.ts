import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEstimateFileAccess } from './access';
import { isFrozenCapture } from './photos';

// [S114 C-8, RULED Josh 2026-09-28, Q11 A] — WHO MAY MARK UP A SITE-VISIT
// PHOTO. ONE function, used by the save route
// (`app/api/estimates/[id]/files/[fileId]/markup`) AND both markup pages
// (/m/site-visits/[id]/photos/[fileId]/markup, desktop
// /dashboard/site-visits/[id]/photos/[fileId]/markup) — never inline route logic.
//
// THE RULE: whoever may CAPTURE on this visit (site_visit_access() →
// 'office' | 'staff', the same test the photo upload uses) may mark up a
// captured IMAGE on it — unless that photo is FROZEN (captured at or before
// the send; per photo, Q10 A). A frozen photo is 409 with the reason, which the
// UI shows as a notice, never as a missing or dead control.
//
// ⚠️ WHY A ROUTE AND NOT WIDER POLICIES (#136 deliberately NOT applied here).
// #136 says authority belongs in the database. The database-only alternative
// was to widen the `files` UPDATE and `storage.objects` arms for site-visit
// captures (project_id IS NULL). But `project_files_update_non_client`
// authorises a storage write on ANY object whose path matches a `files` row the
// caller can see — so the same widening would let those roles OVERWRITE THE
// ORIGINAL PHOTO's bytes, and the freeze trigger guards only the `files` ROW,
// never the object. The route writes exactly two things (markup_data and the
// `.markup.jpg` derivative) with the service role, after this check, and the
// freeze trigger still fires on the row write behind it. The route is the
// NARROWER instrument, not the lazier one. Do not "fix" this by widening the
// policies.
//
// ORDER IS ACCESS CONTROL (the s107/s109 pattern): every read before `ok` goes
// through the caller's SESSION client; the service-role client is obtained
// from `getAdmin` only after the session floor passes.

export const SITE_VISIT_FROZEN_ERROR = "Part of a sent estimate — can't be annotated.";

export interface SiteVisitMarkupFile {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  markup_data: unknown;
  created_at: string | null;
}

export type SiteVisitMarkupAccess =
  | { ok: true; companyId: string; file: SiteVisitMarkupFile; admin: SupabaseClient }
  | { ok: false; status: 403 | 404 | 409 | 500; error: string; frozen?: true };

export async function authorizeSiteVisitMarkup(
  session: SupabaseClient,
  getAdmin: () => SupabaseClient,
  userId: string,
  estimateId: string,
  fileId: string
): Promise<SiteVisitMarkupAccess> {
  const access = await resolveEstimateFileAccess(session, userId, estimateId);
  if (!access.ok) return { ok: false, status: access.status, error: access.error };
  if (!access.canCapture) {
    return { ok: false, status: 403, error: 'You cannot mark up photos on this site visit.' };
  }

  const admin = getAdmin();
  const { data: file, error } = await admin
    .from('files')
    .select('id, file_path, file_name, mime_type, markup_data, created_at')
    .eq('id', fileId)
    .eq('estimate_id', estimateId)
    .eq('company_id', access.companyId)
    .eq('site_visit_capture', true)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) {
    console.error('[authorizeSiteVisitMarkup] file lookup failed', {
      check: 'admin files select (session floor passed)',
      estimateId,
      fileId,
      message: error.message,
    });
    return { ok: false, status: 500, error: 'Could not open the photo.' };
  }
  if (!file || !String(file.mime_type).startsWith('image/')) {
    return { ok: false, status: 404, error: 'Photo not found on this site visit.' };
  }

  const { data: visit } = await admin
    .from('site_visits')
    .select('frozen_at')
    .eq('estimate_id', estimateId)
    .maybeSingle();
  if (
    isFrozenCapture(file.created_at as string | null, (visit?.frozen_at as string | null) ?? null)
  ) {
    return { ok: false, status: 409, error: SITE_VISIT_FROZEN_ERROR, frozen: true };
  }

  return { ok: true, companyId: access.companyId, file: file as SiteVisitMarkupFile, admin };
}
