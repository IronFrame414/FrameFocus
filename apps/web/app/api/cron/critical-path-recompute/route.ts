import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ensureScheduleFresh } from '@/lib/critical-path/recompute';

// S122 Part 3 — Q9 recompute trigger 9, THE PASSAGE OF TIME (report 2.4 note 2).
// An open task finishes no earlier than today and unstarted work starts no
// earlier than today, so a Critical Path schedule moves every working day with
// nobody touching it. Every CP project that is marked, or was last computed
// before its company's today, is recomputed here; every staff read does the
// same check first (the safety net when a run is missed).
//
// HOURLY, not daily: "today" turns over at a different UTC hour in each
// company's time zone; an hourly pass catches every turnover within the hour.
// A project already fresh costs one settings read. Secured by CRON_SECRET.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const { data, error } = await admin
    .from('project_schedule_settings')
    .select('project_id')
    .eq('critical_path_enabled', true)
    .eq('is_deleted', false)
    .order('project_id', { ascending: true });
  if (error) {
    console.error(`[cron critical-path-recompute] settings read: ${error.message}`);
    return NextResponse.json({ error: 'Could not read the schedule settings' }, { status: 500 });
  }

  const tally = { projects: data?.length ?? 0, recomputed: 0, fresh: 0, failed: 0 };
  for (const row of data ?? []) {
    const r = await ensureScheduleFresh(admin, row.project_id);
    if (r.status === 'computed') tally.recomputed++;
    else if (r.status === 'fresh') tally.fresh++;
    else if (r.status === 'failed') {
      tally.failed++;
      console.error(`[cron critical-path-recompute] ${row.project_id}: ${r.error}`);
    }
  }
  return NextResponse.json(tally);
}
