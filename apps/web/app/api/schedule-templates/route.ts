import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { scheduleTemplateSaveSchema } from '@framefocus/shared/validation/critical-path';
import { saveScheduleTemplate } from '@/lib/critical-path/templates';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// S122 Part 8 — SAVE A PROJECT'S NETWORK AS A TEMPLATE (Owner/Admin; RLS decides).
// The mechanism is lib/critical-path/templates.ts.

function json(status: number, error: string, cause: string) {
  // Every error response logs the real cause server-side (CLAUDE.md, Errors).
  console.error(`[templates save] ${status}: ${cause}`);
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(400, 'The request body is not JSON.', 'body parse');
  }
  const parsed = scheduleTemplateSaveSchema.safeParse(raw);
  if (!parsed.success) return json(400, parsed.error.issues[0]?.message ?? 'Invalid request.', `zod: ${parsed.error.message}`);
  const supabase = (await createClient()) as unknown as SupabaseClient<Database>;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, 'Not signed in.', 'no user');
  const r = await saveScheduleTemplate(supabase, getSupabaseAdmin() as SupabaseClient<Database>, parsed.data);
  if (!r.ok) return json(r.status, r.error, r.cause);
  return NextResponse.json(r);
}
