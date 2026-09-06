import 'server-only';

/**
 * 7G — the "clear the links" reset list, and the columns deliberately exempt.
 *
 * ⚠️ THIS LIVES IN `lib/`, NOT IN THE ROUTE, FOR TWO REASONS. Next.js
 * type-checks route modules against a fixed export surface and REJECTS an
 * unrecognised export at build time while `tsc --noEmit` says nothing
 * (`config.ts:98-101` records the same trap). And the census test has to import
 * it — a list nothing can read is a list nothing can guard.
 *
 * ----------------------------------------------------------------------------
 * ⚠️ WHY A MISSING ENTRY HERE CORRUPTS SOMEONE ELSE'S BOOKS
 * ----------------------------------------------------------------------------
 * The user chose "clear the links" and was told the app would forget. If an id
 * survives that promise:
 *
 *   1. they reconnect to a DIFFERENT QuickBooks company;
 *   2. they edit the old record;
 *   3. the enqueue trigger fires on the surviving `qb_*_id`;
 *   4. the row queues under the NEW realm, so the worker's realm guard
 *      (`worker.ts`) does not catch it — it only catches rows queued for a
 *      realm we are no longer connected to;
 *   5. a FULL-OBJECT update lands on whatever object holds that id in the new
 *      company — and QuickBooks ids are small per-realm sequentials, so the
 *      collision is likely rather than exotic.
 *
 * ⚠️ It overwrites EVERY field of an unrelated transaction, because the
 * connector deliberately sends full objects rather than sparse ones (that
 * choice is right — a sparse update silently keeps stale amounts — but it is
 * what makes a wrong id destructive rather than merely wrong).
 *
 * ⚠️ THREE COLUMNS WERE MISSING WHEN THIS WAS EXTRACTED [S187], each added by a
 * migration that never touched the list: `expenses.qb_purchase_id` (M-G),
 * `expense_payments.qb_purchase_id` (M-L), and
 * `time_clock_sessions.qb_time_activity_id` (20260924000000). That is why
 * `s187-qb-link-census.test.ts` exists.
 */

/** Table -> the patch that forgets its QuickBooks links. */
export const QB_LINK_RESETS: Array<[string, Record<string, unknown>]> = [
  ['contacts', { qb_customer_id: null }],
  ['projects', { qb_sub_customer_id: null }],
  [
    'invoices',
    { qb_invoice_id: null, qb_invoice_link: null, qb_push_status: 'not_pushed', qb_synced_at: null },
  ],
  ['client_payments', { qb_payment_id: null, qb_push_status: 'not_pushed', qb_synced_at: null }],
  ['client_refunds', { qb_refund_id: null, qb_push_status: 'not_pushed', qb_synced_at: null }],
  [
    'expenses',
    { qb_bill_id: null, qb_purchase_id: null, qb_push_status: 'not_pushed', qb_synced_at: null },
  ],
  ['expense_payments', { qb_purchase_id: null, qb_push_status: 'not_pushed', qb_synced_at: null }],
  // ⚠️ NOTHING WRITES THIS YET — `time_activity:create` returns terminal
  // ("Module 6 payroll, not the 7G connector"). Reset anyway: it is a link by
  // shape, clearing an always-null column costs nothing, and forgetting it the
  // day Module 6 lands costs the paragraph in the header.
  [
    'time_clock_sessions',
    { qb_time_activity_id: null, qb_push_status: 'not_pushed', qb_synced_at: null },
  ],
];

/**
 * `qb_%_id` columns that are NOT record links and must NOT be cleared here.
 *
 * ⚠️ EVERY ENTRY NEEDS A REASON, and the reason is the point: the census test
 * forces whoever adds a `qb_*_id` column to decide, in writing, which kind it
 * is. "It is not a link" without a stated why is how the next one gets missed.
 */
export const QB_LINK_EXEMPT: Record<string, string> = {
  // Connection state, not a record link. Cleared by the disconnect's own
  // `companies` UPDATE, which must move `qb_connection_state` and
  // `qb_token_secret_id` together to satisfy `companies_qb_token_required_check`.
  'companies.qb_token_secret_id': 'Cleared with the connection state, in one update.',

  // ⚠️ DELIBERATELY KEPT ON DISCONNECT. `companies_qb_realm_required_check` only
  // demands it for non-disconnected states, and keeping it is what lets a
  // reconnect to the SAME realm be recognised as such. It is not a secret.
  'companies.qb_realm_id': 'Kept so a reconnect to the same company is recognised.',

  // A CONFIGURATION MAPPING, not a link to one of our records. It names an Item
  // in the connected company's own chart; on reconnect the Owner re-picks it
  // from the refreshed list.
  'companies.qb_income_item_id': 'Settings mapping, re-picked from the account list.',

  // Same shape: a row in OUR table naming an account in THEIRS. The whole row is
  // the mapping, so clearing the id would leave a nameless orphan rather than
  // forgetting anything.
  'company_payment_accounts.qb_account_id': 'Settings mapping; the row IS the mapping.',
};
