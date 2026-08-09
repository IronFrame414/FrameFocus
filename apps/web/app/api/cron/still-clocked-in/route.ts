import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runStillClockedIn } from '@/lib/notify/crons/still-clocked-in';

// §3j — the auth gate and the real clock. The LOOP lives in
// lib/notify/crons/still-clocked-in.ts.
//
// A Next.js `route.ts` may only export route handlers and a fixed set of config
// keys, so the loop cannot live here AND be callable from a harness with an
// injected clock. Same shape as ND-18's write halves.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runStillClockedIn(getSupabaseAdmin() as SupabaseClient<Database>, new Date());
  return NextResponse.json(outcome);
}
