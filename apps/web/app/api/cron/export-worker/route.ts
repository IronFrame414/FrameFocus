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
// This route CREATES a copy of the customer's data for the customer and
// removes only the export artefacts it made itself. Nothing here destroys
// tenant data. (Historical: while `/api/cron/trial-deletion` was deliberately
// unscheduled under the TL-24 gate, this header explained why scheduling THIS
// route was not a loosening of that gate. The gate closed 2026-08-30 and the
// deletion cron is now scheduled too — see ../trial-deletion/route.ts.)
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
