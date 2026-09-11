import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runEmailWarming } from '@/lib/services/warming-email';

// The warming sender's tick [Josh, deliverability session, 2026-09-10].
//
// The LOOP lives in lib/services/warming-email.ts so a harness can drive it
// with an injected clock AND an injected random; this file is the auth gate and
// the real clock, the split every cron in this repo uses.
//
// SCHEDULED `*/15 13-22 * * 1-5` — 40 fires a weekday, 200 a week, of which
// roughly 24 actually send. Most ticks deliberately do nothing: the schedule is
// the SUBSTRATE for irregular spacing, not the send rate. See `shouldSendNow`.
//
// ⚠️ WHY A FOURTEENTH CRON RATHER THAN FOLDING INTO AN EXISTING ONE.
// `context104.md:130` records that a malformed `vercel.json` "failed the deploy
// with eleven migrations already on production and no local test that could have
// caught it", and S104 concluded from that a new job should fold into an
// existing route. That conclusion does not transfer here, and the difference is
// specific: S104 folded a QuickBooks backstop into the QuickBooks sync job —
// same domain, same blast radius, already metered. Warming has nothing to do
// with timesheets, clocked-in crews or export workers, and hiding it inside one
// of them means an unrelated concern in an unrelated handler that stops
// silently when that handler breaks.
//
// The S103 risk is closed by a TEST instead of by avoiding the file:
// `s152-cron-absence.test.ts` already JSON.parses `vercel.json` in CI, and now
// pins this entry's path AND schedule. That is a stronger guarantee than the
// other thirteen entries have.

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runEmailWarming(
    getSupabaseAdmin() as SupabaseClient<Database>,
    new Date()
  );
  return NextResponse.json(outcome);
}
