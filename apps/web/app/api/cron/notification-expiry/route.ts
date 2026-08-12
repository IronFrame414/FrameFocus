import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runNotificationExpiry } from '@/lib/notify/crons/notification-expiry';

// ND-41 — parent R2's 30-day expiry, finally scheduled. The LOOP lives in
// lib/notify/crons/notification-expiry.ts so it is callable from a harness with
// an injected clock; this file is the auth gate and the real clock, the same
// split every other cron in this directory uses.
//
// ⚠️ CRON_SECRET IS NOT OPTIONAL ON A DELETE ENDPOINT. Every other cron route
// gates on it, and this is the last one that should not: an unauthenticated
// caller here destroys data rather than merely sending an email early. A-N45's
// sibling criterion asserts the 401.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runNotificationExpiry(
    getSupabaseAdmin() as SupabaseClient<Database>,
    new Date()
  );
  return NextResponse.json(outcome);
}
