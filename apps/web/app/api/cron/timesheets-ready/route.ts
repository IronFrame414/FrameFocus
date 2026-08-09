import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runTimesheetsReady } from '@/lib/notify/crons/timesheets-ready';

// §3h / ND-9 — the auth gate and the real clock. The LOOP lives in
// lib/notify/crons/timesheets-ready.ts.
//
// The split is not tidiness. A Next.js `route.ts` may only export route
// handlers and a fixed set of config keys — exporting the loop from here fails
// the build's own route type-check — and the loop is exactly the thing that
// needs to be callable from a harness with an injected clock. Same shape as
// ND-18's write halves: the route supplies what only a request can supply
// (auth, the real `new Date()`), the module holds the behaviour.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runTimesheetsReady(
    getSupabaseAdmin() as SupabaseClient<Database>,
    new Date()
  );
  return NextResponse.json(outcome);
}
