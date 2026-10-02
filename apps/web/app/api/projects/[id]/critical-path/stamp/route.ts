import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { scheduleTemplateStampSchema } from '@framefocus/shared/validation/critical-path';
import { getMyMember } from '@/lib/services/members';
import { stampScheduleTemplate } from '@/lib/critical-path/templates';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// [S123 D-3] The ceiling for this invocation INCLUDING the notifications sent
// after the response (lib/critical-path/background.ts). Stated, not inherited
// from a project default nobody can read from the code. Sends that would start
// within 5 s of it are not started and are logged 'failed' with the reason.
export const maxDuration = 60;

// S122 Part 8 — STAMP A TEMPLATE ONTO A PROJECT WITH ONE START DATE, then
// compute. ⚠️ A project that already has tasks is REFUSED (409) with the count
// [Josh, RULED]. The mechanism is lib/critical-path/templates.ts.

function json(status: number, error: string, cause: string) {
  // Every error response logs the real cause server-side (CLAUDE.md, Errors).
  console.error(`[templates stamp] ${status}: ${cause}`);
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, 'The request body is not JSON.', 'body parse');
  }
  const parsed = scheduleTemplateStampSchema.safeParse(raw);
  if (!parsed.success) return json(400, parsed.error.issues[0]?.message ?? 'Invalid request.', `zod: ${parsed.error.message}`);
  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, 'Not signed in.', 'no user');
  const me = await getMyMember();
  const r = await stampScheduleTemplate(supabase, getSupabaseAdmin() as SupabaseClient<Database>, {
    projectId,
    templateId: parsed.data.templateId,
    startDate: parsed.data.startDate,
    savedByMemberId: me?.id ?? null,
  });
  if (!r.ok) return json(r.status, r.error, r.cause);
  return NextResponse.json({ ok: true, tasks: r.tasks, projectedFinish: r.recompute.status === 'computed' ? r.recompute.projectedFinish : null });
}
