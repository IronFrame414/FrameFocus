import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { qboWrite } from '@/lib/quickbooks/client';
import { getAccessToken } from '@/lib/quickbooks/tokens';
import { parseCustomerConflict } from '@/lib/quickbooks/entities';

/**
 * 7G §5.2 — the customer-conflict answer.
 *
 * ⚠️ "ASK, NEVER AUTO-CREATE A DUPLICATE" [S103] IS WHY THIS ROUTE EXISTS. The
 * worker stops when a client's name already names a QuickBooks Customer and
 * parks the row with the question. This is where the answer is recorded.
 *
 * Two answers, and both are honest about what QuickBooks allows:
 *   `link`       — this IS that customer. Writes `contacts.qb_customer_id` and
 *                  completes the queue row.
 *   `create_new` — a DIFFERENT customer that happens to share a name. Requires
 *                  a NEW display name, because QuickBooks enforces DisplayName
 *                  uniqueness: "create another Acme Builders" is not a request
 *                  QuickBooks can satisfy, and offering it without a name field
 *                  would be offering a button that always fails.
 *
 * Owner/Admin — this maps a client to a ledger record, which is the Admin
 * Role Principle's default (not billing, not an Owner-only action).
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

  if (!profile || !['owner', 'admin'].includes(profile.role as string)) {
    console.error(`[qb-conflict] denied: user=${user.id} role=${profile?.role ?? 'none'}.`);
    return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
  }

  const companyId = profile.company_id as string;

  let body: { queueRowId?: string; choice?: string; newDisplayName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (!body.queueRowId || (body.choice !== 'link' && body.choice !== 'create_new')) {
    return NextResponse.json({ error: 'A queue row and a choice are required.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // ⚠️ SCOPED BY company_id, not just by row id. The service role bypasses RLS,
  // so without this an Admin could answer another tenant's conflict by guessing
  // a uuid.
  const { data: row } = await admin
    .from('qb_sync_queue')
    .select('id, company_id, entity_type, entity_id, operation, last_error, status')
    .eq('id', body.queueRowId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: 'That sync item no longer exists.' }, { status: 404 });
  if (row.entity_type !== 'customer') {
    return NextResponse.json({ error: 'That sync item is not a customer conflict.' }, { status: 400 });
  }

  const conflict = parseCustomerConflict(row.last_error as string | null);
  if (!conflict) {
    return NextResponse.json({ error: 'That sync item has no pending conflict.' }, { status: 409 });
  }

  if (body.choice === 'link') {
    const { error } = await admin
      .from('contacts')
      .update({ qb_customer_id: conflict.qbCustomerId })
      .eq('id', row.entity_id as string)
      .eq('company_id', companyId);

    if (error) {
      console.error(`[qb-conflict] link failed for contact ${row.entity_id}:`, error.message);
      return NextResponse.json({ error: 'Could not link the client.' }, { status: 500 });
    }

    // The work this row represented is now done — the mapping exists.
    await completeRow(admin, row.id as string, companyId);
    return NextResponse.json({ ok: true, linked: conflict.qbCustomerId });
  }

  // create_new
  const newName = body.newDisplayName?.trim();
  if (!newName) {
    return NextResponse.json(
      { error: 'A different name is required — QuickBooks will not accept a duplicate.' },
      { status: 400 }
    );
  }
  if (newName === conflict.displayName) {
    return NextResponse.json(
      { error: 'That is the same name. QuickBooks needs a different one.' },
      { status: 400 }
    );
  }

  const conn = await getAccessToken(admin, companyId);
  if (!conn) {
    return NextResponse.json(
      { error: 'QuickBooks is not connected, or needs to be reconnected.' },
      { status: 409 }
    );
  }

  let created;
  try {
    created = (await qboWrite(conn, '/customer', { DisplayName: newName })) as {
      Customer?: { Id?: string };
    };
  } catch (err) {
    console.error(`[qb-conflict] create failed for company=${companyId}:`, err);
    return NextResponse.json(
      { error: (err as Error).message || 'QuickBooks refused the new customer.' },
      { status: 502 }
    );
  }

  const qbId = created.Customer?.Id;
  if (!qbId) {
    return NextResponse.json({ error: 'QuickBooks returned no customer id.' }, { status: 502 });
  }

  const { error } = await admin
    .from('contacts')
    .update({ qb_customer_id: qbId })
    .eq('id', row.entity_id as string)
    .eq('company_id', companyId);

  if (error) {
    console.error(`[qb-conflict] write-back failed for contact ${row.entity_id}:`, error.message);
    return NextResponse.json({ error: 'Created in QuickBooks, but could not link it here.' }, { status: 500 });
  }

  await completeRow(admin, row.id as string, companyId);
  return NextResponse.json({ ok: true, created: qbId });
}

/**
 * Mark the conflict row done and release anything waiting on it.
 *
 * ⚠️ THE SECOND UPDATE IS THE POINT. The invoice that triggered this is parked
 * behind `depends_on_id`, and `claimDue()` only releases a dependant once its
 * dependency is `pushed`. Clearing the dependants' `next_attempt_at` makes the
 * next drain pick them up immediately rather than after their backoff.
 */
async function completeRow(
  admin: ReturnType<typeof getSupabaseAdmin>,
  rowId: string,
  companyId: string
): Promise<void> {
  await admin
    .from('qb_sync_queue')
    .update({ status: 'pushed', last_error: null, next_attempt_at: null })
    .eq('id', rowId)
    .eq('company_id', companyId);

  await admin
    .from('qb_sync_queue')
    .update({ next_attempt_at: null })
    .eq('company_id', companyId)
    .eq('depends_on_id', rowId)
    .eq('status', 'queued');
}
