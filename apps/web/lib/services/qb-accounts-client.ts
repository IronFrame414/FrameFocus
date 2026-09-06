'use client';

import { createClient } from '@/lib/supabase-browser';

/**
 * 7G M-J — the payment-account list, client side.
 *
 * ⚠️ READ THROUGH RLS AS THE SIGNED-IN USER, deliberately. `company_payment_accounts`
 * is SELECT-able company-wide (M-J), because a crew member entering a receipt
 * has to say which card they spent from. The Financial Visibility Floor governs
 * contract value, budget/sell figures, rates and CO dollars — an account NAME
 * is none of those and carries no amount.
 */

export interface PaymentAccountOption {
  id: string;
  name: string;
  accountType: string;
}

/** The company's curated list. Ordered by name — this renders as a picker a
 *  person reads down, and heap order would reshuffle it on any write. */
export async function listPaymentAccounts(): Promise<PaymentAccountOption[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('company_payment_accounts')
    .select('id, name, account_type')
    .eq('is_deleted', false)
    .order('name', { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    accountType: r.account_type as string,
  }));
}

/**
 * The signed-in member's default account, or null.
 *
 * ⚠️ NULL IS A NORMAL ANSWER AND NEVER BLOCKS ANYTHING [Josh, S103]: "NOT
 * having a default does NOT stop anything. Leaving the account EMPTY does."
 * A member with no default simply gets an empty field and picks one.
 */
export async function myDefaultPaymentAccountId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile) return null;

  // Scoped to THIS member's row, not "a member of my company" — the whole point
  // of the column is that it differs per person (S165 category 2).
  const { data } = await supabase
    .from('company_members')
    .select('default_payment_account_id')
    .eq('profile_id', profile.id as string)
    .eq('is_deleted', false)
    .maybeSingle();

  return (data?.default_payment_account_id as string | null) ?? null;
}
