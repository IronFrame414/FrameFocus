import Link from 'next/link';
import { getChangeOrders, CO_STATUS_LABELS } from '@/lib/services/change-orders';
import { getMyProfile } from '@/lib/services/profiles';
import { canReachDetail, canWriteCo } from '@/app/m/detail-access';
import { SectionHeader } from '../section-header';
import { DeniedNotice, EmptyState, ListRow, ListRowLink, StatusPill } from '../../../mobile-ui';

// M6M §4.11.3 — M-13 · Change Orders. ⚠ NO MONEY, FOR ANY ROLE.
//
// ───────────────────────────────────────────────────────────────────────────
// net_delta AND EVERY DERIVED DOLLAR FIGURE ARE CUT — D-26, for EVERY role
// INCLUDING OWNER AND ADMIN. A-33, A-33b, A-33c.
// ───────────────────────────────────────────────────────────────────────────
// Two reasons, both still live:
//   1. Showing it to Owner/Admin only would introduce the FIRST role-gated
//      figure anywhere on /m — a pattern this spec has deliberately never had
//      (D-11 puts every role on the same screens). D-37's Expenses is not that:
//      an expense amount is actual cost, visible to all roles by design.
//   2. change_orders_select_visible has NO role floor and NO author scoping —
//      it is company + can_view_project and nothing else. The Financial
//      Visibility Floor gates CO amounts at the UI ONLY (TECH_DEBT #117), so a
//      leak here would NOT be caught by RLS.
//
// A-33c walks all six roles, and the owner/admin pass is the one that matters:
// a build that adds a role gate "because owners may as well see it" satisfies
// every other criterion here and reintroduces exactly what D-26 ruled out.
//
// A change order is perfectly meaningful without its value — number, title,
// status, author and signature dates are what a foreman needs (A-33b).
//
// D-45 [S102] records the INTENT to author COs on mobile later. It does not
// reverse D-26, which governs this read-only list. When that screen is built it
// will put net_delta on /m at the point of entry, and #117's open scoping
// question should be answered first.

export default async function ProjectChangesPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { denied?: string };
}) {
  const [cos, profile] = await Promise.all([
    getChangeOrders(params.projectId),
    getMyProfile(),
  ]);

  // D-54 step 1 — HIDE the row tap for a subcontractor. Step 2, the real gate,
  // is requireDetailAccess() on M-31 itself. A hidden row is not a permission:
  // the URL survives a screenshot, a bookmark and a stale PWA cache.
  // The LIST stays open to subs — §4.11.10b: "Gets the list. Only the detail
  // route (M-31) is blocked."
  const canOpen = canReachDetail(profile?.role);

  // D-51 step 1 — the create control is Owner/Admin/PM. Step 2 is
  // requireCoWriteAccess() on M-32, and BOTH sit on top of
  // `change_orders_insert_authorized`, which would refuse the other three roles
  // anyway. This is the one write in the pass where hiding, guarding and the
  // database all agree.
  const canWrite = canWriteCo(profile?.role);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Change Orders" />
      <DeniedNotice kind={searchParams.denied} />

      {canWrite ? (
        <Link
          href={`/m/p/${params.projectId}/changes/new`}
          data-testid="m-co-new"
          className="mb-[14px] flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-m6m-blue text-[15px] font-bold text-white"
        >
          New change order
        </Link>
      ) : null}

      {cos.length === 0 ? (
        <EmptyState>No change orders.</EmptyState>
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {cos.map((co) => (
            <CoRow
              key={co.id}
              href={canOpen ? `/m/p/${params.projectId}/changes/${co.id}` : null}
              label={`${co.co_number} ${co.title}`}
            >
                <p className="font-mono text-[11px] font-semibold text-m6m-muted">
                  {co.co_number}
                </p>
                <p className="mt-[2px] truncate text-[17px] font-bold leading-tight text-m6m-navy">
                  {co.title}
                </p>
                <p className="mt-[3px] flex flex-wrap items-center gap-[6px]">
                  {/* Status pill carries TEXT, never colour alone. */}
                  <StatusPill label={CO_STATUS_LABELS[co.status] ?? co.status} />
                  {co.author?.display_name ? (
                    <span className="text-[13px] text-m6m-muted">{co.author.display_name}</span>
                  ) : null}
                </p>
                {/* Mono dates where set — no empty slot where null. NO AMOUNT. */}
                {co.sent_at || co.signed_at ? (
                  <p className="mt-[2px] font-mono text-[11px] text-m6m-muted">
                    {co.signed_at
                      ? `signed ${co.signed_at.slice(0, 10)}`
                      : `sent ${co.sent_at!.slice(0, 10)}`}
                  </p>
                ) : null}
            </CoRow>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One M-13 row, tappable or not. Written as one component so the two forms
 *  cannot drift — §4.11.10a names "two places to keep in sync" as the one real
 *  cost of Option A, and this is how that cost is paid down. */
function CoRow({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <ListRow testId="m-co-row">
        <div className="min-w-0 flex-1">{children}</div>
      </ListRow>
    );
  }
  return (
    <ListRowLink href={href} testId="m-co-row" label={label}>
      {children}
    </ListRowLink>
  );
}
