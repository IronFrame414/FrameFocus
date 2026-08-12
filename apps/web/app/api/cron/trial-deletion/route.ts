import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runTrialDeletion } from '@/lib/trial/deletion';

// ===========================================================================
// ⚠️⚠️  THIS ROUTE IS BUILT, TESTED, AND DELIBERATELY NOT SCHEDULED.  ⚠️⚠️
// ===========================================================================
//
// **IF YOU CAME HERE BECAUSE THERE IS NO ENTRY FOR `/api/cron/trial-deletion`
// IN `apps/web/vercel.json`: THAT IS NOT AN OVERSIGHT. DO NOT ADD ONE.**
//
// TL-24 — whether these records may be deleted on this timetable AT ALL — is
// UNANSWERED and with professional legal review. Some of what this destroys is
// material a construction company is legally required to retain: signed
// contracts, change orders, lien releases, safety incidents, daily logs that
// evidence what happened on site on a given day. Legal review can invalidate
// the expiry ruling entirely.
//
// Adding one line to `vercel.json` turns this into a job that permanently
// destroys customer data across every company-scoped table and three storage
// buckets, on a 14-day timer, with no further human step.
//
// **That line is Josh's to add, after legal returns.** The same warning is in
// `docs/specs/trial-lifecycle-spec.md` and in the header of
// `supabase/migrations/20260918000000_trial_lifecycle.sql`.
//
// ---------------------------------------------------------------------------
// The route still exists, and still gates on CRON_SECRET, for two reasons: the
// job has to be testable before it is trusted, and when the schedule is finally
// added the thing being scheduled should be code that has already been
// exercised rather than code written in a hurry on the day of the ruling.
// ===========================================================================

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runTrialDeletion(
    getSupabaseAdmin() as SupabaseClient<Database>,
    new Date()
  );
  return NextResponse.json(outcome);
}
