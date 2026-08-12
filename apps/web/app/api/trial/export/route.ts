import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { EXPORT_CATEGORY_KEYS } from '@/lib/trial/export-categories';
import { initialCursor } from '@/lib/trial/export';

// S138 — enqueue a data export (spec §4).
//
// ⚠️ THE ROW IS WRITTEN WITH THE SERVICE ROLE, ON PURPOSE. `export_jobs` has a
// SELECT policy for Owner/Admin and NO INSERT POLICY AT ALL (20260918000000),
// so a client cannot enqueue an export by writing the row directly. Role and
// lock state are checked here first, and only then is the job created. That is
// what stops an expired tenant from queueing an export through PostgREST.

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) {
    console.error(`[trial/export] no profile for user ${user.id}`);
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const role = (profile as { role: string }).role;
  if (!['owner', 'admin'].includes(role)) {
    console.error(`[trial/export] role ${role} attempted an export`);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const companyId = (profile as { company_id: string }).company_id;
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  // ⚠️ NO EXPORT AFTER EXPIRY. Ruled: the export window is the PRE-EXPIRY
  // period; once locked the account cannot be reached at all. Checked here as
  // well as in the middleware guard because this route could be reached with a
  // token issued before the lock.
  const { data: lifecycle } = await admin
    .from('trial_lifecycle')
    .select('locked_at')
    .eq('company_id', companyId)
    .maybeSingle();
  if (lifecycle && (lifecycle as { locked_at: string | null }).locked_at !== null) {
    return NextResponse.json(
      { error: 'Account locked — trial expired', code: 'TRIAL_LOCKED' },
      { status: 403 }
    );
  }

  let body: { categories?: unknown; format?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const categories = Array.isArray(body.categories) ? body.categories.map(String) : [];
  const unknown = categories.filter((c) => !EXPORT_CATEGORY_KEYS.includes(c));
  if (categories.length === 0) {
    return NextResponse.json({ error: 'Select at least one category' }, { status: 400 });
  }
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown categories: ${unknown.join(', ')}` }, { status: 400 });
  }

  const format = body.format === 'zip_csv' ? 'zip_csv' : 'zip';

  // One unfinished export at a time per company: a second would compete for the
  // same 240s worker slot and make both slower.
  const { data: inflight } = await admin
    .from('export_jobs')
    .select('id')
    .eq('company_id', companyId)
    .in('state', ['pending', 'running'])
    .limit(1);
  if ((inflight ?? []).length > 0) {
    return NextResponse.json(
      { error: 'An export is already running', job_id: (inflight as Array<{ id: string }>)[0].id },
      { status: 409 }
    );
  }

  const { data: job, error } = await admin
    .from('export_jobs')
    .insert({
      company_id: companyId,
      requested_by: (profile as { id: string }).id,
      categories,
      format,
      state: 'pending',
      cursor: initialCursor() as never,
    })
    .select('id, state, categories, format, created_at')
    .single();
  if (error) {
    console.error(`[trial/export] insert failed for company ${companyId}:`, error.message);
    return NextResponse.json({ error: 'Could not start the export' }, { status: 500 });
  }

  console.log(
    `[trial/export] company=${companyId} by=${(profile as { id: string }).id} categories=${categories.join('|')} format=${format}`
  );
  return NextResponse.json(job, { status: 201 });
}
