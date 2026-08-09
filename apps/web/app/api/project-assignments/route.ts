import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { projectAssignmentCreateSchema } from '@framefocus/shared/validation/assignments';
import { upsertProjectAssignmentAsCaller } from '@/lib/services/assignments-server';
import { notifyProjectAssigned } from '@/lib/notify/assignment-notify';

// ND-18 — project membership moved from a client-direct Supabase write to this
// route so §3b has a server path to notify from.
//
// ===========================================================================
// ASSIGN ONLY. UNASSIGN IS STILL CLIENT-DIRECT, AND THAT IS THE RULING.
// ===========================================================================
// `unassignMember()` stays where it was. It notifies nobody — §3b is "Josh
// assigned you to Alvarez", and there is no trace for removal — so moving it
// would be churn on a working path that buys nothing. The asymmetry is
// deliberate and recorded here so the next reader does not "finish the job".
//
// ===========================================================================
// THE WRITE RUNS AS THE CALLER. THE NOTIFICATION RUNS AS THE SERVICE ROLE.
// ===========================================================================
//   WRITE   `createClient()`, the user's own JWT. Still gated by
//           `project_assignments_insert_authorized`: company scope AND
//           (owner|admin) OR (project_manager AND (assigned to the project OR
//           assigning THEMSELVES to a project they created)). The un-delete
//           branch is gated by `project_assignments_update_authorized`:
//           company scope AND (owner|admin) OR (project_manager AND assigned).
//           A foreman or crew member could not do this before and cannot now.
//
//   NOTIFY  service role, because `notifications` has NO INSERT POLICY — the
//           property that stops any caller forging a row addressed to someone
//           else.

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let parsed;
  try {
    parsed = projectAssignmentCreateSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const result = await upsertProjectAssignmentAsCaller(supabase, parsed.data);
  if (!result.success) {
    if (result.denied) {
      console.error(
        `[project-assignments] RLS refused for user ${user.id} on project ${parsed.data.project_id}: ${result.error}`
      );
      return NextResponse.json(
        { error: 'You do not have permission to assign members to this project.' },
        { status: 403 }
      );
    }
    // "Already assigned" is a legitimate 409, not a failure of the caller's
    // input and not a permission problem.
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  // The project name is read through the CALLER's client on purpose: it goes
  // into text the assignee will read, and the caller demonstrably can see this
  // project — the write they just made proves it.
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', parsed.data.project_id)
    .maybeSingle();

  let assignment = { notified: false, emailOnly: null as string | null, unreachableName: null as string | null };
  try {
    assignment = await notifyProjectAssigned(getSupabaseAdmin(), {
      companyId: profile.company_id,
      projectId: parsed.data.project_id,
      projectName: project?.name ?? 'a project',
      memberId: parsed.data.member_id,
      assignerName: `${profile.first_name} ${profile.last_name}`.trim(),
      assignerProfileId: profile.id,
    });
  } catch (err) {
    console.error(
      `[project-assignments] notify failed for ${result.id}:`,
      err instanceof Error ? err.message : 'unknown'
    );
  }

  return NextResponse.json({ id: result.id, ...assignment });
}
