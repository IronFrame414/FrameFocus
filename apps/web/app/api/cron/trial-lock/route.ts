import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runTrialLock, runTrialUnlockReconcile } from '@/lib/trial/lifecycle';

// S137 — expiry. Locks the account and starts the 14-day retention clock.
// Spec §6.
//
// ⚠️ THIS LOCKS, IT DOES NOT DELETE. The lock BANS the company's auth users
// and is reversible in one call (unlockCompany). Deleting is a different route
// that is deliberately not scheduled — see ../trial-deletion/route.ts.
//
// CRON_SECRET is not optional: an unauthenticated caller here locks paying
// customers out of their own product.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  // ⚠️ RECONCILE BEFORE LOCKING [S138]. A company that has paid but is still
  // flagged locked must be released before this run considers anything else —
  // otherwise a missed webhook keeps a paying customer banned for another full
  // day, every day, and nothing in the system ever notices.
  const unlocked = await runTrialUnlockReconcile(admin);

  const outcome = await runTrialLock(admin, new Date());
  return NextResponse.json({ ...outcome, unlocked });
}
