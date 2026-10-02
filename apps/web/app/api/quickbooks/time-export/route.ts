import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/**
 * S124 Part 2 — turn the QuickBooks time export on or off. Owner only
 * [Josh, RULED Q4: "timesheets are payroll and payroll is money out"].
 *
 * ⚠️ THE WRITE GOES THROUGH THE USER'S OWN SESSION, NOT THE SERVICE ROLE, so
 * `enforce_companies_qb_time_export` judges the real caller: it refuses a
 * non-Owner (42501) and refuses turning it on while QuickBooks is not connected.
 * The role check here is the second layer, not the only one.
 *
 * ⚠️ NOTHING IS QUEUED OR SENT BY THIS ROUTE. Turning it on never backfills;
 * turning it off deletes nothing in QuickBooks.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    console.error(`[qb-time-export] denied: user=${user.id} role=${profile?.role ?? 'none'}.`);
    return NextResponse.json(
      { error: 'Only the Owner can turn QuickBooks time export on or off.' },
      { status: 403 }
    );
  }

  let body: { enabled?: unknown };
  try {
    body = (await request.json()) as { enabled?: unknown };
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be true or false.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('companies')
    .update({ qb_time_export_enabled: body.enabled })
    .eq('id', profile.company_id as string);

  if (error) {
    console.error(
      `[qb-time-export] save failed company=${profile.company_id} enabled=${body.enabled} code=${error.code}:`,
      error.message
    );
    if (error.code === '42501') {
      return NextResponse.json(
        { error: 'Only the Owner can turn QuickBooks time export on or off.' },
        { status: 403 }
      );
    }
    if (error.code === '22023') {
      return NextResponse.json(
        { error: 'Connect QuickBooks before turning on time export.' },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: 'The change could not be saved.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, enabled: body.enabled });
}
