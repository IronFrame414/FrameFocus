import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getMyMember } from '@/lib/services/members';
import { decideScheduleEdit } from '@/lib/critical-path/held';

// S122 Part 5 — decide a held schedule change: approve (an Owner, Admin, the
// project's PM or PE, never the submitter — applied through the one save
// path), reject, or withdraw (the submitter). The approval lives INSIDE the
// Critical Path tab [Josh]; this is the route its buttons call.

const bodySchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'withdraw']),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

function json(status: number, error: string, cause: string) {
  console.error(`[critical-path decide] ${status}: ${cause}`);
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; editId: string }> }) {
  const { id: projectId, editId } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, 'The request body is not JSON.', 'body parse');
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json(400, parsed.error.issues[0]?.message ?? 'Invalid request.', `zod: ${parsed.error.message}`);

  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, 'Not signed in.', 'no user');

  const me = await getMyMember();
  const r = await decideScheduleEdit(
    supabase,
    getSupabaseAdmin() as SupabaseClient<Database>,
    { projectId, editId, userId: user.id, myMemberId: me?.id ?? null },
    parsed.data.decision,
    parsed.data.note ?? null
  );
  if (!r.ok) return json(r.status, r.error, r.cause);
  // `untold` [S122 Part 6]: an approval applies the change, so the approver is shown who could not be told.
  return NextResponse.json({ ok: true, untold: r.untold });
}
