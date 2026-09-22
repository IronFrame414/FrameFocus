import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runSchemaDrift } from '@/lib/services/schema-drift';

// S108 C2 — the schema-drift tick. The LOOP lives in
// lib/services/schema-drift.ts; this file is the auth gate, which is the split
// every cron in this repo uses.
//
// ⚠️ AND THE SPLIT IS LOAD-BEARING HERE, not just conventional. A Next.js route
// file may only export a fixed set of names, so the comparison helpers the
// harness drives CANNOT live in this file — the first cut put them here, passed
// `tsc --noEmit`, and failed `next build` with `"compareFingerprints" is not a
// valid Route export field`.

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const outcome = await runSchemaDrift(getSupabaseAdmin() as SupabaseClient<Database>);
  return NextResponse.json(outcome);
}
