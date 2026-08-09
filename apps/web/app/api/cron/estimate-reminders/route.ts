import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/services/email-service';
import { runEstimateReminders } from '@/lib/notify/crons/estimate-reminders';

// 4J — the auth gate, the real clock and the REAL sender. The loop lives in
// lib/notify/crons/estimate-reminders.ts.
//
// This is the only place `sendEmail` is bound for this flow. The loop takes it
// as a dependency so a harness can drive the whole thing — including §3f's
// reminders-exhausted notification — without mailing a fabricated client. See
// ReminderDeps for why an injected sender rather than Resend's reserved
// addresses, and for what that choice does NOT prove.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runEstimateReminders(
    getSupabaseAdmin() as SupabaseClient<Database>,
    new Date(),
    { send: sendEmail, appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '' }
  );
  return NextResponse.json(outcome);
}
