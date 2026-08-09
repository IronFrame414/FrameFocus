import { notFound } from 'next/navigation';
import {
  getChangeOrder,
  getCoSigningSessions,
  CO_STATUS_LABELS,
} from '@/lib/services/change-orders';
import { getMyProfile } from '@/lib/services/profiles';
import { canWriteCo, requireDetailAccess } from '@/app/m/detail-access';
import { SectionHeader } from '../../section-header';
import { DetailCard, DetailField, formatMoney, StatusPill } from '../../../../mobile-ui';
import { CoActions } from './co-actions';

// M6M §4.11.11 — M-31 · Change order detail.
//
// **[S117] THE WRITE CONTROLS ARE NOW HERE** — Edit, Send for signature, Void.
// _Superseded note, quoted rather than deleted:_ _"READ-ONLY IN THIS PASS.
// D-51's write controls — Edit, Send for signature, Void — are Part C."_
//
// ===========================================================================
// READ AND WRITE ARE SEPARATE GATES ON ONE SCREEN, AND ARE NOT COLLAPSED
// ===========================================================================
// THREE distinct audiences now share this file, and conflating any two of them
// is the defect:
//
//   1. WHO REACHES THE SCREEN — everyone except subcontractors (D-53).
//      requireDetailAccess(). UI-only; see detail-access.ts.
//   2. WHO SEES THE MONEY — Owner/Admin/PM (D-51). UI-only, #117.
//   3. WHO GETS THE WRITE CONTROLS — Owner/Admin/PM (D-51). **DB-enforced**,
//      and the only one of the three that is.
//
// 2 and 3 share a role list and NOTHING else. Deriving one from the other would
// be right today and wrong the moment either rule moves — so `showMoney` and
// `canWrite` are computed separately from the same profile, deliberately, even
// though the expressions currently agree.
//
// ===========================================================================
// TWO GATES, AND ONLY ONE OF THEM IS A ROUTE GUARD
// ===========================================================================
//   1. WHO REACHES THE SCREEN — everyone except subcontractors (D-53).
//      requireDetailAccess() below. See detail-access.ts for why that is the
//      entire enforcement.
//   2. WHO SEES THE MONEY — Owner/Admin/PM only (D-51). NOT a route guard: a
//      foreman and a crew member legitimately reach this screen and must simply
//      not see the amounts.
//
// ⚠️ THE MONEY GATE IS UI-ONLY AND RLS WILL NOT CATCH A LEAK. TECH_DEBT #117,
// accepted by D-56.
//   change_orders_select_visible            = company_id + can_view_project()
//   change_order_line_items_select_visible  = the same, no role arm (:355-364)
//   change_order_line_rows_select_visible   = the same, no role arm (:389-399)
//
// So `getChangeOrder()` returns net_delta, and every line row's total, rate,
// unit_cost and amount, TO A FOREMAN AND A CREW MEMBER. They are in the payload
// of this very page. The only thing keeping them off the screen is the
// `showMoney` branch below.
//
// MEASURED [S115], because "the database would hand it over" deserves a number
// rather than a claim: signed in as the QA subcontractor, both change orders on
// an assigned project came back at full value — net_delta 1410 and 21385.91.
// A foreman reads the same rows; the sub is merely also bounced by gate 1.
//
// THE ASYMMETRY THAT MAKES THIS TOLERABLE, and it is worth stating because it
// is not obvious: WRITING is DB-enforced and READING is not.
// change_orders_insert_authorized / _update_authorized both carry
// get_my_role() = ANY (owner, admin, project_manager) — exactly D-51's three
// roles, already in the database. A foreman cannot author, alter or void a CO
// no matter what this file does. What is unenforced is reading a number.
//
// ⚠️ DO NOT "TIDY" THIS INTO A ROUTE GUARD. Bouncing foreman/crew off M-31
// would contradict D-53, which keeps CO reading open to everyone but subs, and
// would be Option C — rejected in §4.11.10a for exactly that reason.

const MONEY_ROLES = ['owner', 'admin', 'project_manager'];

