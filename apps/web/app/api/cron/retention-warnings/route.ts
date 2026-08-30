import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runRetentionWarnings } from '@/lib/trial/retention-warnings';

// The retention warnings cron [R3]. The loop lives in
// lib/trial/retention-warnings.ts with `now` injected (the house shape —
// route.ts is the auth gate and the real-clock binding, nothing else).
//
// Scheduled daily in vercel.json. ⚠️ The DELETION sweep is NOT scheduled by
// this or anything else yet — Q8's chain (deliverability verified → warnings
// ship → coverage elapses → hand-reviewed first run) gates that entry.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const outcome = await runRetentionWarnings(admin, new Date());
  return NextResponse.json(outcome);
}
