import Link from 'next/link';
import {
  getApprovedCoSummaries,
  getChangeOrders,
  CO_STATUS_LABELS,
  type ApprovedCoSummary,
} from '@/lib/services/change-orders';
import { readsCoSummaries, summariesToShow } from '@/lib/change-orders/summaries';
import { getMobileT } from '@/lib/i18n/server';
import type { MsgKey } from '@/lib/i18n/messages';
import { getMyProfile } from '@/lib/services/profiles';
import { canReachDetail, canWriteCo, readsChangeOrders } from '@/app/m/detail-access';
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
//   2. [S112 R5a] CORRECTED. _Superseded, quoted not deleted:_ "change_orders_
//      select_visible has NO role floor and NO author scoping — it is company +
//      can_view_project and nothing else. The Financial Visibility Floor gates
//      CO amounts at the UI ONLY (TECH_DEBT #117), so a leak here would NOT be
//      caught by RLS." False since the S121 read floor
//      (20260830000000_change_order_read_floor.sql): the policy admits owner/
//      admin, or a PM on the COs they created — nobody else. What is still
//      UI-only is narrow: a PM author sees net_delta on their own COs (#117).
//      D-26 holds anyway — reason 1 stands on its own, and a PM is a reader.
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

// S110 H — status code → message key. An unknown code falls back to the
// English label table, then the raw code.
const CO_STATUS_KEY: Record<string, MsgKey> = {
  draft: 'project.coStatus.draft',
  sent: 'project.coStatus.sent',
  signed: 'project.coStatus.signed',
  voided: 'project.coStatus.voided',
};

export default async function ProjectChangesPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { denied?: string };
}) {
  const [cos, profile, t] = await Promise.all([
    getChangeOrders(params.projectId),
    getMyProfile(),
    getMobileT(),
  ]);

  // [S112 R5b, RULED Josh] Every staff role learns that an APPROVED change
  // order exists and what it changed — never its price. The database returns
  // six columns and no figure (get_approved_change_order_summaries,
  // 20261840000000), so nothing here can leak one. Shown only for COs the
  // caller does not already hold in full: a PM's own stay full rows above,
  // other authors' approved COs appear below as summaries.
  const showsSummaries = readsCoSummaries(profile?.role);
  const summaries = showsSummaries
    ? summariesToShow(
        await getApprovedCoSummaries(params.projectId),
        cos.map((co) => co.id)
      )
    : [];

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

  // [S112 R5a, RULED Josh] Foreman, crew and subcontractor read NO change
  // orders — the database returns an empty list (readsChangeOrders' comment).
  // "No change orders." would tell them the project has none, which is false;
  // they get a notice worded by role instead, modelled on shell.denied.coRead.
  const canRead = readsChangeOrders(profile?.role);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title={t('project.tile.changes')} />
      <DeniedNotice kind={searchParams.denied} t={t} />

      {canWrite ? (
        <Link
          href={`/m/p/${params.projectId}/changes/new`}
          data-testid="m-co-new"
          className="mb-[14px] flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-m6m-blue text-[15px] font-bold text-white"
        >
          {t('project.changes.new')}
        </Link>
      ) : null}

      {showsSummaries && !canRead ? null : !canRead ? (
        <p
          data-testid="m-co-office-only"
          role="status"
          className="rounded-[15px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[15px] text-m6m-navy"
        >
          {t('project.changes.officeOnly')}
        </p>
      ) : cos.length === 0 ? (
        summaries.length > 0 ? null : (
          <EmptyState>{t('project.changes.empty')}</EmptyState>
        )
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {cos.map((co) => (
            <CoRow
              key={co.id}
              href={canOpen ? `/m/p/${params.projectId}/changes/${co.id}` : null}
              label={`${co.co_number} ${co.title}`}
            >
              <p className="font-mono text-[11px] font-semibold text-m6m-muted">{co.co_number}</p>
              <p className="mt-[2px] truncate text-[17px] font-bold leading-tight text-m6m-navy">
                {co.title}
              </p>
              <p className="mt-[3px] flex flex-wrap items-center gap-[6px]">
                {/* Status pill carries TEXT, never colour alone. */}
                <StatusPill
                  label={
                    CO_STATUS_KEY[co.status]
                      ? t(CO_STATUS_KEY[co.status])
                      : (CO_STATUS_LABELS[co.status] ?? co.status)
                  }
                />
                {co.author?.display_name ? (
                  <span className="text-[13px] text-m6m-muted">{co.author.display_name}</span>
                ) : null}
              </p>
              {/* Mono dates where set — no empty slot where null. NO AMOUNT. */}
              {co.sent_at || co.signed_at ? (
                <p className="mt-[2px] font-mono text-[11px] text-m6m-muted">
                  {co.signed_at
                    ? t('project.signedOn', { date: co.signed_at.slice(0, 10) })
                    : t('project.sentOn', { date: co.sent_at!.slice(0, 10) })}
                </p>
              ) : null}
            </CoRow>
          ))}
        </ul>
      )}

      {showsSummaries ? (
        <ApprovedSummaries
          summaries={summaries}
          note={t(canRead ? 'project.changes.summaryNotePm' : 'project.changes.summaryNoteCrew')}
          // A PM with none of other authors' approved COs needs no section at
          // all — their own list above already answers the question.
          hideWhenEmpty={canRead}
          t={t}
        />
      ) : null}
    </div>
  );
}

/**
 * [S112 R5b] Approved change orders as SCOPE ONLY. Not tappable: the detail
 * route is refused to these readers by the S121 row floor, so a link would
 * only bounce. The "Scope only" pill and the note make the missing figure a
 * stated boundary, not an absence.
 */
function ApprovedSummaries({
  summaries,
  note,
  hideWhenEmpty,
  t,
}: {
  summaries: ApprovedCoSummary[];
  note: string;
  hideWhenEmpty: boolean;
  t: Awaited<ReturnType<typeof getMobileT>>;
}) {
  if (hideWhenEmpty && summaries.length === 0) return null;
  return (
    <section data-testid="m-co-summaries" className="mt-[18px]">
      <h2 className="mb-[4px] text-[15px] font-extrabold text-m6m-navy">
        {t('project.changes.approvedHeading')}
      </h2>
      <p data-testid="m-co-summary-note" className="mb-[10px] text-[13px] text-m6m-muted">
        {note}
      </p>
      {summaries.length === 0 ? (
        <EmptyState>{t('project.changes.noApproved')}</EmptyState>
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {summaries.map((co) => (
            <ListRow key={co.id} testId="m-co-summary-row">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-[6px]">
                  <span className="font-mono text-[11px] font-semibold text-m6m-muted">
                    {co.co_number}
                  </span>
                  <StatusPill label={t('project.changes.scopeOnly')} />
                </p>
                <p className="mt-[2px] text-[17px] font-bold leading-tight text-m6m-navy">
                  {co.title}
                </p>
                {co.description ? (
                  <p className="mt-[3px] whitespace-pre-line text-[15px] text-m6m-navy">
                    {co.description}
                  </p>
                ) : null}
                {co.signed_at ? (
                  <p className="mt-[3px] font-mono text-[11px] text-m6m-muted">
                    {t('project.approvedOn', { date: co.signed_at.slice(0, 10) })}
                  </p>
                ) : null}
              </div>
            </ListRow>
          ))}
        </ul>
      )}
    </section>
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
