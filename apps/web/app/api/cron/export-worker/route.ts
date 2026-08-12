import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runExportSweep } from '@/lib/trial/export-sweep';

// S138 — the export worker (spec §4c).
//
// Advances ONE unfinished export by one invocation's worth of work, and sweeps
// completed exports past their 24-hour life.
//
// ⚠️ THIS ONE IS SCHEDULED, AND THAT IS NOT A CONTRADICTION OF THE DELETION
// RULE. `/api/cron/trial-deletion` is unscheduled because TL-24 — whether we
// may destroy customer data on that timetable — is with legal. This route
// CREATES a copy of the customer's data for the customer and removes only the
// export artefacts it made itself. Nothing here destroys tenant data, so
// nothing here is blocked on that ruling.
//
// Every 5 minutes: a large export is ~58 invocations, so a slower cadence would
// stretch a 4.8-hour export into days.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runExportSweep(
    getSupabaseAdmin() as SupabaseClient<Database>,
    new Date()
  );
  return NextResponse.json(outcome);
}
