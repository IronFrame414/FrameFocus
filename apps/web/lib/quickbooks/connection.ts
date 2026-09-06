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

export interface QbPaymentAccount {
  id: string;
  name: string;
  type: string;
}

/**
 * The Bank and Credit Card accounts a Purchase can be posted against. [M-G]
 *
 * ⚠️ ONLY THESE TWO TYPES, and it is the API that says so, not a preference:
 * a Purchase with `PaymentType` but no `AccountRef` is refused with
 * *"Invalid account type"*, and the account it wants is the one the money came
 * FROM. Offering an expense account here would produce a refusal the Owner
 * could not interpret.
 *
 * Same failure posture as `listIncomeItems`: a failed probe returns an empty
 * list rather than throwing, so a settings screen degrades to "none found"
 * instead of erroring.
 */
export async function listPaymentAccounts(
  admin: SupabaseClient,
  conn: QboConnection
): Promise<QbPaymentAccount[]> {
  try {
    const result = (await qboQuery(
      admin,
      conn,
      "select Id, Name, AccountType from Account where AccountType in ('Bank','Credit Card') maxresults 100"
    )) as {
      QueryResponse?: { Account?: Array<{ Id: string; Name: string; AccountType?: string }> };
    };

    return (result.QueryResponse?.Account ?? []).map((a) => ({
      id: a.Id,
      name: a.Name,
      type: a.AccountType ?? 'Bank',
    }));
  } catch (err) {
    console.error(`[qb-connection] payment-account probe failed for ${conn.companyId}:`, err);
    return [];
  }
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
