import type { SupabaseClient } from '@supabase/supabase-js';

// S108 Spec A, Q3 → A — WHO MAY REACH AN ESTIMATE'S FILES. One decision, used
// by the estimate-files route AND the site-visit voice route, so the two can
// never disagree about the floor (PARITY [S122]: the rule lives below the UI).
//
// ⚠️ EVERY READ HERE GOES THROUGH THE CALLER'S SESSION CLIENT. The routes use
// the service-role client only AFTER this returns ok — that ordering IS the
// access control (s107-estimate-files-route-order.test.ts asserts it, with a
// mirror case for each arm).
//
// Two arms, tried in order:
//
//   OFFICE — the caller can SELECT the estimate (estimates_select_authenticated:
//     owner/admin any, PM own). Unchanged from S106, with one addition: an
//     owner/admin/PM may attach to a SITE VISIT as well as to a draft.
//
//   RECORDER — the caller cannot see the estimate (a foreman or crew member
//     never can: the row carries money) but RECORDED this visit, read from the
//     money-free `site_visits` table under its own SELECT policy.
//       · READ: their OWN files on it, before AND after promotion (RULED).
//       · UPLOAD: only while the estimate is still a site visit (Q3 condition
//         1). Decided by site_visit_access(), which reads estimates.status
//         server-side — the recorder never reads it themselves.

export type EstimateFileAccess =
  | { ok: true; mode: 'office'; companyId: string; canUpload: boolean; ownFilesOnly: false }
  | { ok: true; mode: 'recorder'; companyId: string; canUpload: boolean; ownFilesOnly: true }
  | { ok: false; status: 403 | 404; error: string };

const NOT_FOUND = { ok: false, status: 404, error: 'Estimate not found' } as const;

export async function resolveEstimateFileAccess(
  supabase: SupabaseClient,
  userId: string,
  estimateId: string
): Promise<EstimateFileAccess> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .single();
  if (!profile) return { ok: false, status: 403, error: 'Profile not found' };
  const role = profile.role as string;
  const office = role === 'owner' || role === 'admin' || role === 'project_manager';

  // ── OFFICE arm: the S106 floor, unchanged ──
  const { data: est } = await supabase
    .from('estimates')
    .select('id, company_id, status, created_by')
    .eq('id', estimateId)
    .maybeSingle();
  if (est) {
    const ownerAdmin = role === 'owner' || role === 'admin';
    const canUpload =
      (est.status === 'draft' && (ownerAdmin || est.created_by === userId)) ||
      (est.status === 'site_visit' && office);
    return { ok: true, mode: 'office', companyId: est.company_id, canUpload, ownFilesOnly: false };
  }

  // ── RECORDER arm: "did you record this visit" — from the money-free table ──
  const { data: visit } = await supabase
    .from('site_visits')
    .select('estimate_id, company_id, created_by, is_deleted')
    .eq('estimate_id', estimateId)
    .eq('created_by', userId)
    .maybeSingle();
  if (!visit || visit.is_deleted) return NOT_FOUND;

  const { data: access } = await supabase.rpc('site_visit_access', { p_estimate_id: estimateId });
  return {
    ok: true,
    mode: 'recorder',
    companyId: visit.company_id,
    canUpload: access === 'recorder',
    ownFilesOnly: true,
  };
}
