import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { runTrashPurge } from '@/lib/files/trash-purge';

// The 6-month trash purge [storage-archive-ai-spec §3]. Daily; deletes
// trashed files past retention — object first, row second, orphan rows
// counted separately. A retention behaviour the privacy policy states, so
// this entry ships scheduled (vercel.json), unlike the tenant-deletion sweep.

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const outcome = await runTrashPurge(admin, new Date());
  return NextResponse.json(outcome);
}
