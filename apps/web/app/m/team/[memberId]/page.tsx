import { notFound } from 'next/navigation';
import { getMember } from '@/lib/services/members';
import { requireDetailAccess } from '@/app/m/detail-access';
import { DetailCard, DetailField } from '../../mobile-ui';

// M6M §4.11.15 — M-35 · Team-member detail. Everyone except subcontractors.
//
// ONE ROUTE, TWO ENTRY POINTS — M-18 (project team) and M-28 (company roster).
// Both list `company_members` rows, so both already hold the id this needs and
// neither has to be given a different destination.
//
// ⚠️ getMember(), NOT getTeamMember(). A-47's trap, and it is easy to trip:
// `getTeamMember()` (team.ts:33) reads **profiles** by PROFILE id, so it
// resolves nothing for a member row and DROPS EVERY SUBCONTRACTOR roster member
// — of which rebuild-test holds 32 (#127). `getMember()` (members.ts:34) reads
// company_members by MEMBER id, which is the id both lists carry.
//
// ⚠️ THE GUARD IS THE WHOLE ENFORCEMENT. company_members_select_authenticated
// is `company_id = get_my_company_id()` and NOTHING ELSE
// (20260704210000:81-83) — no role arm. A subcontractor's session reads every
// member row in the company from the database. See detail-access.ts.
//
// CUT, and each for its own reason:
//   EVERY RATE — pay, cost, burden. §4.11.8's cut. This is the natural place to
//     leak it, and unlike M-31's money the cut here is backed by real
//     enforcement: instrument_rates carries a DB Owner/Admin SELECT floor
//     (20260806000000 §1), so for a field user the rows are NOT READABLE rather
//     than not rendered.
//   EVERY MANAGEMENT CONTROL — no invite, deactivate, role change or password
//     reset. updateTeamMember, softDeleteTeamMember and resetTeamMemberPassword
//     all exist in team.ts and NONE is called from /m.
//   profiles.role — M-28 already does not render it (A-47) and a detail screen
//     must not reintroduce it.
//   "WHICH PROJECTS IS THIS MEMBER ON" — CUT RATHER THAN DERIVED. Verified:
//     project-assignments.ts exports getProjectAssignments(projectId) and
//     getMyAssignedProjectIds() — both project-first. There is no member-first
//     lookup, and D-19's precedent is to name the gap rather than bind to
//     something approximate. If it is wanted it is a named new function, not a
//     page-level query.

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export default async function MemberDetailPage({
  params,
}: {
  params: { memberId: string };
}) {
  // Back to the COMPANY roster. M-18 is the other entry point, but it needs a
  // projectId this route does not carry, and A-66 wants a destination that
  // works rather than one that is contextually perfect.
  await requireDetailAccess('member', '/m/team');

  const member = await getMember(params.memberId);
  if (!member) notFound();

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <header className="mb-[14px] flex items-center gap-[12px]">
        {/* schedule_color tint with §2's amber as the null fallback — the same
            rule M-18 and M-28 use, so the three agree by construction (A-47e). */}
        <span
          data-testid="m-member-avatar"
          aria-hidden
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full font-mono text-[17px] font-semibold text-m6m-navy"
          style={{ background: member.schedule_color ?? '#f59e0b' }}
        >
          {initials(member.display_name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
            {member.display_name}
          </h1>
          <p
            data-testid="m-member-type"
            className="mt-[2px] font-mono text-[11px] font-semibold text-m6m-muted"
          >
            {member.member_type === 'subcontractor' ? 'subcontractor' : 'crew'}
          </p>
        </div>
      </header>

      <DetailCard testId="m-member-detail">
        <DetailField label="Name" value={member.display_name} />
        <DetailField
          label="Type"
          value={member.member_type === 'subcontractor' ? 'Subcontractor' : 'Crew'}
          mono
        />
        {/* NO tap-to-act, and it is a CUT rather than an omission: company_members
            carries no phone or email column at all. §4.13.5 cuts it rather than
            deriving it from profiles — the same decision M-28 already made. */}
      </DetailCard>
    </div>
  );
}
