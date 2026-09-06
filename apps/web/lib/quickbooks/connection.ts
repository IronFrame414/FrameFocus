import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { qboQuery } from './client';
import type { QboConnection } from './tokens';

/**
 * 7G — what we learn about a QuickBooks company right after connecting.
 *
 * ⚠️ EVERY CALL IN HERE IS A METERED CorePlus READ. Keep the count small and
 * deliberate: this runs once per connection, and the quota is shared across
 * every customer in the Workspace.
 */

export interface QbIncomeItem {
  id: string;
  name: string;
}

/**
 * Find the income Item invoices post against.
 *
 * ⚠️ DOES NOT CREATE ANYTHING — RULED [S103, Q10]. "DO NOT auto-create it: that
 * writes to their chart of accounts on a guess." Nor does it guess among the
 * items it finds:
 *
 *   - an EXACT `Construction Income` match is auto-mapped (that is the name the
 *     product documents and the user was told to create);
 *   - anything else is returned as a LIST for the Owner to pick from;
 *   - none at all -> the onboarding copy asks them to create one in QuickBooks,
 *     and the first invoice push WAITS (`queued`) rather than failing.
 *
 * Picking "the only service item" automatically would be the same category of
 * guess as creating one — it would silently post a customer's revenue to an
 * account nobody chose.
 */
export async function listIncomeItems(
  admin: SupabaseClient,
  conn: QboConnection
): Promise<QbIncomeItem[]> {
  try {
    const result = (await qboQuery(
      admin,
      conn,
      "select Id, Name, Type from Item where Active = true maxresults 100"
    )) as { QueryResponse?: { Item?: Array<{ Id: string; Name: string; Type?: string }> } };

    return (result.QueryResponse?.Item ?? [])
      .filter((i) => i.Type === 'Service' || i.Type === 'NonInventory' || !i.Type)
      .map((i) => ({ id: i.Id, name: i.Name }));
  } catch (err) {
    // A failed probe must NOT fail the connection. The tokens are already
    // stored and valid; the Owner can pick an Item on the Accounting screen.
    console.error(`[qb-connection] income-item probe failed for ${conn.companyId}:`, err);
    return [];
  }
}

export interface QbAccount {
  id: string;
  name: string;
  /** `FullyQualifiedName` — "Cost of Goods Sold:Subcontractor Expense". What
   *  the user recognises from QuickBooks' own account list. */
  path: string;
  type: string;
}

/**
 * ⚠️ THE THREE TYPES A PURCHASE MAY BE PAID FROM. MEASURED, NOT GUESSED [S182].
 * Probed by making Intuit refuse every other type in the sandbox: everything
 * outside this set returns *"Invalid account type"*. Mirrored by
 * `company_payment_accounts_account_type_check` — the UI can be bypassed, and
 * the wrong type does not fail here, it fails inside the customer's books.
 */
export const PAYMENT_ACCOUNT_TYPES = ['Bank', 'Credit Card', 'Other Current Liability'] as const;

/**
 * ⚠️ AND THE TWO A COST LINE MAY *NOT* POST TO. Also measured: as the line's
 * `AccountRef`, QuickBooks accepts **12 of 14** account types — only Accounts
 * Payable and Accounts Receivable are refused.
 *
 * So the GL picker is filtered by EXCLUSION, not by an allowlist of
 * "expense-ish" types. A filter we invent would hide a valid account somebody's
 * accountant told them to use; this hides exactly what Intuit rejects.
 */
export const GL_ACCOUNT_EXCLUDED_TYPES = ['Accounts Payable', 'Accounts Receivable'] as const;

/** Default tender for an account type. A Bank used as petty cash is legitimately
 *  'Cash', so this is a starting value the Owner can override, not a rule. */
export function defaultPaymentType(accountType: string): 'Cash' | 'Check' | 'CreditCard' {
  return accountType === 'Credit Card' ? 'CreditCard' : 'Check';
}

/**
 * Fetch the WHOLE chart of accounts from QuickBooks.
 *
 * ⚠️ ONE CALL, ONE METERED READ, WHATEVER THE SIZE. Measured on the sandbox:
 * `maxresults 1000` returned all 93 accounts and `qb_read_budget.coreplus_reads`
 * advanced by exactly one. That is why this is worth caching but not worth
 * paginating.
 *
 * ⚠️ `Active = true` ONLY. An inactive account still resolves by id, so an
 * existing mapping keeps working — but offering a deactivated account in a
 * picker invites someone to choose one QuickBooks will later reject.
 */
export async function fetchChartOfAccounts(
  admin: SupabaseClient,
  conn: QboConnection
): Promise<QbAccount[]> {
  const result = (await qboQuery(
    admin,
    conn,
    'select Id, Name, FullyQualifiedName, AccountType from Account where Active = true maxresults 1000'
  )) as {
    QueryResponse?: {
      Account?: Array<{ Id: string; Name: string; FullyQualifiedName?: string; AccountType?: string }>;
    };
  };

  return (result.QueryResponse?.Account ?? []).map((a) => ({
    id: a.Id,
    name: a.Name,
    path: a.FullyQualifiedName ?? a.Name,
    type: a.AccountType ?? 'Expense',
  }));
}

export const DEFAULT_INCOME_ITEM_NAME = 'Construction Income';

/** Read the QuickBooks company's own name, for the connection card. */
export async function readCompanyName(
  admin: SupabaseClient,
  conn: QboConnection
): Promise<string | null> {
  try {
    const result = (await qboQuery(
      admin,
      conn,
      'select CompanyName from CompanyInfo'
    )) as { QueryResponse?: { CompanyInfo?: Array<{ CompanyName?: string }> } };
    return result.QueryResponse?.CompanyInfo?.[0]?.CompanyName ?? null;
  } catch (err) {
    console.error(`[qb-connection] CompanyInfo probe failed for ${conn.companyId}:`, err);
    return null;
  }
}
