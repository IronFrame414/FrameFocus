import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runTrialDeletion, listDueForDeletion } from '@/lib/trial/deletion';

// ===========================================================================
// ⚠️⚠️  THIS ROUTE IS BUILT, TESTED, AND DELIBERATELY NOT SCHEDULED.  ⚠️⚠️
// ===========================================================================
//
// **IF YOU CAME HERE BECAUSE THERE IS NO ENTRY FOR `/api/cron/trial-deletion`
// IN `apps/web/vercel.json`: THAT IS NOT AN OVERSIGHT. DO NOT ADD ONE.**
//
// ⚠️ AMENDED [deletion-sweep session]: TL-24's legal hold is RELEASED — the
// superseded text below said it was "UNANSWERED and with professional legal
// review"; the terms are now written and reviewed, and Josh ruled: schedule
// it. What gates the entry NOW is the Q8 chain (deletion-sweep-analysis.md):
//
//   #126 email deliverability verified (DONE 2026-08-30 — inspected send,
//   SPF/DKIM/DMARC all PASS) → the retention warnings ship (done,
//   /api/cron/retention-warnings) → warning coverage elapses for
//   already-locked companies → the first run's scope is reviewed BY HAND
//   (`?dry_run=1` below) → the vercel.json entry lands.
//
// Adding one line to `vercel.json` turns this into a job that permanently
// destroys customer data across every company-scoped table and three storage
// buckets, on a timer, with no further human step.
//
// **That line is still Josh's to add, at the end of the chain.** The same
// gate is recorded in TECH_DEBT #1-trial and GATED.md → TRIAL LIFECYCLE.
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

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  // The Q8 dry run: WHO would be deleted, with ZERO writes. This is what gets
  // hand-reviewed before the cron entry ever lands — same selection code as
  // the real run, so the review reviews the truth.
  if (request.nextUrl.searchParams.get('dry_run') === '1') {
    const due = await listDueForDeletion(admin, new Date());
    return NextResponse.json({ dryRun: true, due });
  }

  const outcome = await runTrialDeletion(admin, new Date());
  return NextResponse.json(outcome);
}
