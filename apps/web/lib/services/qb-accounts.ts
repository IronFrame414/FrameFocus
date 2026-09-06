import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import {
  fetchChartOfAccounts,
  GL_ACCOUNT_EXCLUDED_TYPES,
  PAYMENT_ACCOUNT_TYPES,
  type QbAccount,
} from '@/lib/quickbooks/connection';
import { getAccessToken } from '@/lib/quickbooks/tokens';

/**
 * 7G M-J — the chart of accounts, cached, and the payment-account list.
 *
 * ⚠️ WHY A CACHE AT ALL. One `Account` query costs one metered CorePlus read
 * (measured). That is cheap but not free, and a settings page that refetched on
 * every render would spend the budget §7G.3a exists to protect on a screen
 * nobody is waiting on.
 *
 * ⚠️ WHAT INVALIDATES IT — stated because a cache without this is a bug waiting:
 *
 *   * the Owner presses **Refresh** (the visible control, and the only
 *     guaranteed way)
 *   * a **disconnect** — `/disconnect` deletes the row, because a different
 *     realm has entirely different account ids and serving them would be worse
 *     than serving nothing
 *
 * It is deliberately NOT invalidated by time. A stale *label* is cosmetic —
 * the stored ID is what posts — so a TTL would spend reads to fix nothing. The
 * one thing a stale cache can do is offer an account somebody deleted in
 * QuickBooks, which fails loudly at push time with Intuit's own message.
 */

export interface PaymentAccount {
  id: string;
  qbAccountId: string;
  name: string;
  accountType: string;
  paymentType: string;
}

