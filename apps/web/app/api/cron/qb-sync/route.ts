import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runQbSync } from '@/lib/quickbooks/worker';

/**
 * 7G — the sync worker's schedule. Every five minutes, matching
 * `/api/cron/export-worker`'s cadence and its `CRON_SECRET` auth.
 *
 * ⚠️ THE CADENCE IS A QUOTA DECISION AS WELL AS A LATENCY ONE. The OUTBOUND
 * path (invoices, bills, customers) is Core — FREE and uncapped — so draining
 * often costs nothing. The metered reads are the SyncToken fetches on
 * update/void and the account/vendor lookups, which is why those are memoised
 * per drain.
 *
 * ⚠️ A DRAIN NEVER THROWS PAST THIS HANDLER. A 500 here would make Vercel retry
 * the whole sweep, and a sweep that half-succeeded must not be re-run
 * wholesale — the queue's own row states are the recovery mechanism, not a
 * retried HTTP request.
 */

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const outcome = await runQbSync(getSupabaseAdmin());
    return NextResponse.json(outcome);
  } catch (err) {
    console.error('[qb-sync-cron] drain failed:', err);
    return NextResponse.json({ error: 'Drain failed' }, { status: 200 });
  }
}
