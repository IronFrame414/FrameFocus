import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { unlockCompany } from '@/lib/trial/lifecycle';

// S138 — path 4 of 4: the platform-admin override.
//
// ⚠️ A ROUTE AND NOT A BUTTON, DELIBERATELY. Josh asked for an admin unlock
// control; there is **no `/admin` route tree in this repo at all** (checked —
// `app/admin/` does not exist, and `platform_admins` is referenced by exactly
// one line of application code). Building an admin dashboard to host one
// button is a different piece of work. This is the mechanism, callable now,
// ready for a button when that surface exists.
//
// ⚠️ PLATFORM ADMIN, NOT COMPANY OWNER. A company must never be able to
// release its own lock — that is the whole mechanism defeated by one fetch.
// The membership check reads `platform_admins` with the SERVICE ROLE on
// purpose: that table is not company-scoped, so a tenant-scoped client is the
// wrong instrument for asking "is this person staff".

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: staff } = await admin
    .from('platform_admins')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!staff) {
    // Logged with the real cause, answered with a generic one — and a 403, not
    // a 404. CLAUDE.md: a permission failure never falls through to "not found".
    console.error(`[admin/trial-unlock] non-platform-admin ${user.id} attempted an unlock`);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let companyId: string | undefined;
  try {
    companyId = (await request.json())?.company_id;
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  if (!companyId || typeof companyId !== 'string') {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 });
  }

  const { data: lifecycle } = await admin
    .from('trial_lifecycle')
    .select('company_id, locked_at')
    .eq('company_id', companyId)
    .maybeSingle();
  if (!lifecycle) {
    return NextResponse.json({ error: 'No trial lifecycle for that company' }, { status: 404 });
  }

  const { unbanned } = await unlockCompany(admin, companyId);
  console.log(
    `[admin/trial-unlock] platform admin ${user.id} unlocked company=${companyId} unbanned=${unbanned}`
  );

  return NextResponse.json({
    company_id: companyId,
    was_locked: (lifecycle as { locked_at: string | null }).locked_at !== null,
    unbanned,
  });
}
