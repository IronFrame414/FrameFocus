import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  getCachedAccounts,
  glCandidates,
  paymentCandidates,
  refreshAccountCache,
} from '@/lib/services/qb-accounts';
import { defaultPaymentType } from '@/lib/quickbooks/connection';

/**
 * 7G M-J — the chart of accounts behind both pickers.
 *
 * ⚠️ RULED [Josh, S103]: stop typing account names, pull them from QuickBooks
 * and let the user pick. Josh hit the typo failure three times in one session.
 * Picking removes the entire park-on-typo class, and storing the id means a
 * rename in QuickBooks no longer breaks the mapping.
 *
 *   GET            -> the CACHED chart, split into the two candidate lists.
 *                     Costs NOTHING. Never calls QuickBooks.
 *   POST {refresh} -> refetch from QuickBooks. ONE metered read.
 *   POST {gl}      -> store a GL mapping (id + cached label).
 *   POST {payment} -> add an account to the payment list.
 *   POST {remove}  -> soft-delete one from the payment list.
 *
 * ⚠️ THE READ AND THE REFRESH ARE SEPARATE VERBS ON PURPOSE. A settings page
 * that refetched on render would spend `qb_read_budget` on a screen nobody is
 * waiting on; §7G.3a exists to stop exactly that. The refresh is a visible
 * control the Owner presses.
 */

export const dynamic = 'force-dynamic';

async function gate(ownerOnly: boolean) {
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

  const role = profile?.role as string | undefined;
  const allowed = ownerOnly ? role === 'owner' : role === 'owner' || role === 'admin';
  if (!profile || !allowed) {
    console.error(`[qb-accounts] denied: user=${user.id} role=${role ?? 'none'}.`);
    return {
      error: NextResponse.json(
        { error: 'Only an Owner or Admin can change QuickBooks account settings.' },
        { status: 403 }
      ),
    };
  }
  return { companyId: profile.company_id as string, role };
}

export async function GET() {
  const g = await gate(false);
  if (g.error) return g.error;

  const { accounts, fetchedAt } = await getCachedAccounts();
  return NextResponse.json({
    fetchedAt,
    // Two lists from one cache — filtered by what Intuit actually accepts in
    // each position (see connection.ts, both sets measured).
    gl: glCandidates(accounts),
    payment: paymentCandidates(accounts).map((a) => ({
      ...a,
      suggestedPaymentType: defaultPaymentType(a.type),
    })),
  });
}

export async function POST(request: NextRequest) {
  let body: {
    action?: 'refresh' | 'gl' | 'payment' | 'remove' | 'default';
    category?: 'labor' | 'material' | 'subcontractor' | 'other';
    accountId?: string;
    accountName?: string;
    accountType?: string;
    paymentType?: string;
    rowId?: string | null;
    memberId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  // ⚠️ CONNECTING IS OWNER-ONLY, MAPPING IS OWNER+ADMIN. Choosing which account
  // a cost posts to is bookkeeping configuration ("edit company settings",
  // Owner+Admin per the Admin Role Principle). It is not connecting or
  // disconnecting QuickBooks, which is the owner-only action.
  const g = await gate(false);
  if (g.error) return g.error;
  const admin = getSupabaseAdmin();

  if (body.action === 'refresh') {
    const result = await refreshAccountCache(admin, g.companyId!);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ ok: true, count: result.count });
  }

  if (body.action === 'gl') {
    const CATEGORIES = ['labor', 'material', 'subcontractor', 'other'];
    if (!body.category || !CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: 'Unknown cost category.' }, { status: 400 });
    }
    if (!body.accountId || !body.accountName) {
      return NextResponse.json({ error: 'An account is required.' }, { status: 400 });
    }

    // ⚠️ ID AND LABEL WRITTEN TOGETHER. The id is the mapping; the name is the
    // label the screen shows so it need not re-read the cache to render.
    const { error } = await admin
      .from('companies')
      .update({
        [`gl_account_${body.category}_id`]: body.accountId,
        [`gl_account_${body.category}`]: body.accountName,
      })
      .eq('id', g.companyId!);

    if (error) {
      console.error(`[qb-accounts] gl save failed for company=${g.companyId}:`, error.message);
      return NextResponse.json({ error: 'Could not save the mapping.' }, { status: 500 });
    }
    // No manual un-park: M-F's trigger fires on `gl_account_*_id` (M-J widened
    // its WHEN clause), which is why that mechanism exists.
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'payment') {
    if (!body.accountId || !body.accountName || !body.accountType) {
      return NextResponse.json({ error: 'An account is required.' }, { status: 400 });
    }
    const paymentType = body.paymentType ?? defaultPaymentType(body.accountType);

    // Re-adding a previously removed account revives that row rather than
    // colliding with the partial unique index on (company_id, qb_account_id).
    const { data: existing } = await admin
      .from('company_payment_accounts')
      .select('id')
      .eq('company_id', g.companyId!)
      .eq('qb_account_id', body.accountId)
      .maybeSingle();

    const { error } = existing
      ? await admin
          .from('company_payment_accounts')
          .update({
            name: body.accountName,
            account_type: body.accountType,
            payment_type: paymentType,
            is_deleted: false,
            deleted_at: null,
          })
          .eq('id', existing.id as string)
      : await admin.from('company_payment_accounts').insert({
          company_id: g.companyId!,
          qb_account_id: body.accountId,
          name: body.accountName,
          account_type: body.accountType,
          payment_type: paymentType,
        });

    if (error) {
      console.error(`[qb-accounts] payment add failed for company=${g.companyId}:`, error.message);
      return NextResponse.json({ error: 'Could not add the account.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'remove') {
    if (!body.rowId) return NextResponse.json({ error: 'Which account?' }, { status: 400 });

    // ⚠️ SOFT DELETE, AND THE FK IS `ON DELETE SET NULL` FOR A REASON. Expenses
    // already pushed reference this row; a hard delete would either fail or
    // erase which account paid for a transaction that is in the books.
    const { error } = await admin
      .from('company_payment_accounts')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', body.rowId)
      .eq('company_id', g.companyId!);

    if (error) {
      console.error(`[qb-accounts] payment remove failed:`, error.message);
      return NextResponse.json({ error: 'Could not remove the account.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'default') {
    if (!body.memberId) return NextResponse.json({ error: 'Which member?' }, { status: 400 });

    // ⚠️ OWNER/ADMIN ONLY, AND THAT IS THE RULING, NOT A PREFERENCE. Josh: the
    // default is set by Owner/Admin, "never by the user: it determines where
    // money posts." `gate(false)` above is that check; RLS on `company_members`
    // and `enforce_company_members_payment_default` are the other two layers.
    const { error } = await admin
      .from('company_members')
      .update({ default_payment_account_id: body.rowId ?? null })
      .eq('id', body.memberId)
      .eq('company_id', g.companyId!);

    if (error) {
      console.error(`[qb-accounts] default save failed:`, error.message);
      return NextResponse.json({ error: 'Could not save the default.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
