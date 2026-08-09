import { notFound } from 'next/navigation';
import { getProject } from '@/lib/services/projects';
import { getPunchLists } from '@/lib/services/punch';
import { getMembers } from '@/lib/services/members';
import { getProjectAssignments } from '@/lib/services/project-assignments';
import { PunchItemForm, type ListOption, type MemberOption } from './punch-form';

// M6M §4.11.13 — M-33 · Punch item create.
//
// ===========================================================================
// ⚠️ NO ROLE GUARD, AND A READER WHO ADDS ONE IS REVERSING A RULING
// ===========================================================================
// Every other write screen in this pass is gated. This one is not, and the
// asymmetry is deliberate:
//
//   D-52, CORRECTED [S110] — the subcontractor exclusion from punch is
//   WITHDRAWN. Every role creates punch items, subcontractors included.
//   §4.11.10b records `punch_list_items_insert_authenticated`'s missing role
//   arm as "n/a — nothing to refuse ... **that is now correct behaviour**
//   rather than a gap."
//
//   §4.11.10a — "a build that gates a fourth [surface] because 'there is a
//   pattern now' has exceeded D-54."
//
// So `requireDetailAccess` is NOT imported here, and `app/m/detail-access.ts`
// carries a block explaining why no punch guard exists in it either.
//
// ===========================================================================
// D-60 — THE AUTHOR TARGETS A LIST, ALWAYS. NO DEFAULT, NO AUTO-TARGET.
// ===========================================================================
// `punch_list_items.punch_list_id` is required and a project may have no lists
// at all, so something has to choose. D-60 rejected BOTH obvious answers:
// auto-creating a default hides the decision, and asking "only when more than
// one exists" makes the screen behave differently on its second use than its
// first. **The picker is unconditional** — a project with exactly one list
// still asks, which is A-67's specific assertion.
//
// ⚠️ THE LIST PICKER IS NOT A ROLE SURFACE. `punch_lists_insert_authenticated`
// admits every role. A build must not gate inline list creation to Foreman+ by
// analogy with `deletePunchList` — delete is Foreman+, create is not, and they
// are different verbs on the same table.
//
// ⚠️ A SUBCONTRACTOR SEES EVERY LIST HERE, and that is correct. D-57 narrows
// `punch_list_items`, NOT `punch_lists`, so the picker is full even though
// M-14's item rows are narrowed for the same user. A sub who could not see the
// lists could not file an item at all — exactly what D-52 restored.

export default async function NewPunchItemPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [project, lists, members, assignments] = await Promise.all([
    getProject(params.projectId),
    // §4.11.13: the existing lists come from `getPunchLists(projectId)` — the
    // same function M-14 uses. No new service function, per §1's shared-service
    // rule and A-28b.
    getPunchLists(params.projectId),
    getMembers().catch(() => []),
    // D-65 part 3 [S121] — the picker is scoped to this project's roster.
    getProjectAssignments(params.projectId).catch(() => []),
  ]);
  if (!project) notFound();

  const listOptions: ListOption[] = lists.map((l) => ({ id: l.id, name: l.name }));

  // `assignee_id` is a `company_members` id — never a user id and never a
  // profiles.id. The same trap §4.3/GAP-1b names for D-16's "mine", and the
  // reason the picker binds to getMembers() rather than to a profiles read.
  const memberOptions: MemberOption[] = (members ?? []).map((m) => ({
    id: m.id,
    display_name: m.display_name,
    member_type: m.member_type,
  }));

  return (
    <PunchItemForm
      projectId={params.projectId}
      projectName={project.name}
      lists={listOptions}
      members={memberOptions}
      assignedMemberIds={assignments.map((a) => a.member_id)}
    />
  );
}
