import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { deleteScheduleTemplate } from '@/lib/critical-path/templates';

// S122 Part 8 — DELETE (soft) A TEMPLATE. Owner/Admin only; RLS decides (0 rows → 403).

function json(status: number, error: string, cause: string) {
  // Every error response logs the real cause server-side (CLAUDE.md, Errors).
  console.error(`[templates delete] ${status}: ${cause}`);
  return NextResponse.json({ error }, { status });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, 'Invalid template.', `bad id ${id}`);
  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, 'Not signed in.', 'no user');
  const r = await deleteScheduleTemplate(supabase, id);
  if (!r.ok) return json(r.status, r.error, r.cause);
  return NextResponse.json({ ok: true });
}
