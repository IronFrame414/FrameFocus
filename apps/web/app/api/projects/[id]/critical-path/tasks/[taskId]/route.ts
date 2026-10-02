import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { criticalPathTaskSaveSchema } from '@framefocus/shared/validation/critical-path';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getMyMember } from '@/lib/services/members';
import { applyCriticalPathSave, readCriticalPathTask, untoldOf } from '@/lib/critical-path/save';

// [S123 D-3] The ceiling for this invocation INCLUDING the notifications sent
// after the response (lib/critical-path/background.ts). Stated, not inherited
// from a project default nobody can read from the code. Sends that would start
// within 5 s of it are not started and are logged 'failed' with the reason.
export const maxDuration = 60;

// S122 Part 3 — SAVE ONE TASK OF A CRITICAL PATH PROJECT (the line sheet),
// then recompute. The mechanism — who may write, what is written, when the
// engine runs — is lib/critical-path/save.ts, shared with the gesture route
// (…/move) so a sheet edit and a drag cannot disagree (PARITY).

function json(status: number, error: string, cause: string) {
  // Every error response logs the real cause server-side (CLAUDE.md, Errors).
  console.error(`[critical-path save] ${status}: ${cause}`);
  return NextResponse.json({ error }, { status });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: projectId, taskId } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, 'The request body is not JSON.', 'body parse');
  }
  const parsed = criticalPathTaskSaveSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, parsed.error.issues[0]?.message ?? 'Invalid request.', `zod: ${parsed.error.message}`);
  }

  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, 'Not signed in.', 'no user');

  const t = await readCriticalPathTask(supabase, projectId, taskId);
  if (!t.ok) return json(t.status, t.error, t.cause);

  const me = await getMyMember();
  const r = await applyCriticalPathSave(
    supabase,
    getSupabaseAdmin() as SupabaseClient<Database>,
    { projectId, taskId, companyId: t.companyId, userId: user.id, savedByMemberId: me?.id ?? null },
    parsed.data
  );
  if (!r.ok) return json(r.status, r.error, r.cause);
  // `held`: the caller's schedule change is waiting for approval (Part 5).
  // `untold` [Part 6]: who chose to be told and could not be — the saver is shown it.
  return NextResponse.json({ ok: true, held: r.held, recompute: r.recompute, untold: untoldOf(r.recompute) });
}
