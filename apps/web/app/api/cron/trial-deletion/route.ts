import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runTrialDeletion, listDueForDeletion } from '@/lib/trial/deletion';

// ===========================================================================
// ✅  THIS ROUTE IS SCHEDULED — the Q8 chain closed [Josh, 2026-08-30].
// ===========================================================================
//
// `vercel.json` carries `/api/cron/trial-deletion` at 15:00 daily — after the
// retention warnings (14:30) and the lock (14:15), so a day's warnings always
// precede that day's sweep. This job permanently destroys customer data
// across every company-scoped table and three storage buckets, on a timer,
// with no further human step — which is why the entry landed LAST, at the end
// of the ruled chain, and not with the build:
//
//   #126 email deliverability VERIFIED (2026-08-30 — a real send inspected in
//   Gmail: SPF/DKIM/DMARC all PASS, inbox delivery) → the retention warnings
//   shipped and live (/api/cron/retention-warnings, 14:30 daily) → the
//   production dry run (`?dry_run=1` below) hand-reviewed CLEAN —
//   {"dryRun":true,"due":[]}, no past-due-and-unwarned company exists →
//   Josh ruled: add the line.
//
// _Superseded banner, quoted not rewritten:_ "THIS ROUTE IS BUILT, TESTED,
// AND DELIBERATELY NOT SCHEDULED. … IF YOU CAME HERE BECAUSE THERE IS NO
// ENTRY … THAT IS NOT AN OVERSIGHT. DO NOT ADD ONE. … That line is still
// Josh's to add, at the end of the chain." That absence was load-bearing
// while TL-24 was with legal and the chain was open; both are resolved, and
// `s137-trial-lifecycle.live.ts` + `s152-cron-absence.test.ts` now assert
// PRESENCE — removing the entry silently stops a published retention
// behaviour. History: TECH_DEBT #1-trial, GATED.md → TRIAL LIFECYCLE,
// docs/specs/deletion-sweep-build-log.md.
//
// ---------------------------------------------------------------------------
// The dry run (`?dry_run=1`) stays: it is the standing review tool for "who
// would be deleted", zero writes, same selection code as the real run.
// ===========================================================================

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  // The Q8 dry run: WHO would be deleted, with ZERO writes. This is what was
  // hand-reviewed before the cron entry landed (clean — due:[]), and it stays
  // as the standing review tool — same selection code as the real run, so the
  // review reviews the truth.
  if (request.nextUrl.searchParams.get('dry_run') === '1') {
    const due = await listDueForDeletion(admin, new Date());
    return NextResponse.json({ dryRun: true, due });
  }

  const outcome = await runTrialDeletion(admin, new Date());
  return NextResponse.json(outcome);
}
