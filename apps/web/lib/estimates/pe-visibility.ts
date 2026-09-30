// S121 PART 8 — HIDE PROJECT-EXECUTIVE FEATURES WHEN THE COMPANY HAS NO PE.
// [RULED Josh, 2026-09-30: "also want to hide all project executive features
// when there is no PE user."]
//
// ⚠️ PRESENTATION ONLY. THIS IS NOT A SECURITY CONTROL.
// It decides whether a PE control RENDERS — nothing else. It narrows no read
// and grants no write: the estimate's PE read paths
// (estimates_select_project_executive, the S119 estimate_assignments table and
// its RLS) are UNCHANGED, and the database — not this — decides who reads and
// writes. This is the #136 shape on purpose: a rendering gate still ships the
// data in the payload, so it must never be mistaken for a permission. (Stop
// rule 7: any change that NARROWS a PE read path is a stop — none is made.)
//
// "No PE" means no LIVE one: getEstimatePeAccess() counts profiles with role
// project_executive, is_deleted = false, AND a live company_members row. A
// soft-deleted PE is not a PE. The moment one exists, the controls return — no
// setting, no cache.
//
// The one exception: an estimate still ASSIGNED to a PE keeps its control even
// if that PE is gone, so the owner can see and clear the assignment.
//
// Surfaces this governs (enumerated S121 §1 / report Part 8): the per-estimate
// PE picker (app/dashboard/estimates/[id]/pe-access-control.tsx). There are NO
// PE-only columns or filters. The role pickers (invite, team edit) keep the PE
// option — hiding it would make a first PE impossible to create [Josh, Q28].

import type { EstimatePeAccess } from '@/lib/services/estimate-assignments';

export function showPeControls(access: Pick<EstimatePeAccess, 'executives' | 'assignedMemberId'>): boolean {
  return access.executives.length > 0 || access.assignedMemberId !== null;
}
