import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { listPaymentAccounts } from '@/lib/quickbooks/connection';
import { getAccessToken } from '@/lib/quickbooks/tokens';

/**
 * 7G M-G — choose the account a QuickBooks **Purchase** is posted against.
 *
 * ⚠️ THIS IS THE ACCOUNT THE MONEY CAME FROM, not the account it was spent on.
 * The expense account is the `gl_account_*` mapping on the same settings tab.
 * Both are required by the Purchase API, they are both called `AccountRef` one
 * level apart in the request body, and swapping them posts the spend to the
 * bank. The screen labels them accordingly.
 *
 * ⚠️ IT NEVER CREATES AN ACCOUNT — same ruling as the income item (S103 Q10).
 * It lists what the connected company already has and stores the Owner's
 * choice. Creating one would write to the customer's chart of accounts.
 *
 * Owner-only, matching `enforce_companies_qb_scope`, which M-G extended to
 * cover these three columns and which would raise anyway.
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
    console.error(`[qb-payment-account] denied: user=${user.id} role=${profile?.role ?? 'none'}.`);
    return {
      error: NextResponse.json(
        { error: 'Only the Owner can change the QuickBooks payment account.' },
        { status: 403 }
      ),
    };
  }
  return { companyId: profile.company_id as string };
}

/** List the bank and credit-card accounts. Costs one metered read. */
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

  const accounts = await listPaymentAccounts(admin, conn);
  return NextResponse.json({ accounts });
}

const PAYMENT_TYPES = ['Cash', 'Check', 'CreditCard'];

/** Store the choice. Id and name BOTH kept — the name is what the screen shows,
 *  and re-reading it from QuickBooks would cost a metered call per render. */
export async function POST(request: NextRequest) {
  const gate = await requireOwner();
  if (gate.error) return gate.error;

  let body: { id?: string; name?: string; paymentType?: string };
  try {
    body = (await request.json()) as { id?: string; name?: string; paymentType?: string };
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  if (!body.id || !body.name) {
    return NextResponse.json({ error: 'An account id and name are required.' }, { status: 400 });
  }

  // Validated against the allowed set rather than passed through: the column
  // carries a CHECK constraint, and a 500 from a constraint violation would
  // tell the Owner nothing.
  const paymentType = body.paymentType ?? 'Check';
  if (!PAYMENT_TYPES.includes(paymentType)) {
    return NextResponse.json({ error: 'Unknown payment type.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('companies')
    .update({
      qb_payment_account_id: body.id,
      qb_payment_account_name: body.name,
      qb_payment_type: paymentType,
    })
    .eq('id', gate.companyId!);

  if (error) {
    console.error(`[qb-payment-account] save failed for company=${gate.companyId}:`, error.message);
    return NextResponse.json({ error: 'Could not save the account.' }, { status: 500 });
  }

  // ⚠️ NO EXPLICIT UN-PARK IS NEEDED HERE. M-F's trigger on `companies`
  // (20261390000000) fires on `qb_payment_account_id` — it is in the WHEN
  // clause — and clears `next_attempt_at` on this company's parked rows. The
  // income-item route still clears by hand because that is its documented
  // behaviour; this one relies on the mechanism, which is the point of having
  // built it as a trigger rather than a list of call sites.
  return NextResponse.json({ ok: true });
}