export default async function ChangeOrderDetailPage({
  params,
}: {
  params: { projectId: string; coId: string };
}) {
  const backTo = `/m/p/${params.projectId}/changes`;
  await requireDetailAccess('co', backTo);

  const [co, profile] = await Promise.all([getChangeOrder(params.coId), getMyProfile()]);
  if (!co) notFound();

  const showMoney = MONEY_ROLES.includes(profile?.role ?? '');

  // Gate 3. Same three roles as `showMoney` TODAY, computed separately on
  // purpose — see the header. This one is backed by
  // `change_orders_update_authorized`, so hiding the controls is cosmetic and
  // the database is the gate.
  const canWrite = canWriteCo(profile?.role);

  // §4.11.11 — signing activity is the ONE CO read that is DB-floored:
  // co_signing_sessions_select_manager is get_my_role() = ANY (owner, admin,
  // project_manager) (:427-433). So this returns [] for a foreman or crew
  // member at the DATABASE, and the section simply does not render. It is not
  // gated here a second time — doing so would imply the UI is the gate when it
  // is not, and would drift if the policy changed.
  const sessions = await getCoSigningSessions(params.coId);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Change Order" />

      <header className="mb-[14px]">
        <p className="font-mono text-[11px] font-semibold text-m6m-muted">{co.co_number}</p>
        <h1 className="mt-[2px] text-[17px] font-bold leading-tight text-m6m-navy">{co.title}</h1>
        <p className="mt-[6px] flex flex-wrap items-center gap-[6px]">
          <StatusPill label={CO_STATUS_LABELS[co.status] ?? co.status} />
          {co.author?.display_name ? (
            <span className="text-[13px] text-m6m-muted">{co.author.display_name}</span>
          ) : null}
        </p>
        {co.sent_at || co.signed_at ? (
          <p className="mt-[4px] font-mono text-[11px] text-m6m-muted">
            {co.signed_at ? `signed ${co.signed_at.slice(0, 10)}` : `sent ${co.sent_at!.slice(0, 10)}`}
          </p>
        ) : null}
      </header>

      <DetailCard testId="m-co-detail">
        <DetailField label="Description" value={co.description} />
        <DetailField label="Reason" value={co.reason_category} />
        <DetailField
          label="Schedule impact"
          value={
            co.schedule_impact_days === null || co.schedule_impact_days === undefined
              ? null
              : `${co.schedule_impact_days} days`
          }
          mono
        />
        {/* THE MONEY. Owner/Admin/PM only — see the header. */}
        {showMoney ? (
          <DetailField
            label="Net delta"
            value={formatMoney(co.net_delta)}
            mono
            testId="m-co-net-delta"
          />
        ) : null}
      </DetailCard>

      {/* Line items. Their TOTALS follow the same UI-only money gate; the
          descriptions do not, because a foreman needs to know what changed. */}
      {(co.line_items ?? []).length > 0 ? (
        <>
          <h2 className="mb-[8px] mt-[18px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
            Line items
          </h2>
          <ul
            data-testid="m-co-lines"
            className="rounded-[15px] border border-m6m-border bg-m6m-card px-[14px]"
          >
            {(co.line_items ?? []).map((li) => (
              <li
                key={li.id}
                data-testid="m-co-line"
                className="flex items-center gap-[10px] border-b border-m6m-border py-[10px] last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-m6m-navy">{li.name}</p>
                  {li.description ? (
                    <p className="mt-[2px] truncate text-[13px] text-m6m-muted">{li.description}</p>
                  ) : null}
                </div>
                {showMoney ? (
                  <span data-testid="m-co-line-total" className="shrink-0 font-mono text-[13px] text-m6m-navy">
                    {formatMoney(li.total_price)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* §4.11.11 — renders THAT a session exists and its dates.

          ⚠️ CUT: THE TOKEN, AND THE CUT IS NOT THEORETICAL. `getCoSigningSessions`
          does `select('*')`, so `co_signing_sessions.token` — the bearer
          credential that authorises the CLIENT'S SIGNATURE — is sitting in this
          component's props right now. Rendering it, or building the signing URL
          from it, would put a credential on the surface most likely to be
          photographed or shoulder-read. Dates and status only.

          Also not rendered: `signer_ip`, `signer_user_agent`, `signature_data`
          and `recipient_email`, all of which arrive in the same payload. */}
      {sessions.length > 0 ? (
        <>
          <h2 className="mb-[8px] mt-[18px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
            Signing
          </h2>
          <ul
            data-testid="m-co-signing"
            className="rounded-[15px] border border-m6m-border bg-m6m-card px-[14px]"
          >
            {sessions.map((s) => (
              <li
                key={s.id}
                className="border-b border-m6m-border py-[10px] font-mono text-[12px] text-m6m-muted last:border-b-0"
              >
                {s.signed_at
                  ? `signed ${s.signed_at.slice(0, 10)}`
                  : s.declined_at
                    ? `declined ${s.declined_at.slice(0, 10)}`
                    : `sent ${(s.created_at ?? '').slice(0, 10)} · expires ${(s.expires_at ?? '').slice(0, 10)}`}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* D-51's write controls. Hidden from foreman and crew — who legitimately
          READ this screen — and refused by the API routes and by RLS besides. */}
      {canWrite ? (
        <CoActions
          projectId={params.projectId}
          coId={co.id}
          status={co.status}
          // First send versus re-send. The route reuses an existing contractor
          // signature verbatim and only demands one when this is null.
          needsSignature={!co.contractor_signed_at}
        />
      ) : null}
    </div>
  );
}
