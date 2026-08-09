import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { punchItemCreateSchema } from '@framefocus/shared/validation/assignments';
import { insertPunchItemAsCaller } from '@/lib/services/assignments-server';
import { notifyPunchAssigned } from '@/lib/notify/assignment-notify';

// ND-18 — punch item creation moved from a client-direct Supabase insert to
// this route so §3b has a server path to notify from.
//
// ===========================================================================
// THE WRITE RUNS AS THE CALLER. THE NOTIFICATION RUNS AS THE SERVICE ROLE.
// ===========================================================================
// Two different acts, two different authorities, and conflating them is the
// failure this comment exists to prevent:
//
//   WRITE   `createClient()` — the request-scoped client carrying the user's
//           JWT. `punch_list_items_insert_authenticated` still decides:
//           company_id = get_my_company_id() AND can_view_project(project_id).
//           Identical to what the client-direct insert faced. A reader who
//           "simplifies" this to getSupabaseAdmin() removes the only
//           authorisation on the endpoint, and every test still passes.
//
//   NOTIFY  the service role, and it HAS to be: `notifications` has NO INSERT
//           POLICY AT ALL, so no authenticated role can write a row — which is
//           exactly what stops a caller forging a notification to somebody
//           else. The row is written FOR the assignee, by the platform.

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
    parsed = punchItemCreateSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const result = await insertPunchItemAsCaller(supabase, parsed.data);
  if (!result.success) {
    // A policy refusal is 403 and says so. CLAUDE.md: an auth/permission
    // failure never falls through to a "not found" path, and the real cause is
    // always logged server-side even when the client message is generic.
    if (result.denied) {
      console.error(
        `[punch-items] RLS refused insert for user ${user.id} on project ${parsed.data.project_id}: ${result.error}`
      );
      return NextResponse.json(
        { error: 'You do not have access to this project.' },
        { status: 403 }
      );
    }
    console.error(`[punch-items] insert failed: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // ── §3b / §13.3 — notify the assignee. Best-effort from here down: the item
  // exists and is the business event; failing to announce it must not undo it.
  let assignment = { notified: false, emailOnly: null as string | null, unreachableName: null as string | null };
  if (parsed.data.assignee_id) {
    try {
      assignment = await notifyPunchAssigned(getSupabaseAdmin(), {
        companyId: profile.company_id,
        projectId: parsed.data.project_id,
        punchItemId: result.id!,
        punchTitle: parsed.data.title,
        memberId: parsed.data.assignee_id,
        assignerName: `${profile.first_name} ${profile.last_name}`.trim(),
        assignerProfileId: profile.id,
      });
    } catch (err) {
      console.error(
        `[punch-items] notify failed for ${result.id}:`,
        err instanceof Error ? err.message : 'unknown'
      );
    }
  }

  // §13.2's states travel back to the surface so it can show the non-blocking
  // notice — "1 subcontractor has no email on file and was not notified" —
  // rather than the assignment appearing to have reached somebody it did not.
  return NextResponse.json({ id: result.id, ...assignment });
}
