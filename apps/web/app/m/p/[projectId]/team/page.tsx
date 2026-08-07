import { getProjectAssignments } from '@/lib/services/project-assignments';
import { getMyProfile } from '@/lib/services/profiles';
import { canReachDetail } from '@/app/m/detail-access';
import { SectionHeader } from '../section-header';
import { DeniedNotice, EmptyState, ListRow, ListRowLink } from '../../../mobile-ui';

// M6M §4.11.8 — M-18 · Assigned crew.
//
// ⚠ CUT: PAY RATES, COST RATES, BURDEN (A-38). And this cut is NOT a UI
// decision — instrument_rates carries a DB-ENFORCED Owner/Admin SELECT floor
// (20260806000000_financial_rls_floor.sql §1), so for a field user the rows are
// NOT READABLE rather than not rendered. getProjectAssignments() does not return
// them and nothing here reaches for them. That distinction matters: unlike M-27's
// sub rates or M-13's net_delta, this one is real enforcement.
//
// CUT: assign / unassign. Managing assignments is not a field task and no
// handoff specced it.
//
// Renders the same shape M-28 (/m/team) does for the company roster, so the two
// agree by construction — display_name, member_type, and the schedule_color tint
// with §2's amber as the null fallback.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export default async function ProjectTeamPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { denied?: string };
}) {
  const [rows, profile] = await Promise.all([
    getProjectAssignments(params.projectId),
    getMyProfile(),
  ]);

  // D-54 step 1. requireDetailAccess() on M-35 is the real gate.
  const canOpen = canReachDetail(profile?.role);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title="Team" />
      <DeniedNotice kind={searchParams.denied} />

      {rows.length === 0 ? (
        <EmptyState>Nobody assigned yet.</EmptyState>
      ) : (
        <ul className="rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {rows.map((a) => (
            <MemberRow
              key={a.id}
              href={canOpen && a.member?.id ? `/m/team/${a.member.id}` : null}
              label={a.member?.display_name ?? 'Team member'}
            >
              {/* The avatar sits BESIDE the text, so the row's children need
                  their own flex context: ListRowLink's <Link> is a block. */}
              <span className="flex items-center gap-[10px]">
              <span
                data-testid="m-member-avatar"
                aria-hidden
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-semibold text-m6m-navy"
                style={{ background: a.member?.schedule_color ?? '#f59e0b' }}
              >
                {initials(a.member?.display_name ?? '?')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                  {a.member?.display_name ?? 'Unknown member'}
                </p>
                <p
                  data-testid="m-member-type"
                  className="mt-[2px] font-mono text-[11px] font-semibold text-m6m-muted"
                >
                  {a.member?.member_type === 'subcontractor' ? 'subcontractor' : 'crew'}
                </p>
              </div>
              </span>
            </MemberRow>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One M-18 row. M-35 is keyed by the MEMBER id — `a.member.id` — never the
 *  assignment id and never a profile id (A-47's trap: getTeamMember reads
 *  profiles and drops every subcontractor roster row). */
function MemberRow({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) return <ListRow testId="m-assignment-row">{children}</ListRow>;
  return (
    <ListRowLink href={href} testId="m-assignment-row" label={label}>
      {children}
    </ListRowLink>
  );
}
