import { notFound } from 'next/navigation';
import { getMember } from '@/lib/services/members';
import { getTeamMemberProfile } from '@/lib/services/members';
import { requireEditAccess } from '@/app/m/detail-access';
import { TeamEditForm, type TeamEditable } from './team-edit-form';

// M6M — M-40 · TEAM MEMBER EDIT · `/m/team/[memberId]/edit`. Owner/Admin.
//
// NARROWER THAN THE OTHER TWO EDIT SURFACES, BY RULING [Josh, S121]: subs,
// vendors and contacts are Owner/Admin/PM because their tables are; team is
// Owner/Admin because `company_members_update_authorized` is. `EDIT_ROLES` in
// detail-access.ts is per-surface for exactly this reason.
//
// TWO TABLES, and the second one may not exist for this member — see
// lib/services/members-client.ts for the combined permission, the
// zero-rows-is-a-refusal problem, and A-47's 32-of-33 profile gap.

export default async function TeamEditPage({ params }: { params: { memberId: string } }) {
  await requireEditAccess('team', `/m/team/${params.memberId}`);

  const member = await getMember(params.memberId);
  if (!member) notFound();

  // The profile half, when there is one. A member without a profile is the
  // NORMAL case for most of the roster, not a failure — the form renders the
  // company_members half and says why the rest is absent.
  const profile = member.profile_id ? await getTeamMemberProfile(member.profile_id) : null;

  const editable: TeamEditable = {
    id: member.id,
    display_name: member.display_name,
    member_type: member.member_type,
    schedule_color: member.schedule_color,
    is_deleted: member.is_deleted ?? false,
    profile_id: member.profile_id,
    first_name: profile?.first_name ?? '',
    last_name: profile?.last_name ?? '',
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
  };

  return <TeamEditForm member={editable} />;
}
