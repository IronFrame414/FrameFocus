import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runTrialWarnings } from '@/lib/trial/lifecycle';

// S137 — the day −7 and day −3 trial warnings. Spec §7.
//
// The LOOP lives in lib/trial/lifecycle.ts so a harness can drive it with an
// injected clock; this file is the auth gate and the real clock, the split
// every cron in this repo uses.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runTrialWarnings(
    getSupabaseAdmin() as SupabaseClient<Database>,
    new Date()
  );
  return NextResponse.json(outcome);
}
