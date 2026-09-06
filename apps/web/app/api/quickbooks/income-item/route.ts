import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { listIncomeItems } from '@/lib/quickbooks/connection';
import { getAccessToken } from '@/lib/quickbooks/tokens';

/**
 * 7G §5.1 — choose or remap the QuickBooks income Item invoices post against.
 *
 * ⚠️ RULED [S103, Q10]: THIS ROUTE NEVER CREATES AN ITEM. It lists what already
 * exists in the connected QuickBooks company and stores the Owner's choice.
 * Creating one would write to the customer's chart of accounts on a guess.
 *
 * Owner-only, matching the connection itself (CLAUDE.md owner-only #4) and the
 * `enforce_companies_qb_scope` trigger, which would raise anyway.
 */

export const dynamic = 'force-dynamic';

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    console.error(`[qb-income-item] denied: user=${user.id} role=${profile?.role ?? 'none'}.`);
    return {
      error: NextResponse.json(
        { error: 'Only the Owner can change the QuickBooks income item.' },
        { status: 403 }
      ),
    };
  }
  return { companyId: profile.company_id as string };
}

/** List the candidate items from QuickBooks. Costs one metered read. */
export async function GET() {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  const admin = getSupabaseAdmin();
  const conn = await getAccessToken(admin, gate.companyId!);
  if (!conn) {
    return NextResponse.json(
      { error: 'QuickBooks is not connected, or needs to be reconnected.' },
      { status: 409 }
    );
  }

  const items = await listIncomeItems(admin, conn);
  return NextResponse.json({ items });
}

/** Store the chosen item. The id and name are BOTH kept — the name is what the
 *  screen shows, and re-reading it from QuickBooks would cost a metered call
 *  every time the page renders. */
export async function POST(request: NextRequest) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  let body: { id?: string; name?: string };
  try {
    body = (await request.json()) as { id?: string; name?: string };
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (!body.id || !body.name) {
    return NextResponse.json({ error: 'An item id and name are required.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('companies')
    .update({ qb_income_item_id: body.id, qb_income_item_name: body.name })
    .eq('id', gate.companyId!);

  if (error) {
    console.error(`[qb-income-item] save failed for company=${gate.companyId}:`, error.message);
    return NextResponse.json({ error: 'Could not save the item.' }, { status: 500 });
  }

  // ⚠️ WAKE THE PARKED WORK. Invoices that parked with "no income item" are
  // sitting `queued` with a five-minute re-check. Clearing next_attempt_at makes
  // the very next drain pick them up instead of leaving the Owner wondering why
  // nothing happened after they answered the question.
  await admin
    .from('qb_sync_queue')
    .update({ next_attempt_at: null })
    .eq('company_id', gate.companyId!)
    .eq('status', 'queued')
    .eq('is_deleted', false);

  return NextResponse.json({ ok: true });
}
