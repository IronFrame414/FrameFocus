import type { SupabaseClient } from '@supabase/supabase-js';

// S108 Spec A, Q3 → A; REWRITTEN S110 Section A — WHO MAY REACH AN ESTIMATE'S
// FILES. One decision, used by the estimate-files routes (list, upload, per-file
// /url) AND the site-visit voice route, so they can never disagree about the
// floor (PARITY [S122]: the rule lives below the UI).
//
// ⚠️ EVERY READ HERE GOES THROUGH THE CALLER'S SESSION CLIENT. The routes use
// the service-role client only AFTER this returns ok — that ordering IS the
// access control (s107-estimate-files-route-order.test.ts and
// s109-estimate-file-url-order.test.ts assert it, with a mirror case per arm).
//
// Two arms, tried in order:
//
//   OFFICE — the caller can SELECT the estimate (estimates_select_authenticated:
//     owner/admin any, PM own). Sees EVERY file on it. Ordinary uploads: a draft
//     they may edit (unchanged). Site-visit capture: at every status.
//
//   VISIT — [S110, RULED Josh Q1/Q4] any other INTERNAL employee on an estimate
//     that has a site visit: a foreman, crew member, or a PM who does not own the
//     estimate. Reads ONLY files marked `site_visit_capture` — never the
//     estimate's other files, which can be vendor quotes (money on paper; the
//     Financial Visibility Floor). Captures at every status [ruling 3].
//
//   _Superseded, quoted:_ "RECORDER — … but RECORDED this visit … READ: their
//   OWN files on it, before AND after promotion … UPLOAD: only while the
//   estimate is still a site visit (Q3 condition 1)." Read widened from "your
//   own" to every captured file (ruling 1); upload no longer ends at promotion
//   or send (rulings 2 and 3).

export type EstimateFileAccess =
  | {
      ok: true;
      mode: 'office';
      companyId: string;
      /** An ordinary (non-capture) upload through the Files tab. */
      canUpload: boolean;
      /** An upload through the site-visit record, marked site_visit_capture. */
      canCapture: boolean;
      /** Which files this caller may list and sign. */
      scope: 'all';
    }
  | { ok: true; mode: 'visit'; companyId: string; canUpload: false; canCapture: boolean; scope: 'capture' }
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

  // "May this caller add site-visit material here?" — decided in the database
  // (site_visit_access(): 'office' | 'staff' | NULL; NULL for a sub, a client,
  // another company, an abandoned visit, or an estimate with no visit).
  const { data: visitAccess } = await supabase.rpc('site_visit_access', { p_estimate_id: estimateId });
  const canCapture = visitAccess === 'office' || visitAccess === 'staff';

  // ── OFFICE arm: the S106 floor, unchanged ──
  const { data: est } = await supabase
    .from('estimates')
    .select('id, company_id, status, created_by')
    .eq('id', estimateId)
    .maybeSingle();
  if (est) {
    const ownerAdmin = role === 'owner' || role === 'admin';
    const canUpload = est.status === 'draft' && (ownerAdmin || est.created_by === userId);
    return { ok: true, mode: 'office', companyId: est.company_id, canUpload, canCapture, scope: 'all' };
  }

  // ── VISIT arm: the money-free site_visits row, readable by every internal
  //    employee (site_visits_select_internal) and by nobody else ──
  const { data: visit } = await supabase
    .from('site_visits')
    .select('estimate_id, company_id, is_deleted')
    .eq('estimate_id', estimateId)
    .maybeSingle();
  if (!visit || visit.is_deleted) return NOT_FOUND;

  return { ok: true, mode: 'visit', companyId: visit.company_id, canUpload: false, canCapture, scope: 'capture' };
}
