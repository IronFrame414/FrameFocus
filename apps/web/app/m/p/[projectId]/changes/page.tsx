import { getChangeOrders, CO_STATUS_LABELS } from '@/lib/services/change-orders';
import { SectionHeader } from '../section-header';
import { EmptyState, ListRow, StatusPill } from '../../../mobile-ui';

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
}: {
  params: { projectId: string };
}) {
  const cos = await getChangeOrders(params.projectId);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Change Orders" />

      {cos.length === 0 ? (
        <EmptyState>No change orders.</EmptyState>
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {cos.map((co) => (
            <ListRow key={co.id} testId="m-co-row">
              <div className="min-w-0 flex-1">
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
              </div>
            </ListRow>
          ))}
        </ul>
      )}
    </div>
  );
}
