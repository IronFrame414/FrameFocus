import { notFound } from 'next/navigation';
import { getPunchItem, PUNCH_STATUS_LABELS } from '@/lib/services/punch';
import { SectionHeader } from '../../section-header';
import { DetailCard, DetailField, StatusPill } from '../../../../mobile-ui';

// M6M §4.11.14 — M-34 · Punch item detail.
//
// READ-ONLY IN THIS PASS. Complete and verify are writes and belong to Part C.
//
// ===========================================================================
// ⚠️ NO ROLE GUARD HERE, AND THAT IS THE RULING RATHER THAN AN OMISSION
// ===========================================================================
// The other four detail routes (M-31, M-35, M-36, file-open) call
// requireDetailAccess(). THIS ONE DOES NOT, and a reader who "fixes" that will
// be reversing two rulings:
//
//   D-52, corrected [S110] — the subcontractor exclusion from punch is
//   WITHDRAWN. Subs get punch lists and items, including creating and
//   completing them. Gating this screen would restore an exclusion Josh
//   reversed.
//
//   D-54 / §4.11.10a — "It is not a general permission to gate. Three surfaces
//   are gated ... a build that gates a fourth because 'there is a pattern now'
//   has exceeded D-54."
//
// WHAT PROTECTS THIS ROUTE IS THE DATABASE, WHICH IS BETTER THAN A GUARD.
// D-57's narrowing shipped as
// `20260828000000_punch_subcontractor_visibility.sql`:
//
//     get_my_role() = 'subcontractor'
//       AND (assignee_id = get_my_member_id() OR created_by = auth.uid())
//
// So a subcontractor who deep-links to an item that is neither theirs to do nor
// theirs to have written gets NULL from getPunchItem() and lands on notFound().
// Real enforcement, not a UI check — proven failing-then-passing in
// test/s113-punch-sub-visibility.live.ts, where the sub reads exactly 2 of 3
// fixtures and the third is refused on read AND write.
//
// This is the one detail screen where the 404 IS the permission, which is why
// it is also the one that needs no explaining redirect: the item genuinely does
// not exist as far as this caller's database session is concerned.

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export default async function PunchItemDetailPage({
  params,
}: {
  params: { projectId: string; itemId: string };
}) {
  const item = await getPunchItem(params.itemId);
  if (!item) notFound();

  // A punch item deep-linked from another project's URL is a wrong link, not a
  // permission — RLS already answered the permission question above.
  if (item.project_id !== params.projectId) notFound();

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Punch Item" />

      <header className="mb-[14px]">
        <h1 className="text-[17px] font-bold leading-tight text-m6m-navy">{item.title}</h1>
        <p className="mt-[6px] flex flex-wrap items-center gap-[6px]">
          <StatusPill label={PUNCH_STATUS_LABELS[item.status] ?? item.status} />
          {item.priority ? (
            <span
              data-testid="m-punch-priority"
              className="font-mono text-[11px] font-semibold text-m6m-muted"
            >
              {PRIORITY_LABELS[item.priority] ?? item.priority}
            </span>
          ) : null}
        </p>
      </header>

      <DetailCard testId="m-punch-detail">
        <DetailField label="Description" value={item.description} />
        <DetailField label="Location" value={item.location} mono />
        <DetailField label="Trade" value={item.trade} mono />
        <DetailField label="Assigned to" value={item.assignee?.display_name ?? null} />
        {/* §4.11.14 — the completer and verifier are already joined by the
            service function, and showing WHO completed an item is what makes
            the separate-eyes rule visible BEFORE the verify tap rather than as
            an error after it. The tap itself is Part C. */}
        <DetailField
          label="Completed by"
          value={
            item.completer?.display_name
              ? `${item.completer.display_name}${item.completed_at ? ` · ${item.completed_at.slice(0, 10)}` : ''}`
              : null
          }
          testId="m-punch-completer"
        />
        <DetailField
          label="Verified by"
          value={
            item.verifier?.display_name
              ? `${item.verifier.display_name}${item.verified_at ? ` · ${item.verified_at.slice(0, 10)}` : ''}`
              : null
          }
          testId="m-punch-verifier"
        />
        {/* Requirement flags are READ here even though setRequirementToggles is
            Foreman+ and not offered on /m (§4.11.13's cut). Showing that a photo
            WILL be required is not a control. */}
        <DetailField
          label="Requires"
          value={
            [
              item.requires_verification ? 'verification' : null,
              item.requires_completion_photo ? 'completion photo' : null,
            ]
              .filter(Boolean)
              .join(' · ') || null
          }
          mono
        />
      </DetailCard>
    </div>
  );
}