/** The cached chart, or an empty list when nothing has been fetched yet. */
export async function getCachedAccounts(): Promise<{
  accounts: QbAccount[];
  fetchedAt: string | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { accounts: [], fetchedAt: null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return { accounts: [], fetchedAt: null };

  const { data } = await supabase
    .from('qb_account_cache')
    .select('accounts, fetched_at')
    .eq('company_id', profile.company_id)
    .eq('is_deleted', false)
    .maybeSingle();

  return {
    accounts: (data?.accounts as unknown as QbAccount[]) ?? [],
    fetchedAt: (data?.fetched_at as string | null) ?? null,
  };
}

/**
 * Refetch from QuickBooks and replace the cache. Costs one metered read.
 *
 * ⚠️ REPLACED WHOLESALE, NEVER MERGED. This mirrors someone else's table; an
 * account deleted in QuickBooks must disappear here, and a merge would keep it
 * in the picker forever.
 */
export async function refreshAccountCache(
  admin: SupabaseClient,
  companyId: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const conn = await getAccessToken(admin, companyId);
  if (!conn) return { ok: false, error: 'QuickBooks is not connected, or needs reconnecting.' };

  let accounts: QbAccount[];
  try {
    accounts = await fetchChartOfAccounts(admin, conn);
  } catch (err) {
    console.error(`[qb-accounts] chart fetch failed for company=${companyId}:`, err);
    return { ok: false, error: 'Could not read your chart of accounts from QuickBooks.' };
  }

  const { error } = await admin.from('qb_account_cache').upsert(
    {
      company_id: companyId,
      accounts: accounts as unknown as never,
      fetched_at: new Date().toISOString(),
      is_deleted: false,
    },
    { onConflict: 'company_id' }
  );

  if (error) {
    console.error(`[qb-accounts] cache write failed for company=${companyId}:`, error.message);
    return { ok: false, error: 'Could not save the account list.' };
  }

  // ⚠️ REFRESH THE STORED LABELS IN THE SAME PASS. The ids are the mapping and
  // never change here; the names are cached display and go stale the moment
  // somebody renames an account in QuickBooks. This is the only place that
  // notices, so it is the only place that can fix it.
  await syncStoredLabels(admin, companyId, accounts);

  return { ok: true, count: accounts.length };
}

async function syncStoredLabels(
  admin: SupabaseClient,
  companyId: string,
  accounts: QbAccount[]
): Promise<void> {
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const { data: company } = await admin
    .from('companies')
    .select(
      'gl_account_labor_id, gl_account_material_id, gl_account_subcontractor_id, gl_account_other_id'
    )
    .eq('id', companyId)
    .single();
  if (!company) return;

  const patch: Record<string, string> = {};
  for (const key of ['labor', 'material', 'subcontractor', 'other'] as const) {
    const id = (company as Record<string, string | null>)[`gl_account_${key}_id`];
    const found = id ? byId.get(id) : undefined;
    if (found) patch[`gl_account_${key}`] = found.path;
  }
  if (Object.keys(patch).length > 0) {
    await admin.from('companies').update(patch).eq('id', companyId);
  }

  // The payment list's own labels, same reasoning.
  const { data: rows } = await admin
    .from('company_payment_accounts')
    .select('id, qb_account_id, name')
    .eq('company_id', companyId)
    .eq('is_deleted', false);

  for (const row of rows ?? []) {
    const found = byId.get(row.qb_account_id as string);
    if (found && found.name !== row.name) {
      await admin
        .from('company_payment_accounts')
        .update({ name: found.name })
        .eq('id', row.id as string);
    }
  }
}

/** Accounts offerable as a PAYER of a Purchase — the three measured types. */
export function paymentCandidates(accounts: QbAccount[]): QbAccount[] {
  return accounts
    .filter((a) => (PAYMENT_ACCOUNT_TYPES as readonly string[]).includes(a.type))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

/**
 * Accounts offerable as a COST account (the GL mapping).
 *
 * ⚠️ EXCLUSION, NOT AN ALLOWLIST — see `GL_ACCOUNT_EXCLUDED_TYPES`. Sorted so
 * the types a contractor actually posts costs to come first, because the
 * measured answer is that QuickBooks allows almost anything and an unsorted
 * list of 90+ accounts is not a picker, it is a haystack.
 */
const GL_TYPE_ORDER = ['Cost of Goods Sold', 'Expense', 'Other Expense', 'Fixed Asset'];

export function glCandidates(accounts: QbAccount[]): QbAccount[] {
  return accounts
    .filter((a) => !(GL_ACCOUNT_EXCLUDED_TYPES as readonly string[]).includes(a.type))
    .sort((a, b) => {
      const ai = GL_TYPE_ORDER.indexOf(a.type);
      const bi = GL_TYPE_ORDER.indexOf(b.type);
      const ar = ai === -1 ? GL_TYPE_ORDER.length : ai;
      const br = bi === -1 ? GL_TYPE_ORDER.length : bi;
      return ar - br || a.type.localeCompare(b.type) || a.path.localeCompare(b.path);
    });
}

/** The company's curated payment-account list. Readable by every role — see the
 *  policy note in M-J: an account name carries no figure the Floor governs. */
export async function getPaymentAccounts(): Promise<PaymentAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('company_payment_accounts')
    .select('id, qb_account_id, name, account_type, payment_type')
    .eq('is_deleted', false)
    .order('name', { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    qbAccountId: r.qb_account_id as string,
    name: r.name as string,
    accountType: r.account_type as string,
    paymentType: r.payment_type as string,
  }));
}

export interface MemberDefault {
  memberId: string;
  displayName: string;
  defaultPaymentAccountId: string | null;
}

/**
 * Every member and the account they spend from by default.
 *
 * ⚠️ ORDERED BY NAME, not by insertion. This renders as a list a person reads
 * down looking for one colleague; heap order would reshuffle it whenever
 * anybody's row was touched (S165 category 1).
 */
export async function getMemberDefaults(): Promise<MemberDefault[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('company_members')
    .select('id, display_name, default_payment_account_id, member_type')
    .eq('is_deleted', false)
    // ⚠️ EXCLUDE SUBCONTRACTORS, do not include "employees" — there is no such
    // `member_type`. Measured on rebuild-test: the values in use are `crew`
    // (5 rows) and `subcontractor` (545). An allowlist on a guessed value would
    // have returned an EMPTY list and looked like "nobody has a default yet".
    // Subs do not spend on a company card, and 545 of them would bury the 5.
    .neq('member_type', 'subcontractor')
    .order('display_name', { ascending: true });

  return (data ?? []).map((m) => ({
    memberId: m.id as string,
    displayName: (m.display_name as string) ?? 'Unnamed',
    defaultPaymentAccountId: (m.default_payment_account_id as string | null) ?? null,
  }));
}
