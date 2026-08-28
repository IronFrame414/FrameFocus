import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getSubcontractors } from '@/lib/services/subcontractors';
import { getBillsAndCommitments, getExpiringCompliance } from '@/lib/services/payables';
import { committedRemaining, countsTowardCommitted } from '@/lib/services/payables-shared';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';
import { SubcontractorsList } from './subcontractors-list';

/**
 * 14d Subs & Vendors (desktop-redesign §8.4).
 *
 * ⚠️ Insurance expiry has TWO independent stores, RULED LEAVE AS IS — this
 * build does not silently pick a side. What renders here is the compliance-
 * documents side (`getExpiringCompliance()`, type-blind, already covers
 * licenses); `subcontractors.insurance_expiry` stays where it is (written by
 * the forms, rendered on /m, invisible on desktop). Live state: the documents
 * table holds ZERO rows, so the alert is silent and W-9 reads "missing" for
 * every sub until documents are uploaded — that is the reality, not a bug.
 *
 * ⚠️ Compliance reads are Owner/Admin by RLS, and the read is SKIPPED for
 * other roles rather than rendered empty — "an empty list renders identically
 * to 'this sub has no documents' — a false statement" (the sub-profile
 * posture, followed here). Gated roles get null and the UI reflows.
 */
export default async function SubcontractorsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  const subcontractors = await getSubcontractors();
  const isOwnerAdmin = !!profile && ['owner', 'admin'].includes(profile.role);

  // member_id → sub id (every sub has one — trigger-assigned, no orphan case).
  const subByMember = new Map<string, string>();
  for (const s of subcontractors) {
    if (s.member_id) subByMember.set(s.member_id, s.id);
  }

  // ── Compliance alert + W-9 — Owner/Admin ONLY, read skipped otherwise ────
  let compliance: { expired: number; expiringSoon: number } | null = null;
  let w9: Record<string, boolean> | null = null;
  if (isOwnerAdmin) {
    const [expiringDocs, w9Docs] = await Promise.all([
      getExpiringCompliance(),
      supabase
        .from('subcontractor_compliance_documents')
        .select('member_id')
        .eq('doc_type', 'w9')
        .eq('is_deleted', false),
    ]);
    const expiredSubs = new Set<string>();
    const expiringSubs = new Set<string>();
    for (const doc of expiringDocs) {
      const subId = subByMember.get(doc.member_id);
      if (!subId) continue;
      if (doc.derivedStatus === 'expired') expiredSubs.add(subId);
      else expiringSubs.add(subId);
    }
    compliance = { expired: expiredSubs.size, expiringSoon: expiringSubs.size };
    w9 = {};
    for (const doc of w9Docs.data ?? []) {
      const subId = subByMember.get(doc.member_id);
      if (subId) w9[subId] = true;
    }
  }

  // ── Open commitments + 12-month spend — SUBCONTRACTORS ONLY (§8.4) ───────
  // One company-wide getBillsAndCommitments() (its projectId is optional),
  // rows mapped to subs via subcontractor_contracts.subcontractor_id, and the
  // committed maths reused from payables-shared — THE definitions, never
  // re-stated. Vendors are deliberately absent: purchase_orders.vendor_name
  // and expenses.supplier are free text with no FK, so a vendor spend figure
  // cannot be trusted to a join and is not invented here.
  const [rows, subContractsRes, timeSettings] = await Promise.all([
    getBillsAndCommitments(),
    supabase.from('subcontractor_contracts').select('id, subcontractor_id'),
    getCompanyTimeSettings(),
  ]);
  const subByContract = new Map<string, string>();
  for (const c of subContractsRes.data ?? []) {
    if (c.subcontractor_id) subByContract.set(c.id, c.subcontractor_id);
  }
  const today = companyToday(timeSettings.timezone);
  const cutoff = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`; // 12 months back, calendar
  const committedOpen: Record<string, number> = {};
  const spend12mo: Record<string, number> = {};
  for (const row of rows) {
    if (!row.sub_contract_id) continue;
    const subId = subByContract.get(row.sub_contract_id);
    if (!subId) continue;
    if (countsTowardCommitted(row)) {
      committedOpen[subId] = (committedOpen[subId] ?? 0) + committedRemaining(row, row.payments);
    }
    for (const p of row.payments) {
      if (p.paid_date >= cutoff) spend12mo[subId] = (spend12mo[subId] ?? 0) + Number(p.amount);
    }
  }

  return (
    <SubcontractorsList
      subcontractors={subcontractors}
      canEdit={!!profile && ['owner', 'admin', 'project_manager'].includes(profile.role)}
      // [S159] Owner/Admin only — the same list the detail page uses to decide
      // whether to run the compliance query at all. It gates the sheet's LINK
      // to that page, not any compliance data: nothing about a document
      // reaches this component or its payload.
      canSeeCompliance={isOwnerAdmin}
      compliance={compliance}
      w9={w9}
      committedOpen={committedOpen}
      spend12mo={spend12mo}
    />
  );
}
