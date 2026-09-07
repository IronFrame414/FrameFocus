import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QB_DUPLICATE_NAME_CODE, QboApiError, qbQuoteLiteral, qboQuery, qboRead, qboWrite } from './client';
import type { QboConnection } from './tokens';
import type { QbQueueRow } from './queue';
import {
  adoptExistingByMarker,
  adoptExistingInvoice,
  recordLink,
  totalMismatch,
  withMarker,
} from './reconcile';

/**
 * 7G — the entity mappers. Platform rows in, QuickBooks objects out.
 *
 * ⚠️ THE DIRECTION OF EVERY FLOW IN THIS FILE IS OUTBOUND. RULED [S103 #5]:
 * "Sync is TWO-WAY, not three." Invoices OUT, expenses OUT as Bills, and
 * payments come BACK by webhook. **There is no import from QuickBooks** — no
 * Bill created in QB is ever pulled here, which is why migration M-C (an
 * `expenses.source` origin marker) was DROPPED rather than built.
 *
 * ⚠️ EVERY READ IN THIS FILE IS `company_id`-SCOPED. The worker runs with the
 * service role and bypasses RLS entirely [ruled S143]: `company_id` arrives as
 * a parameter from the drain, and is never derived from a row we just read.
 * A query without it reads — and writes back to — another tenant's books.
 */

/** What a handler can tell the worker. Throwing a QboApiError is the third
 *  outcome and means "record a failure and decide retry from its class". */
export type HandlerResult =
  | { kind: 'pushed' }
  /** Not a failure: a human has to answer something first. Stays `queued`. */
  | { kind: 'park'; reason: string }
  /** QB will never accept this as it stands. Needs a person; must not retry. */
  | { kind: 'terminal'; reason: string };

export interface DrainContext {
  admin: SupabaseClient;
  conn: QboConnection;
  companyId: string;
  /**
   * Per-drain memoisation. Account and vendor lookups are METERED CorePlus
   * reads and repeat heavily across a batch of expenses — ten bills against one
   * supplier and one GL account is 20 reads without this, 2 with it.
   * Deliberately per-drain and not longer-lived: a cache that outlives the pass
   * would serve a stale id after someone renames an account in QuickBooks.
   */
  accountCache: Map<string, string | null>;
  vendorCache: Map<string, string | null>;
}

export function newDrainContext(
  admin: SupabaseClient,
  conn: QboConnection,
  companyId: string
): DrainContext {
  return { admin, conn, companyId, accountCache: new Map(), vendorCache: new Map() };
}

/**
 * ⚠️ THE CUSTOMER-CONFLICT MARKER. `last_error` is the only channel the shipped
 * schema gives us to carry a question back to the UI, so a conflict is written
 * as a machine-readable prefix followed by a human sentence:
 *
 *     QB_CUSTOMER_CONFLICT|<qbCustomerId>|<displayName>|<sentence for a person>
 *
 * The Accounting screen parses the prefix to render the "link or create" modal;
 * if parsing ever fails it falls back to printing the whole string, which still
 * reads as a sentence. Chosen over a migration because the conflict is
 * transient state on a queue row, not a fact about the tenant.
 */
export const CUSTOMER_CONFLICT_PREFIX = 'QB_CUSTOMER_CONFLICT';

export function customerConflictReason(qbId: string, displayName: string): string {
  return (
    `${CUSTOMER_CONFLICT_PREFIX}|${qbId}|${displayName}|` +
    `A QuickBooks customer named "${displayName}" already exists. ` +
    `Link this client to it, or create a new one under a different name.`
  );
}

export interface CustomerConflict {
  qbCustomerId: string;
  displayName: string;
  sentence: string;
}

export function parseCustomerConflict(lastError: string | null): CustomerConflict | null {
  if (!lastError || !lastError.startsWith(`${CUSTOMER_CONFLICT_PREFIX}|`)) return null;
  const parts = lastError.split('|');
  if (parts.length < 4) return null;
  return { qbCustomerId: parts[1], displayName: parts[2], sentence: parts.slice(3).join('|') };
}

/** QuickBooks money is a JSON number with 2dp. Never send a string. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/** QuickBooks dates are `YYYY-MM-DD`. Our columns are already dates or
 *  timestamps; take the date part and never send a timezone. */
function qbDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Lookups (all metered reads — hence the caches)
// ---------------------------------------------------------------------------

/**
 * ⚠️ `companies.gl_account_*` HOLD FREE-TEXT QUICKBOOKS ACCOUNT PATHS, NOT IDS.
 * Migration `20260728010000` says so in its own words — "Free-text QB account
 * paths; NULL = connector prompts at 7G export time" — and the Settings form
 * (`gl-mapping-settings-form.tsx`) is four text inputs.
 *
 * So the connector MUST resolve the path to an Account Id before it can post a
 * Bill. Passing the string straight to Intuit as an `AccountRef.value` fails
 * with a validation fault that names the value and not the cause, which is the
 * kind of error that costs a day.
 *
 * Matched on `FullyQualifiedName` FIRST (that is what a "path" like
 * `Job Expenses:Materials` is), then on `Name`, so a user who typed only the
 * leaf still resolves. Returns null when nothing matches — the caller parks the
 * row and tells the Owner which mapping is wrong, rather than failing it.
 */
export async function resolveAccountId(
  ctx: DrainContext,
  accountPath: string
): Promise<string | null> {
  const key = accountPath.trim();
  if (ctx.accountCache.has(key)) return ctx.accountCache.get(key)!;

  let resolved: string | null = null;
  try {
    const byPath = (await qboQuery(
      ctx.admin,
      ctx.conn,
      `select Id, Name, FullyQualifiedName from Account where FullyQualifiedName = ${qbQuoteLiteral(key)}`
    )) as { QueryResponse?: { Account?: Array<{ Id: string }> } };
    resolved = byPath.QueryResponse?.Account?.[0]?.Id ?? null;

    if (!resolved) {
      const byName = (await qboQuery(
        ctx.admin,
        ctx.conn,
        `select Id, Name from Account where Name = ${qbQuoteLiteral(key)}`
      )) as { QueryResponse?: { Account?: Array<{ Id: string }> } };
      resolved = byName.QueryResponse?.Account?.[0]?.Id ?? null;
    }
  } catch (err) {
    // A transient lookup failure must propagate so the row retries — swallowing
    // it here would cache `null` and turn an outage into a permanent mapping
    // error the Owner cannot act on.
    ctx.accountCache.delete(key);
    throw err;
  }

  ctx.accountCache.set(key, resolved);
  return resolved;
}

/**
 * Resolve a supplier name to a QuickBooks Vendor, creating one if absent.
 *
 * ⚠️ CLOSED [S104] — `#1-7gqb`. _Superseded, quoted rather than deleted:_
 * _"THERE IS NOWHERE TO PERSIST A VENDOR ID, AND THAT IS A REAL GAP, NOT AN
 * OVERSIGHT HERE. `expenses.supplier` is FREE TEXT and `subcontractors` carries
 * NO `qb_vendor_id` column … the vendor is resolved by DisplayName on each bill
 * push, memoised for the drain. That is one extra metered read per distinct
 * supplier per drain, not per bill."_
 *
 * There is somewhere now: `qb_vendor_map` (`20261520000000`), keyed on
 * (company, realm, normalised supplier string). **Keyed on the STRING and not on
 * `subcontractors.id`, because an expense carries `sub_contract_id` and a
 * free-text `supplier` and no subcontractor FK at all** — the string is what
 * this function actually resolves, for a sub and for a hardware store alike.
 *
 * ⚠️ THE LOOKUP ORDER IS CHEAPEST-FIRST, and that ordering is the fix:
 *   1. `ctx.vendorCache`  — free, this drain only
 *   2. `qb_vendor_map`    — a DB read, FREE against Intuit's quota
 *   3. `select … from Vendor` — **METERED**
 *   4. create
 * Steps 3 and 4 write their result back to step 2, so a supplier costs one
 * metered read ONCE rather than once per drain forever.
 *
 * ⚠️ AND IT CLOSES THE SECOND, WORSE COST: a supplier RENAMED inside QuickBooks
 * used to become a SECOND Vendor on the next push, because the lookup key was
 * the display name — the one thing that had changed. The stored id survives a
 * rename; QuickBooks resolves ids, not names.
 *
 * ⚠️ THE MAP IS A CACHE OF A FACT, NOT A CLAIM ABOUT ONE. If the stored id no
 * longer exists in QuickBooks the push fails loudly with Intuit's own error,
 * which is the right failure. Nothing here fabricates a vendor.
 *
 * ⚠️ AND UNLIKE A CUSTOMER, A NAME COLLISION HERE IS NOT A CONFLICT TO ASK
 * ABOUT. Two clients called "Acme" are plausibly two different clients; a
 * supplier string that already names a QuickBooks Vendor IS that vendor —
 * matching it is the intent. The §5.2 "ASK, never auto-create a duplicate"
 * ruling is about CUSTOMERS, and is honoured there.
 */
export async function resolveOrCreateVendor(
  ctx: DrainContext,
  displayName: string
): Promise<string | null> {
  const key = displayName.trim();
  if (!key) return null;
  if (ctx.vendorCache.has(key)) return ctx.vendorCache.get(key)!;

  // 2. The durable map. Scoped by realm as well as company: a mapping written
  //    under one QuickBooks company must never be read under another, and
  //    scoping makes that structurally impossible rather than dependent on a
  //    disconnect reset list being maintained (see s187-qb-link-census).
  const { data: mapped } = await ctx.admin
    .from('qb_vendor_map')
    .select('qb_vendor_id')
    .eq('company_id', ctx.companyId)
    .eq('realm_id', ctx.conn.realmId)
    .eq('supplier_key', key.toLowerCase())
    .eq('is_deleted', false)
    // Scoped, not merely limited: idx_qb_vendor_map_one_live makes at most one
    // live row match this predicate (CLAUDE.md, S165).
    .limit(1)
    .maybeSingle();

  if (mapped?.qb_vendor_id) {
    const cached = mapped.qb_vendor_id as string;
    ctx.vendorCache.set(key, cached);
    return cached;
  }

  const found = (await qboQuery(
    ctx.admin,
    ctx.conn,
    `select Id, DisplayName from Vendor where DisplayName = ${qbQuoteLiteral(key)}`
  )) as { QueryResponse?: { Vendor?: Array<{ Id: string }> } };

  let id = found.QueryResponse?.Vendor?.[0]?.Id ?? null;

  if (!id) {
    try {
      const created = (await qboWrite(ctx.conn, '/vendor', { DisplayName: key })) as {
        Vendor?: { Id?: string };
      };
      id = created.Vendor?.Id ?? null;
    } catch (err) {
      // A race: another drain created it between our query and our create.
      // Re-read rather than fail — the object we wanted now exists.
      if (err instanceof QboApiError && err.qbCode === QB_DUPLICATE_NAME_CODE) {
        const again = (await qboQuery(
          ctx.admin,
          ctx.conn,
          `select Id from Vendor where DisplayName = ${qbQuoteLiteral(key)}`
        )) as { QueryResponse?: { Vendor?: Array<{ Id: string }> } };
        id = again.QueryResponse?.Vendor?.[0]?.Id ?? null;
      } else {
        throw err;
      }
    }
  }

  // 5. Remember it, so the metered read above is paid once rather than once per
  //    drain. `upsert` on the live-row index: two drains resolving the same
  //    supplier in the same instant is a race we would rather absorb than fail.
  //
  //    ⚠️ THE WRITE IS NOT ALLOWED TO BREAK THE PUSH. This is a cache. If it
  //    fails we have still resolved the vendor correctly and the expense should
  //    still reach QuickBooks; the only cost is that the next drain pays the
  //    metered read again. Logged, never thrown.
  if (id) {
    const { error: mapError } = await ctx.admin.from('qb_vendor_map').upsert(
      {
        company_id: ctx.companyId,
        realm_id: ctx.conn.realmId,
        supplier_name: key,
        qb_vendor_id: id,
      },
      { onConflict: 'company_id,realm_id,supplier_key' }
    );
    if (mapError) {
      console.error(
        `[qb-vendor] could not remember vendor ${id} for "${key}" company=${ctx.companyId}:`,
        mapError.message
      );
    }
  }

  ctx.vendorCache.set(key, id);
  return id;
}

/** Read one object's SyncToken. QuickBooks rejects any update or void without
 *  the CURRENT token — it is the optimistic-concurrency stamp, and a stale one
 *  is a 5010 fault. Metered. */
/**
 * Read the WHOLE object, not just its SyncToken. [F10, S187]
 *
 * ⚠️ THIS IS THE READ HALF OF READ-MODIFY-WRITE, AND IT COSTS NOTHING EXTRA —
 * `readSyncToken()` was already making this exact call and throwing the body
 * away.
 *
 * ⚠️ WHY IT MATTERS. QuickBooks REPLACES an object on a full update. Building
 * the body from only the fields we manage therefore ERASES everything we do not
 * know about — a customer message, payment terms, a billing email, a shipping
 * address, custom fields — all of which the customer may have set in QuickBooks
 * on an invoice we pushed. Merging our changes over the object as it actually
 * exists is the only shape that cannot silently delete someone else's data.
 */
async function readEntity(
  ctx: DrainContext,
  resource: string,
  id: string,
  responseKey?: string
): Promise<Record<string, unknown> | null> {
  const result = (await qboRead(ctx.admin, ctx.conn, `/${resource}/${id}`)) as Record<
    string,
    Record<string, unknown> | undefined
  >;
  const key = responseKey ?? resource.charAt(0).toUpperCase() + resource.slice(1);
  return result[key] ?? null;
}

async function readSyncToken(
  ctx: DrainContext,
  resource: string,
  id: string,
  /**
   * ⚠️ THE RESPONSE KEY IS NOT ALWAYS `Capitalize(resource)`, AND GUESSING IT
   * FAILS SILENTLY [S182]. The URL path is lowercase (`/billpayment/153`) while
   * the JSON key is `BillPayment` — capitalising the first letter yields
   * `Billpayment`, which misses, returns `undefined`, and hands the caller a
   * NULL SyncToken. Every caller reads a null as "already gone from QuickBooks"
   * and returns `pushed`, so the delete never happens and the row reports
   * success. Pass the key explicitly wherever it is not simply capitalised.
   */
  responseKey?: string
): Promise<string | null> {
  const result = (await qboRead(ctx.admin, ctx.conn, `/${resource}/${id}`)) as Record<
    string,
    { SyncToken?: string } | undefined
  >;
  const key = responseKey ?? resource.charAt(0).toUpperCase() + resource.slice(1);
  return result[key]?.SyncToken ?? null;
}

// ---------------------------------------------------------------------------
// customer:create — a platform contact becomes a QuickBooks Customer
// ---------------------------------------------------------------------------

export function contactDisplayName(contact: {
  company_name: string | null;
  first_name: string;
  last_name: string;
}): string {
  return (
    contact.company_name?.trim() ||
    `${contact.first_name} ${contact.last_name}`.trim()
  );
}

async function handleCustomerCreate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const { data: contact } = await ctx.admin
    .from('contacts')
    .select('id, company_name, first_name, last_name, email, phone, qb_customer_id')
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!contact) {
    return { kind: 'terminal', reason: 'The client record no longer exists.' };
  }
  // Idempotent: already linked is success, not work.
  if (contact.qb_customer_id) return { kind: 'pushed' };

  const displayName = contactDisplayName(contact as never);
  if (!displayName) {
    return { kind: 'terminal', reason: 'This client has no name to send to QuickBooks.' };
  }

  // ⚠️ ASK, NEVER AUTO-CREATE A DUPLICATE [S103, §5.2]. Look first.
  const existing = (await qboQuery(
    ctx.admin,
    ctx.conn,
    `select Id, DisplayName from Customer where DisplayName = ${qbQuoteLiteral(displayName)}`
  )) as { QueryResponse?: { Customer?: Array<{ Id: string }> } };

  const collision = existing.QueryResponse?.Customer?.[0]?.Id;
  if (collision) {
    return { kind: 'park', reason: customerConflictReason(collision, displayName) };
  }

  let created;
  try {
    created = (await qboWrite(ctx.conn, '/customer', {
      DisplayName: displayName,
      ...(contact.email ? { PrimaryEmailAddr: { Address: contact.email } } : {}),
      ...(contact.phone ? { PrimaryPhone: { FreeFormNumber: contact.phone } } : {}),
    })) as { Customer?: { Id?: string } };
  } catch (err) {
    // Someone created it between our query and our write. Park for the same
    // decision rather than guessing — it is still a name collision.
    if (err instanceof QboApiError && err.qbCode === QB_DUPLICATE_NAME_CODE) {
      const again = (await qboQuery(
        ctx.admin,
        ctx.conn,
        `select Id from Customer where DisplayName = ${qbQuoteLiteral(displayName)}`
      )) as { QueryResponse?: { Customer?: Array<{ Id: string }> } };
      const raced = again.QueryResponse?.Customer?.[0]?.Id;
      if (raced) return { kind: 'park', reason: customerConflictReason(raced, displayName) };
    }
    throw err;
  }

  const qbId = created.Customer?.Id;
  if (!qbId) return { kind: 'terminal', reason: 'QuickBooks accepted the customer but returned no id.' };

  await ctx.admin
    .from('contacts')
    .update({ qb_customer_id: qbId })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

  return { kind: 'pushed' };
}

// ---------------------------------------------------------------------------
// ⚠️ sub_customer:create WAS HERE AND IS GONE [RULED Josh, S103 — M-M]
// ---------------------------------------------------------------------------
//
// Removed: `handleSubCustomerCreate`, which created a QuickBooks Customer with
// `Job: true` and a `ParentRef`.
//
// ⚠️ THE REASON IS A PRICING TIER. Sub-customers require QuickBooks **Plus or
// Advanced**; Josh runs **Simple Start**. Left as built he would have to upgrade
// to use his own product, and every contractor on Simple Start would be locked
// out of the integration.
//
// **One Customer per client now. The project travels in the MEMO** — see
// `projectRefs()` and the `PrivateNote` on invoices and purchases.
//
// ⚠️ JOSH HAS ACCEPTED WHAT A MEMO CANNOT DO — it does not group, roll up or
// report — and does not want another field investigated. **Classes, Locations,
// Projects and custom fields are all Plus/Advanced too**, so each would
// reintroduce exactly the problem this removed.
//
// ⚠️ `projects.qb_sub_customer_id` IS KEPT AND IS NOW WRITTEN BY NOTHING. The
// sub-customers it names still exist in QuickBooks with invoices referencing
// them; the column is the record of which object an old invoice belongs to.

// ---------------------------------------------------------------------------
// invoice:create — THE flow that makes the pay-link exist (§1.2)
// ---------------------------------------------------------------------------

interface QbInvoiceLine {
  DetailType: string;
  Amount?: number;
  Description?: string;
  SalesItemLineDetail?: {
    ItemRef: { value: string };
    Qty?: number;
    UnitPrice?: number;
    TaxCodeRef?: { value: string };
  };
  DescriptionLineDetail?: Record<string, never>;
  DiscountLineDetail?: { PercentBased: boolean };
}

/**
 * ⚠️ THE INVOICE STATES ITS OWN TAX POSITION [F12, S187]. IT DOES NOT INHERIT ONE.
 *
 * ⚠️ WHICH SIDE IS AUTHORITATIVE, settled: **ours**. The invoice we sent is the
 * document the client received and agreed to pay. And the platform carries no
 * tax on invoices at all — `companies.default_tax_rate` exists but flows into
 * ESTIMATES only (`estimates-client.ts`), and `invoices` / `invoice_lines` have
 * no tax column. So `billed_total` is a tax-free figure, and the QuickBooks
 * invoice must equal it exactly.
 *
 * ⚠️ WHY SAY SO WHEN IT ALREADY WORKS. Measured on the sandbox: QuickBooks was
 * already choosing `NON` by itself and the totals agreed (INV-3675, $3000 both
 * sides, `TxnTaxDetail: {TotalTax: 0}`). But that was QUICKBOOKS' DEFAULT, on a
 * company with `TaxPrefs.UsingSalesTax: true` — a default that varies with the
 * company's tax setup, the customer's exempt status and the item's own setting.
 * **Relying on someone else's default for the total on a money document is the
 * bug, whether or not it has fired yet**: the books would silently disagree with
 * the document the client holds.
 *
 * ⚠️ EXTENDED TO THE EXPENSE PATH AND MADE ENFORCEABLE [S104]. F12 stated the
 * position on SALES lines only; `buildPurchaseBody` and the expense-payment
 * Purchase sent no tax field at all and were inheriting the default this header
 * warns about. Both now send `NON`. **And stating a position is not the same as
 * checking it held** — `totalMismatch()` in `reconcile.ts` now compares what
 * QuickBooks reports back in `TotalAmt` against our own figure on every create
 * and on the invoice update, which is the half that makes the ruling
 * enforceable rather than merely intended.
 *
 * ⚠️ MEASURED AGAINST THE SANDBOX AT S104, read from the API rather than from
 * our record of what we sent: Invoice 145 `TotalAmt 3000`, ours 3000.00,
 * `TxnTaxDetail {TotalTax: 0}`, both lines `NON`. Purchases 151/155/156/175 all
 * agreed to the cent — **and all came back `taxCode=NON` although we sent no
 * tax field**, which is precisely the borrowed default this header calls the
 * bug. `TaxPrefs` on that company: `UsingSalesTax: true`, `TaxGroupCodeRef 2`,
 * `Country US`.
 *
 * ⚠️ `NON` IS US-SPECIFIC, and that is a deliberate, logged limit. Non-US
 * QuickBooks uses different codes and `GlobalTaxCalculation` instead. If a
 * non-US company ever connects, this ref is rejected by Intuit and the push
 * FAILS LOUDLY with the queue's error — which is the right failure: visible,
 * not a silently wrong total. Revisit here when that day comes.
 */
const NON_TAXABLE = { value: 'NON' } as const;

/**
 * Build the QuickBooks invoice lines.
 *
 * ⚠️ RETAINAGE — REVERSED [RULED Josh, S103, superseding Q7]. QuickBooks now
 * receives the **NET RECEIVABLE**, and the invoice **CLOSES FULLY when paid**.
 *
 * _Superseded ruling, quoted rather than deleted:_ _"Send QB the FULL invoice
 * amount with retainage as a LINE ITEM; the held portion sits OPEN until
 * released; releasing retainage is a PAYMENT against the existing open
 * invoice, never a second invoice."_
 *
 * ⚠️ WHY IT BROKE, in Josh's own terms: **a release is per-PROJECT, but several
 * invoices may each have withheld retainage.** One release would then have to
 * clear several open QuickBooks invoices — one payment split across many — and
 * the platform has no concept of that. Leaving each invoice open was writing a
 * reconciliation problem into the customer's books that nothing here could ever
 * close.
 *
 * **NOW:** for `billed_total 12,500` with `retainage_withheld 1,250`, QuickBooks
 * gets a **11,250** invoice. Releasing retainage generates a NEW invoice on
 * this side with **a line per withholding**, which syncs as one ordinary
 * invoice and is paid by one ordinary payment. No split, no partial closes.
 *
 * ⚠️ ACCEPTED TRADE, STATED BY JOSH: **QuickBooks no longer shows full contract
 * billing, only what is collectible.** That is the deliberate cost of the
 * reversal, not a side effect to be engineered away.
 *
 * ⚠️ HOW THE TOTAL IS REDUCED, AND WHY IT IS NOT AN AMOUNT-BEARING LINE.
 * The ruling says retainage is **descriptive, not a line item**. A negative
 * sales line would be a line item, and scaling the work lines would falsify
 * them. QuickBooks' own non-item mechanism is `DiscountLineDetail`. Measured
 * against the sandbox before it was chosen:
 *
 *   sales 8,000 + 4,500, DiscountLineDetail 1,250
 *     -> TotalAmt 11,250, Balance 11,250
 *     -> lines: Sales:8000, Sales:4500, DescriptionOnly, SubTotal:12500, Discount:1250
 *
 * The work lines keep their real amounts, QuickBooks inserts its own subtotal,
 * and the collectible figure is what remains. The DescriptionOnly line stays —
 * it is the "descriptive text, customer-facing" half of the ruling.
 *
 * ⚠️ THE ACCOUNTING CONSEQUENCE, NAMED SO NOBODY DISCOVERS IT IN A REPORT:
 * a discount reduces recognised income now, and the release invoice recognises
 * it later. Over the project the total is the same; the timing moves. That is
 * the same trade as the sentence above, seen from the ledger.
 */
function buildInvoiceLines(
  lines: Array<{ description: string; billed_amount: number }>,
  invoice: { billed_total: number; retainage_withheld: number; title: string | null },
  incomeItemId: string
): QbInvoiceLine[] {
  const built: QbInvoiceLine[] = lines.map((line) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: money(line.billed_amount),
    Description: line.description,
    SalesItemLineDetail: { ItemRef: { value: incomeItemId }, TaxCodeRef: NON_TAXABLE },
  }));

  // A bill with no derived lines (a lump-sum draw) is legitimate: one line for
  // the whole amount rather than an invoice QuickBooks would reject as empty.
  if (built.length === 0) {
    built.push({
      DetailType: 'SalesItemLineDetail',
      Amount: money(invoice.billed_total),
      Description: invoice.title || 'Progress billing',
      SalesItemLineDetail: { ItemRef: { value: incomeItemId }, TaxCodeRef: NON_TAXABLE },
    });
  }

  if (invoice.retainage_withheld > 0) {
    const held = money(invoice.retainage_withheld);

    // The descriptive half of the ruling — customer-facing, carries no money.
    built.push({
      DetailType: 'DescriptionOnly',
      Description:
        `Retainage withheld: $${held.toFixed(2)} — billed separately when released.`,
      DescriptionLineDetail: {},
    });

    // ⚠️ AND THE HALF THAT MAKES THE TOTAL THE NET RECEIVABLE. Must come after
    // the sales lines: QuickBooks builds its own SubTotal from everything above
    // the discount, and a discount placed first would discount nothing.
    built.push({
      DetailType: 'DiscountLineDetail',
      Amount: held,
      DiscountLineDetail: { PercentBased: false },
    });
  }

  return built;
}

async function handleInvoiceCreate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const { data: invoice } = await ctx.admin
    .from('invoices')
    .select(
      'id, project_id, invoice_number, title, issue_date, due_date, billed_total, retainage_withheld, status, qb_invoice_id'
    )
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!invoice) return { kind: 'terminal', reason: 'The invoice no longer exists.' };
  if (invoice.qb_invoice_id) return { kind: 'pushed' };
  if (invoice.status === 'draft' || invoice.status === 'pending_approval') {
    return { kind: 'terminal', reason: 'A draft invoice is not sent to QuickBooks.' };
  }

  const { data: company } = await ctx.admin
    .from('companies')
    .select('qb_income_item_id, qb_income_item_name')
    .eq('id', ctx.companyId)
    .single();

  // ⚠️ RULED [S103, Q10]: no income Item -> WAIT, do not create one. Creating an
  // Item writes to the customer's chart of accounts on a guess.
  if (!company?.qb_income_item_id) {
    return {
      kind: 'park',
      reason:
        'QuickBooks needs a product or service to bill against. Create one in QuickBooks ' +
        '(for example "Construction Income"), then choose it on the Accounting settings tab. ' +
        'This invoice will sync automatically once it is set.',
    };
  }

  // ⚠️ THE CLIENT'S CUSTOMER, NOT A JOB [M-M]. _Superseded: the invoice waited
  // for `projects.qb_sub_customer_id` and parked with "Waiting for this project
  // to reach QuickBooks first."_ Sub-customers are removed (Simple Start), so
  // the only thing an invoice waits for is the CLIENT.
  const { customerRef, note: projectNote } = await projectRefs(
    ctx,
    invoice.project_id as string
  );

  if (!customerRef) {
    return { kind: 'park', reason: 'Waiting for this client to reach QuickBooks first.' };
  }

  const { data: lines } = await ctx.admin
    .from('invoice_lines')
    .select('description, billed_amount, sort_order')
    .eq('invoice_id', invoice.id as string)
    .eq('company_id', ctx.companyId)
    .order('sort_order', { ascending: true });

  const lineRows = (lines ?? []) as Array<{ description: string; billed_amount: number }>;

  // ⚠️ MONEY THAT DOES NOT FOOT IS FLAGGED, NOT ADJUSTED. If the lines disagree
  // with `billed_total`, the defect is upstream in 7D and pushing either figure
  // puts a WRONG money document in the customer's books. Refuse, with both
  // numbers, so a person can look at it.
  if (lineRows.length > 0) {
    const lineSum = lineRows.reduce((sum, l) => sum + Number(l.billed_amount), 0);
    if (Math.abs(lineSum - Number(invoice.billed_total)) > 0.005) {
      return {
        kind: 'terminal',
        reason:
          `Invoice lines total $${money(lineSum).toFixed(2)} but the invoice total is ` +
          `$${money(Number(invoice.billed_total)).toFixed(2)}. Not sent to QuickBooks — ` +
          `the two must agree before this can sync.`,
      };
    }
  }

  const body: Record<string, unknown> = {
    CustomerRef: { value: customerRef },
    // ⚠️ THE PROJECT NOW LIVES HERE AND NOWHERE ELSE ON AN INVOICE [M-M].
    // Before the sub-customer removal the project WAS the CustomerRef, and the
    // invoice carried no memo at all — so without this line the removal would
    // have left QuickBooks holding invoices with no indication of which job they
    // belong to. `DocNumber` still carries our invoice number, but nothing in
    // QuickBooks alone would have named the project.
    //
    // ⚠️ `PrivateNote`, NOT `CustomerMemo` — a reversible default, logged.
    // PrivateNote maps to the **Memo** field on the QuickBooks form, which is
    // what "the memo" means to someone reading it there, and it matches what the
    // Purchase path already does. Switch to `CustomerMemo` (1000 chars, PRINTS
    // ON THE INVOICE the client receives) if Josh wants clients to see it.
    ...(projectNote ? { PrivateNote: projectNote } : {}),
    Line: buildInvoiceLines(
      lineRows,
      {
        billed_total: Number(invoice.billed_total),
        retainage_withheld: Number(invoice.retainage_withheld),
        title: (invoice.title as string | null) ?? null,
      },
      company.qb_income_item_id as string
    ),
    // ⚠️ THIS IS WHAT CREATES THE PAY-LINK — accounting-API fields, no payment
    // scope required (S103 #1). A company WITHOUT QuickBooks Payments gets these
    // echoed back false and no InvoiceLink, which is read below.
    AllowOnlinePayment: true,
    AllowOnlineCreditCardPayment: true,
    AllowOnlineACHPayment: true,
  };
  if (invoice.invoice_number) body.DocNumber = invoice.invoice_number;
  const txnDate = qbDate(invoice.issue_date as string | null);
  if (txnDate) body.TxnDate = txnDate;
  const dueDate = qbDate(invoice.due_date as string | null);
  if (dueDate) body.DueDate = dueDate;

  // ⚠️ A RETRY MUST NOT CREATE A SECOND INVOICE [S104]. QuickBooks has no PUT;
  // a second POST is a second document in the customer's books. If a previous
  // attempt reached Intuit and failed only on the way back — which is exactly
  // what `recordLink` now reports rather than swallowing — the invoice is
  // already there under our own `DocNumber`. Adopt it instead of duplicating
  // it. Costs one METERED read, and only on a retry.
  if (row.attempts > 0) {
    const existingId = await adoptExistingInvoice(
      ctx,
      invoice.invoice_number as string | null
    );
    if (existingId) {
      const adopted = await recordLink(
        ctx,
        'invoices',
        row.entity_id,
        {
          qb_invoice_id: existingId,
          qb_push_status: 'pushed',
          qb_synced_at: new Date().toISOString(),
        },
        `invoice ${existingId} (adopted from an earlier attempt)`
      );
      return adopted ?? { kind: 'pushed' };
    }
  }

  const created = (await qboWrite(ctx.conn, '/invoice', body)) as {
    Invoice?: {
      Id?: string;
      InvoiceLink?: string;
      TotalAmt?: number;
      AllowOnlineACHPayment?: boolean;
      AllowOnlineCreditCardPayment?: boolean;
    };
  };

  const qbInvoice = created.Invoice;
  if (!qbInvoice?.Id) {
    return { kind: 'terminal', reason: 'QuickBooks accepted the invoice but returned no id.' };
  }

  // ⚠️ THE RULING'S ENFORCEMENT POINT [Josh, S104]. Retainage is a
  // DiscountLineDetail, so what QuickBooks should hold is the NET RECEIVABLE —
  // the same figure `buildInvoiceLines` constructed.
  const totalFault = totalMismatch(
    money(Number(invoice.billed_total) - Number(invoice.retainage_withheld)),
    qbInvoice.TotalAmt,
    `invoice ${qbInvoice.Id}`
  );
  if (totalFault) return totalFault;

  // ⚠️ CORRECTION TO 7g2 §3.1, recorded in the build log: the accounting API
  // exposes NO "QuickBooks Payments is enabled" field on CompanyInfo or
  // Preferences. The capability is observable HERE and only here.
  //
  // ⚠️ AMENDED [S182] — THE OLD TEST WAS A FALSE POSITIVE, AND THE HANDSHAKE
  // CAUGHT IT. _Superseded, quoted rather than deleted:_
  //
  //     _const paymentsEnabled = Boolean(_
  //     _  qbInvoice.InvoiceLink ||_
  //     _    qbInvoice.AllowOnlineACHPayment ||_
  //     _    qbInvoice.AllowOnlineCreditCardPayment_
  //     _);_
  //
  // and the claim it rested on — *"a company without Payments gets the
  // AllowOnline* flags echoed back FALSE"* — is simply not true. Measured
  // against the sandbox on invoice 145, live and unpaid: **ACH `true`, card
  // `true`, and NO `InvoiceLink`** — not on a plain read, and not on
  // `?include=invoiceLink` either. The settings panel was therefore telling
  // Josh his invoices carry a "Pay online" link when they carry nothing.
  //
  // ⚠️ THE FLAGS ARE PERMISSION; THE LINK IS CAPABILITY. "You are allowed to be
  // paid online" is a preference on the invoice. "Here is where to pay" only
  // exists once the realm actually has QuickBooks Payments. Only the second one
  // can be shown to a user, so only the second one may set this flag.
  const payLink = qbInvoice.InvoiceLink ?? null;
  const paymentsEnabled = Boolean(payLink);

  const linkFailure = await recordLink(
    ctx,
    'invoices',
    row.entity_id,
    {
      qb_invoice_id: qbInvoice.Id,
      // RULED [S103, Q4] — STORED, because it prints on a client-held document.
      qb_invoice_link: payLink,
      qb_push_status: 'pushed',
      qb_synced_at: new Date().toISOString(),
    },
    `invoice ${qbInvoice.Id}`
  );
  if (linkFailure) return linkFailure;

  // ⚠️ ONLY EVER SET TRUE, NEVER BACK TO FALSE. A create response that carries
  // no link is not proof the realm lacks Payments — it is also what a transient
  // omission looks like. Turning the flag off on that evidence would make the
  // Pay-online surfaces flicker for a company that genuinely has Payments.
  // Disconnect clears it; nothing else does.
  if (paymentsEnabled) {
    await ctx.admin
      .from('companies')
      .update({ qb_payments_enabled: true })
      .eq('id', ctx.companyId);
  }

  return { kind: 'pushed' };
}

// ---------------------------------------------------------------------------
// invoice:update — an amended invoice must not leave QuickBooks stale
// ---------------------------------------------------------------------------

async function handleInvoiceUpdate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const { data: invoice } = await ctx.admin
    .from('invoices')
    .select(
      'id, project_id, invoice_number, title, issue_date, due_date, billed_total, retainage_withheld, qb_invoice_id'
    )
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!invoice) return { kind: 'terminal', reason: 'The invoice no longer exists.' };
  if (!invoice.qb_invoice_id) {
    // Nothing to amend. The create row is the one that matters.
    return { kind: 'terminal', reason: 'This invoice has never reached QuickBooks.' };
  }

  const { data: company } = await ctx.admin
    .from('companies')
    .select('qb_income_item_id')
    .eq('id', ctx.companyId)
    .single();
  if (!company?.qb_income_item_id) {
    return { kind: 'park', reason: 'Waiting for a QuickBooks income item to be chosen.' };
  }

  const syncToken = await readSyncToken(ctx, 'invoice', invoice.qb_invoice_id as string);
  if (!syncToken) {
    return { kind: 'terminal', reason: 'This invoice could not be found in QuickBooks.' };
  }

  const { data: lines } = await ctx.admin
    .from('invoice_lines')
    .select('description, billed_amount, sort_order')
    .eq('invoice_id', invoice.id as string)
    .eq('company_id', ctx.companyId)
    .order('sort_order', { ascending: true });

  // ⚠️ NOT A SPARSE UPDATE. QuickBooks REPLACES the whole `Line` array on an
  // update, and a sparse update that omits `Line` leaves the old lines in place
  // — an amended invoice would then show the OLD amounts in the customer's
  // books while reading as synced here. Send the full object.
  // ⚠️ GUARDED, WHERE THE OLD HELPER WAS NOT [M-M]. `subCustomerRef` returned
  // `{ value: '' }` when unset and this line passed it straight to Intuit.
  const updateCustomerRef = await customerRefForProject(ctx, invoice.project_id as string);
  if (!updateCustomerRef) {
    return { kind: 'park', reason: 'Waiting for this client to reach QuickBooks first.' };
  }
  const { note: updateNote } = await projectRefs(ctx, invoice.project_id as string);

  // ⚠️ MERGE OVER WHAT QUICKBOOKS ACTUALLY HOLDS [F10]. A full update replaces
  // the object, so anything we omit is DELETED — including fields the customer
  // set themselves in QuickBooks (BillEmail, SalesTermRef, CustomerMemo,
  // CustomField, addresses). `existing` is the object as it stands; our managed
  // fields are spread AFTER it so they win, and everything else survives.
  const existingInvoice =
    (await readEntity(ctx, 'invoice', invoice.qb_invoice_id as string)) ?? {};

  const updated = (await qboWrite(ctx.conn, '/invoice', {
    ...existingInvoice,
    Id: invoice.qb_invoice_id,
    SyncToken: syncToken,
    CustomerRef: { value: updateCustomerRef },
    // The project rides in the memo now — see the invoice:create note.
    ...(updateNote ? { PrivateNote: updateNote } : {}),
    Line: buildInvoiceLines(
      (lines ?? []) as Array<{ description: string; billed_amount: number }>,
      {
        billed_total: Number(invoice.billed_total),
        retainage_withheld: Number(invoice.retainage_withheld),
        title: (invoice.title as string | null) ?? null,
      },
      company.qb_income_item_id as string
    ),
    AllowOnlinePayment: true,
    AllowOnlineCreditCardPayment: true,
    AllowOnlineACHPayment: true,
    ...(invoice.invoice_number ? { DocNumber: invoice.invoice_number } : {}),
    ...(qbDate(invoice.issue_date as string | null) ? { TxnDate: qbDate(invoice.issue_date as string | null) } : {}),
    ...(qbDate(invoice.due_date as string | null) ? { DueDate: qbDate(invoice.due_date as string | null) } : {}),
  })) as { Invoice?: { TotalAmt?: number } };

  // ⚠️ AN AMENDMENT IS EXACTLY WHERE THE TOTALS CAN PART COMPANY [S104]. The
  // create path is checked; an update replaces the whole `Line` array, so it
  // recomputes from scratch and has the same failure available to it.
  const totalFault = totalMismatch(
    money(Number(invoice.billed_total) - Number(invoice.retainage_withheld)),
    updated.Invoice?.TotalAmt,
    `invoice ${invoice.qb_invoice_id}`
  );
  if (totalFault) return totalFault;

  const linkFailure = await recordLink(
    ctx,
    'invoices',
    row.entity_id,
    { qb_synced_at: new Date().toISOString(), qb_push_status: 'pushed' },
    `invoice ${invoice.qb_invoice_id}`
  );
  if (linkFailure) return linkFailure;

  return { kind: 'pushed' };
}

/**
 * The QuickBooks **Customer** for a project's client. [M-M, superseding
 * `subCustomerRef`]
 *
 * ⚠️ RETURNS NULL RATHER THAN AN EMPTY STRING, and that is the fix to a real
 * edge the old helper had: it returned `{ value: '' }` when unset, and
 * `handleInvoiceUpdate` passed that straight to Intuit as `CustomerRef`. Null
 * forces every caller to decide what to do about a missing customer.
 */
async function customerRefForProject(
  ctx: DrainContext,
  projectId: string
): Promise<string | null> {
  const { data: project } = await ctx.admin
    .from('projects')
    .select('contact_id')
    .eq('id', projectId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (!project?.contact_id) return null;

  const { data: contact } = await ctx.admin
    .from('contacts')
    .select('qb_customer_id')
    .eq('id', project.contact_id as string)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  return (contact?.qb_customer_id as string | null) ?? null;
}

// ---------------------------------------------------------------------------
// invoice:void — voided here means voided in QuickBooks
// ---------------------------------------------------------------------------

async function handleInvoiceVoid(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const { data: invoice } = await ctx.admin
    .from('invoices')
    .select('id, qb_invoice_id, qb_void_memo, status')
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!invoice) return { kind: 'terminal', reason: 'The invoice no longer exists.' };
  if (!invoice.qb_invoice_id) return { kind: 'pushed' }; // never reached QB; nothing to void.

  const syncToken = await readSyncToken(ctx, 'invoice', invoice.qb_invoice_id as string);
  if (!syncToken) {
    return { kind: 'terminal', reason: 'This invoice could not be found in QuickBooks.' };
  }

  // ⚠️ THE VOID REASON IS NOT SENT TO QUICKBOOKS (7g1 #9). `void_reason` is
  // INTERNAL (7D §9). Only `qb_void_memo` — the "replaced by INV-1044" pairing
  // text — crosses the boundary, and only because it is what makes a voided
  // invoice legible to the bookkeeper.
  await qboWrite(ctx.conn, '/invoice?operation=void', {
    Id: invoice.qb_invoice_id,
    SyncToken: syncToken,
    ...(invoice.qb_void_memo ? { PrivateNote: invoice.qb_void_memo } : {}),
  });

  const linkFailure = await recordLink(
    ctx,
    'invoices',
    row.entity_id,
    { qb_synced_at: new Date().toISOString() },
    `invoice ${invoice.qb_invoice_id} (voided)`
  );
  if (linkFailure) return linkFailure;

  return { kind: 'pushed' };
}

// ---------------------------------------------------------------------------
// bill:create / update / void — expenses go OUT to QuickBooks as Bills
// ---------------------------------------------------------------------------

/** cost_category -> the `companies.gl_account_*` column that maps it. */
const GL_COLUMN_FOR_CATEGORY: Record<string, string> = {
  material: 'gl_account_material',
  subcontractor: 'gl_account_subcontractor',
  other: 'gl_account_other',
};

// ---------------------------------------------------------------------------
// The expense row, and the GL account a cost posts to. NOT part of the Bill
// path — both are shared with the Purchase path and survived its removal.
// ---------------------------------------------------------------------------

interface ExpenseRow {
  id: string;
  project_id: string;
  cost_category: string;
  supplier: string;
  amount: number;
  description: string | null;
  expense_date: string;
  due_date: string | null;
  status: string;
  is_deleted: boolean | null;
  sub_contract_id: string | null;
  qb_bill_id: string | null;
  qb_purchase_id: string | null;
  payment_account_id: string | null;
}

async function loadExpense(ctx: DrainContext, id: string): Promise<ExpenseRow | null> {
  const { data } = await ctx.admin
    .from('expenses')
    .select(
      'id, project_id, cost_category, supplier, amount, description, expense_date, due_date, status, is_deleted, sub_contract_id, qb_bill_id, qb_purchase_id, payment_account_id'
    )
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  return (data as ExpenseRow) ?? null;
}

/** Resolve the GL account for an expense, or say which mapping is missing. */
async function billAccountRef(
  ctx: DrainContext,
  expense: ExpenseRow
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const column = GL_COLUMN_FOR_CATEGORY[expense.cost_category];
  if (!column) {
    return { ok: false, reason: `Unknown cost category "${expense.cost_category}".` };
  }

  const { data: company } = await ctx.admin
    .from('companies')
    .select(`${column}, ${column}_id`)
    .eq('id', ctx.companyId)
    .single();

  const row = (company as Record<string, string | null> | null) ?? null;

  // ⚠️ THE ID WINS, AND THIS IS THE WHOLE POINT OF M-J. An id was PICKED from
  // the chart of accounts, so it cannot be a typo, and it survives a rename in
  // QuickBooks. Josh hit the typo failure three times in one session against
  // the name path — `Cost of goods sold:Subcontractor expenses` versus the real
  // `Cost of Goods Sold:Subcontractor Expense`.
  const mappedId = row?.[`${column}_id`] ?? null;
  if (mappedId) return { ok: true, id: mappedId };

  // ⚠️ THE NAME PATH IS THE LEGACY FALLBACK, kept so a company configured
  // before M-J keeps syncing until someone opens the picker. It is the only
  // remaining route that can park on a typo, and choosing an account removes it.
  const path = row?.[column] ?? null;
  if (!path) {
    return {
      ok: false,
      reason:
        `No QuickBooks account is chosen for ${expense.cost_category} costs. ` +
        `Pick one on Settings → Accounting, and this expense will sync automatically.`,
    };
  }

  const id = await resolveAccountId(ctx, path);
  if (!id) {
    return {
      ok: false,
      reason:
        `The QuickBooks account "${path}" mapped for ${expense.cost_category} costs was not ` +
        `found in QuickBooks. Pick it from the list on Settings → Accounting — the list is ` +
        `read from QuickBooks, so it cannot be mistyped.`,
    };
  }
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// ⚠️ THE BILL PATH WAS HERE AND IS GONE [RULED Josh, S103 — M-L]
// ---------------------------------------------------------------------------
//
// Removed: `resolveSubcontractorEin`, `buildBillBody`, `handleBillCreate`,
// `handleBillUpdate`, `handleBillVoid` — and, further down, the two
// BillPayment handlers.
//
// Josh: *"I only said to keep bills because you said it was built. I do not
// need bill entered to QB. I only need the actual payment."*
//
// ⚠️ A BILL CLOSED BY A BILLPAYMENT IS TWO QUICKBOOKS RECORDS FOR ONE REAL
// EVENT, and each one is a payable that reads as outstanding until its payment
// lands. M-G kept these because they existed; that is not a reason.
//
// ⚠️ THE 1099 GAP M-G RECORDED IS NOW CLOSED BY DELETION RATHER THAN BY CODE.
// `resolveSubcontractorEin` went with this block. It was already unreachable —
// it needs `expenses.sub_contract_id`, and a receipt cannot have one — so
// nothing that worked stopped working. The consequence stands and is Josh's to
// rule on: **the connector does not mark any vendor as 1099.**
//
// ⚠️ WHAT IS LEFT BEHIND, deliberately: `expenses.qb_bill_id` (the record that
// a Bill was once created for that row) and the historical `bill` /
// `bill_payment` queue rows. Both are facts about what happened. Nothing
// produces either any more.

// ---------------------------------------------------------------------------
// payment:create — a payment recorded HERE reaches QuickBooks
// ---------------------------------------------------------------------------

/**
 * ⚠️ THIS IS NOT A FOURTH FLOW, AND IT IS NOT AN IMPORT. READ BEFORE JUDGING.
 *
 * 7g2 §3 names three flows: invoice OUT, payment BACK, expenses OUT. The
 * payment-BACK flow is Model A — the client pays through the QuickBooks
 * pay-link, QuickBooks creates the Payment, and a webhook brings it here.
 *
 * But 7E also has a MANUAL path: a cheque or a bank transfer recorded by the
 * Owner here. Nothing in QuickBooks knows about it. Without this handler the
 * QuickBooks invoice **stays open forever** while this side shows
 * it paid — the two sets of books disagree about money, which is precisely the
 * defect 7G exists to prevent. So a manually recorded payment is pushed OUT.
 *
 * ⚠️ AND IT CANNOT LOOP. A payment that ARRIVED from QuickBooks already carries
 * `qb_payment_id`, and the first check below returns `pushed` without calling
 * Intuit. The webhook handler sets that id in the same write that creates the
 * row, so there is no window where an inbound payment looks outbound.
 */
async function handlePaymentCreate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const { data: payment } = await ctx.admin
    .from('client_payments')
    .select('id, contact_id, amount, payment_date, method, qb_payment_id, is_deleted')
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!payment) return { kind: 'terminal', reason: 'The payment no longer exists.' };
  // Came FROM QuickBooks (or is already pushed). Never re-push.
  if (payment.qb_payment_id) return { kind: 'pushed' };
  if (payment.is_deleted) return { kind: 'terminal', reason: 'This payment was deleted.' };

  const { data: applications } = await ctx.admin
    .from('client_payment_applications')
    .select('invoice_id, amount')
    .eq('payment_id', payment.id as string)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false);

  const applied = (applications ?? []) as Array<{ invoice_id: string; amount: number }>;

  // Resolve each applied invoice to its QuickBooks id and its job.
  const lines: Array<Record<string, unknown>> = [];
  let customerRef: string | null = null;

  for (const application of applied) {
    const { data: invoice } = await ctx.admin
      .from('invoices')
      .select('id, qb_invoice_id, project_id')
      .eq('id', application.invoice_id)
      .eq('company_id', ctx.companyId)
      .maybeSingle();

    if (!invoice?.qb_invoice_id) {
      // ⚠️ WAIT, DO NOT PART-PUSH. A Payment that links only SOME of its
      // invoices would be wrong in QuickBooks and there is no second chance to
      // add the rest — the queue's dependency ordering exists for exactly this.
      return {
        kind: 'park',
        reason: 'Waiting for every invoice this payment covers to reach QuickBooks first.',
      };
    }

    // ⚠️ THE SUB-CUSTOMER BRANCH WAS HERE AND IS GONE [M-M]. It resolved the
    // project's job and fell through to the client below; there is only the
    // client now, so the fallback that follows the loop IS the whole answer.

    lines.push({
      Amount: money(Number(application.amount)),
      LinkedTxn: [{ TxnId: invoice.qb_invoice_id as string, TxnType: 'Invoice' }],
    });
  }

  // An UNAPPLIED payment (money on account, no invoice yet) is legitimate: it
  // becomes an unapplied credit in QuickBooks, exactly as it is here. It needs
  // the client's own Customer rather than a job.
  if (!customerRef) {
    const { data: contact } = await ctx.admin
      .from('contacts')
      .select('qb_customer_id')
      .eq('id', payment.contact_id as string)
      .eq('company_id', ctx.companyId)
      .maybeSingle();
    customerRef = (contact?.qb_customer_id as string) ?? null;
  }

  if (!customerRef) {
    return { kind: 'park', reason: 'Waiting for this client to reach QuickBooks first.' };
  }

  const created = (await qboWrite(ctx.conn, '/payment', {
    CustomerRef: { value: customerRef },
    TotalAmt: money(Number(payment.amount)),
    TxnDate: qbDate(payment.payment_date as string),
    ...(lines.length > 0 ? { Line: lines } : {}),
  })) as { Payment?: { Id?: string } };

  const qbId = created.Payment?.Id;
  if (!qbId) return { kind: 'terminal', reason: 'QuickBooks accepted the payment but returned no id.' };

  const linkFailure = await recordLink(
    ctx,
    'client_payments',
    row.entity_id,
    {
      qb_payment_id: qbId,
      qb_push_status: 'pushed',
      qb_synced_at: new Date().toISOString(),
    },
    `payment ${qbId}`
  );
  if (linkFailure) return linkFailure;

  return { kind: 'pushed' };
}

// ---------------------------------------------------------------------------
// refund:create — CreditMemo or RefundReceipt (7E §5)
// ---------------------------------------------------------------------------

/**
 * ⚠️ RULED [S103 #3]: A DERIVED CREDIT SYNCS WHEN IT IS **APPLIED**, NOT WHEN
 * IT IS RECORDED. A void-with-payment produces a credit that has NO ROW at all
 * (`payments-shared.ts creditAvailableOnPayment` derives it), so there is
 * nothing here to push at that moment and nothing is enqueued.
 *
 * What this handler pushes is the EXPLICIT `client_refunds` row, which exists
 * only once a concrete transaction does. `qb_object_type` decides which:
 *   `credit_memo`    -> QuickBooks CreditMemo   (credit on account)
 *   `refund_receipt` -> QuickBooks RefundReceipt (money actually back)
 */
async function handleRefundCreate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const { data: refund } = await ctx.admin
    .from('client_refunds')
    .select(
      'id, contact_id, project_id, amount, refund_date, status, qb_object_type, qb_refund_id, is_deleted, reason'
    )
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!refund) return { kind: 'terminal', reason: 'The refund no longer exists.' };
  if (refund.qb_refund_id) return { kind: 'pushed' };
  if (refund.is_deleted) return { kind: 'terminal', reason: 'This refund was deleted.' };
  if (refund.status === 'cancelled') {
    return { kind: 'terminal', reason: 'This refund was cancelled.' };
  }
  if (refund.status === 'pending_approval') {
    // Not a failure — it is simply not yet a transaction.
    return { kind: 'park', reason: 'Waiting for this refund to be approved.' };
  }

  if (!refund.qb_object_type) {
    return {
      kind: 'park',
      reason:
        'This refund has no QuickBooks type set (credit memo or refund receipt), so it cannot sync yet.',
    };
  }

  const { data: company } = await ctx.admin
    .from('companies')
    .select('qb_income_item_id')
    .eq('id', ctx.companyId)
    .single();
  if (!company?.qb_income_item_id) {
    return { kind: 'park', reason: 'Waiting for a QuickBooks income item to be chosen.' };
  }

  // ⚠️ EVERY REFUND BELONGS TO THE CLIENT NOW [M-M]. _Superseded: "A refund on a
  // project belongs to that job; one without belongs to the client."_ There are
  // no jobs, so the client branch below is the only one left.
  let customerRef: string | null = null;
  if (!customerRef) {
    const { data: contact } = await ctx.admin
      .from('contacts')
      .select('qb_customer_id')
      .eq('id', refund.contact_id as string)
      .eq('company_id', ctx.companyId)
      .maybeSingle();
    customerRef = (contact?.qb_customer_id as string) ?? null;
  }
  if (!customerRef) {
    return { kind: 'park', reason: 'Waiting for this client to reach QuickBooks first.' };
  }

  const isCreditMemo = refund.qb_object_type === 'credit_memo';
  const resource = isCreditMemo ? '/creditmemo' : '/refundreceipt';
  const responseKey = isCreditMemo ? 'CreditMemo' : 'RefundReceipt';

  const created = (await qboWrite(ctx.conn, resource, {
    CustomerRef: { value: customerRef },
    TxnDate: qbDate(refund.refund_date as string),
    ...(refund.reason ? { PrivateNote: refund.reason as string } : {}),
    Line: [
      {
        DetailType: 'SalesItemLineDetail',
        Amount: money(Number(refund.amount)),
        Description: (refund.reason as string | null) ?? 'Refund',
        SalesItemLineDetail: { ItemRef: { value: company.qb_income_item_id as string } },
      },
    ],
  })) as Record<string, { Id?: string } | undefined>;

  const qbId = created[responseKey]?.Id;
  if (!qbId) {
    return { kind: 'terminal', reason: `QuickBooks accepted the ${responseKey} but returned no id.` };
  }

  const linkFailure = await recordLink(
    ctx,
    'client_refunds',
    row.entity_id,
    {
      qb_refund_id: qbId,
      qb_push_status: 'pushed',
      qb_synced_at: new Date().toISOString(),
    },
    `${responseKey} ${qbId}`
  );
  if (linkFailure) return linkFailure;

  return { kind: 'pushed' };
}

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

/**
 * Route one queue row to its handler.
 *
 * ⚠️ AN UNKNOWN (entity, operation) PAIR IS TERMINAL, NOT IGNORED. A row nobody
 * handles that stays `queued` is invisible work that never completes and never
 * complains — the worst outcome available. It is escalated so a person sees it.
 */
// ---------------------------------------------------------------------------
// purchase:create / update / void — an ACTUAL COST goes OUT as a Purchase
// ---------------------------------------------------------------------------
//
// ⚠️ THIS REPLACES THE BILL PATH FOR EVERYTHING NEW [RULED Josh, S103]. A Bill
// is an obligation; pushing one made Josh go into QuickBooks and mark it paid
// by hand, which is the step the integration exists to remove. A Purchase is
// money already spent — nothing to clear.
//
// ⚠️ TWO FIELDS NAMED `AccountRef`, ONE LEVEL APART, MEANING OPPOSITE THINGS:
//
//   body.AccountRef ............. the account the money came FROM
//                                 (Bank or Credit Card) — `qb_payment_account_id`
//   line.…Detail.AccountRef ..... the expense account it was spent ON
//                                 — the `gl_account_*` mapping
//
// Swapping them posts the spend to the bank account and the payment to the
// expense account. Both are required; both were measured (M-G's header).

interface PurchaseSettings {
  accountId: string;
  paymentType: string;
}

/**
 * Which account paid for THIS expense.
 *
 * ⚠️ READ FROM THE EXPENSE, NOT THE COMPANY [M-J, superseding M-G]. M-G held a
 * single company-wide default in `companies.qb_payment_account_*`; those columns
 * are dropped. Josh: a contractor has business checking, one or more cards,
 * maybe petty cash, and **a Purchase must say which one paid or the books are
 * wrong.** The account is chosen on the expense, pre-filled from the author's
 * default.
 *
 * ⚠️ THIS SHOULD NO LONGER BE REACHABLE AS A PARK, and the park is kept anyway.
 * `enforce_expense_payment_account` (M-J) refuses to approve a syncing expense
 * without an account, so by the time a row reaches the queue it has one. But a
 * row queued BEFORE that trigger shipped, or an account soft-deleted between
 * approval and drain, would arrive here empty — and parking is still better
 * than pushing a Purchase to a guessed account. Belt to the trigger's braces.
 */
/**
 * Resolve ONE payment account row to what a Purchase needs.
 *
 * ⚠️ SHARED BY BOTH PUSH PATHS, so a receipt and a payment cannot disagree
 * about what an account means. The two differ only in WHERE the id comes from —
 * `expenses.payment_account_id` for a receipt, `expense_payments.
 * payment_account_id` for a payment — which is why the id is a parameter here
 * rather than something this function goes looking for.
 */
async function paymentAccountSettings(
  ctx: DrainContext,
  accountId: string | null
): Promise<{ ok: true; value: PurchaseSettings } | { ok: false; reason: string }> {
  if (!accountId) {
    return {
      ok: false,
      reason:
        'This does not say which account paid for it. Open it and choose one, and it will sync.',
    };
  }

  const { data: account } = await ctx.admin
    .from('company_payment_accounts')
    .select('qb_account_id, name, payment_type, is_deleted')
    .eq('id', accountId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!account || account.is_deleted) {
    return {
      ok: false,
      reason:
        'The account this was paid from is no longer on your payment-account list. Choose ' +
        'another, or add it back on Settings → Accounting.',
    };
  }

  return {
    ok: true,
    value: {
      accountId: account.qb_account_id as string,
      paymentType: (account.payment_type as string) ?? 'Check',
    },
  };
}

/**
 * Which account paid for THIS expense — the RECEIPT shape.
 *
 * ⚠️ THIS SHOULD NO LONGER BE REACHABLE AS A PARK, and it is kept anyway.
 * `enforce_expense_payment_account` (M-J) refuses to approve a syncing receipt
 * without an account, so a queued row has one. A row queued before that
 * trigger, or an account soft-deleted between approval and drain, would arrive
 * here empty — and parking beats posting to a guessed account.
 */
async function purchaseSettings(
  ctx: DrainContext,
  expense: ExpenseRow
): Promise<{ ok: true; value: PurchaseSettings } | { ok: false; reason: string }> {
  return paymentAccountSettings(ctx, expense.payment_account_id);
}

/**
 * The project, as QuickBooks will show it. [§2.8, asked for by Josh at S182]
 *
 * ⚠️ THE PROJECT GOES IN TWO PLACES, AND THE SECOND IS THE REAL ONE:
 *
 *   1. `PrivateNote` — prose. Always present, survives a project with no client.
 *   2. `Line[].…Detail.CustomerRef` — the SUB-CUSTOMER, i.e. the job itself.
 *      This is the field that makes QuickBooks' own job-costing reports work,
 *      and it is the same mechanism the invoice path already uses.
 *
 * ⚠️ WHY THE MEMO WAS EMPTY ON BILL 147, and it was not a missing field.
 * `buildBillBody()` has always set the line `CustomerRef` when the project
 * carries `qb_sub_customer_id`. **Only the invoice trigger ever built the
 * customer -> sub-customer chain**, so an expense-only project never had a job
 * to point at — PRJ-102 still has `qb_sub_customer_id` NULL. M-G gives the
 * expense trigger the same chain; this reads the result.
 */
async function projectRefs(
  ctx: DrainContext,
  projectId: string
): Promise<{ customerRef: string | null; note: string | null }> {
  const { data: project } = await ctx.admin
    .from('projects')
    .select('project_number, name')
    .eq('id', projectId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!project) return { customerRef: null, note: null };
  const number = project.project_number as string | null;
  const name = project.name as string | null;
  const note = [number, name].filter(Boolean).join(' — ') || null;

  // ⚠️ THE CLIENT'S CUSTOMER, NOT A JOB [M-M]. This used to be
  // `projects.qb_sub_customer_id`. Attaching the line to the client is the most
  // association Simple Start allows, and it costs nothing; the PROJECT itself
  // now lives only in `note`, which the caller puts in the memo.
  return { customerRef: await customerRefForProject(ctx, projectId), note };
}

async function buildPurchaseBody(
  ctx: DrainContext,
  expense: ExpenseRow,
  settings: PurchaseSettings,
  accountId: string,
  vendorId: string | null
): Promise<Record<string, unknown>> {
  const { customerRef, note } = await projectRefs(ctx, expense.project_id);

  return {
    // The account the money came FROM.
    AccountRef: { value: settings.accountId },
    PaymentType: settings.paymentType,
    TxnDate: qbDate(expense.expense_date),
    // ⚠️ `EntityRef` on a Purchase is the payee and needs its `type`. Omitted
    // entirely when the supplier could not be resolved — an EntityRef with a
    // value and no type is rejected, and a Purchase is legal without one.
    ...(vendorId ? { EntityRef: { value: vendorId, type: 'Vendor' } } : {}),
    // ⚠️ THE MARKER IS THE ONLY DURABLE LINK BACK TO OUR ROW [S104]. A Purchase
    // has no natural key of ours — no DocNumber we set, no number a person
    // would recognise — so without it an orphaned Purchase can never be matched
    // to the expense that created it. `PrivateNote` is internal (it is the
    // QuickBooks Memo field), so this is visible to a bookkeeper and to nobody
    // else. See `reconcile.ts`.
    PrivateNote: withMarker(note, expense.id),
    Line: [
      {
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: money(Number(expense.amount)),
        Description: expense.description ?? undefined,
        AccountBasedExpenseLineDetail: {
          // The account it was spent ON.
          AccountRef: { value: accountId },
          // ⚠️ THE EXPENSE PATH STATES ITS TAX POSITION TOO [S104]. F12 [S187]
          // did this for sales lines and left the Purchase path inheriting
          // QuickBooks' default. Measured at S104: Purchases 151/155/156/175
          // all came back `taxCode=NON` — but WE never sent it, so that was
          // Intuit's default on a company with `UsingSalesTax: true`, exactly
          // the "relying on someone else's default for the total on a money
          // document" that F12's own header calls the bug. Same `NON`, same
          // US-only limitation, same deliberate loud failure off-US.
          TaxCodeRef: NON_TAXABLE,
          ...(customerRef
            ? { CustomerRef: { value: customerRef }, BillableStatus: 'NotBillable' }
            : {}),
        },
      },
    ],
  };
}

async function handlePurchaseCreate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const expense = await loadExpense(ctx, row.entity_id);
  if (!expense) return { kind: 'terminal', reason: 'The expense no longer exists.' };
  // Idempotency: the half-synced-create guard every handler opens with.
  if (expense.qb_purchase_id) return { kind: 'pushed' };
  if (expense.qb_bill_id) {
    return { kind: 'terminal', reason: 'This expense is already in QuickBooks as a bill.' };
  }
  if (expense.status !== 'approved') {
    return { kind: 'terminal', reason: 'Only approved expenses are sent to QuickBooks.' };
  }

  const account = await billAccountRef(ctx, expense);
  if (!account.ok) return { kind: 'park', reason: account.reason };

  const settings = await purchaseSettings(ctx, expense);
  if (!settings.ok) return { kind: 'park', reason: settings.reason };

  // ⚠️ A MISSING SUPPLIER IS NOT FATAL HERE, and that differs from the bill
  // path on purpose. A Bill is owed TO someone, so a vendor is structural. A
  // Purchase is a record of spend and QuickBooks accepts one with no payee.
  const vendorId = await resolveOrCreateVendor(ctx, expense.supplier);

  // ⚠️ A RETRY MUST NOT CREATE A SECOND PURCHASE [S104]. See the same guard on
  // `handleInvoiceCreate`; here the key is the `[FF:<id>]` marker in
  // `PrivateNote` rather than a DocNumber, because a Purchase carries no
  // number of ours. Only on a retry, and only one METERED read.
  if (row.attempts > 0) {
    const existingId = await adoptExistingByMarker(
      ctx,
      'Purchase',
      expense.id,
      qbDate(expense.expense_date)
    );
    if (existingId) {
      const adopted = await recordLink(
        ctx,
        'expenses',
        row.entity_id,
        {
          qb_purchase_id: existingId,
          qb_push_status: 'pushed',
          qb_synced_at: new Date().toISOString(),
        },
        `Purchase ${existingId} (adopted from an earlier attempt)`
      );
      return adopted ?? { kind: 'pushed' };
    }
  }

  const created = (await qboWrite(
    ctx.conn,
    '/purchase',
    await buildPurchaseBody(ctx, expense, settings.value, account.id, vendorId)
  )) as { Purchase?: { Id?: string; TotalAmt?: number } };

  const qbId = created.Purchase?.Id;
  if (!qbId) {
    return { kind: 'terminal', reason: 'QuickBooks accepted the expense but returned no id.' };
  }

  const totalFault = totalMismatch(
    money(Number(expense.amount)),
    created.Purchase?.TotalAmt,
    `Purchase ${qbId}`
  );
  if (totalFault) return totalFault;

  const linkFailure = await recordLink(
    ctx,
    'expenses',
    row.entity_id,
    {
      qb_purchase_id: qbId,
      qb_push_status: 'pushed',
      qb_synced_at: new Date().toISOString(),
    },
    `Purchase ${qbId}`
  );
  if (linkFailure) return linkFailure;

  return { kind: 'pushed' };
}

async function handlePurchaseUpdate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const expense = await loadExpense(ctx, row.entity_id);
  if (!expense) return { kind: 'terminal', reason: 'The expense no longer exists.' };
  if (!expense.qb_purchase_id) {
    return { kind: 'terminal', reason: 'This expense has never reached QuickBooks.' };
  }

  const account = await billAccountRef(ctx, expense);
  if (!account.ok) return { kind: 'park', reason: account.reason };

  const settings = await purchaseSettings(ctx, expense);
  if (!settings.ok) return { kind: 'park', reason: settings.reason };

  const syncToken = await readSyncToken(ctx, 'purchase', expense.qb_purchase_id);
  if (!syncToken) {
    return { kind: 'terminal', reason: 'This expense could not be found in QuickBooks.' };
  }

  const vendorId = await resolveOrCreateVendor(ctx, expense.supplier);

  // Full object, not sparse — QuickBooks REPLACES the Line array, and omitting
  // it leaves the old amount in place while this side reads as synced.
  // ⚠️ MERGE, DO NOT REPLACE [F10] — see the invoice update. A Purchase carries
  // customer-set fields too (PaymentMethodRef, DocNumber, attachments' refs),
  // and a body built only from what we manage would erase them.
  const existingPurchase =
    (await readEntity(ctx, 'purchase', expense.qb_purchase_id as string)) ?? {};

  await qboWrite(ctx.conn, '/purchase', {
    ...existingPurchase,
    Id: expense.qb_purchase_id,
    SyncToken: syncToken,
    ...(await buildPurchaseBody(ctx, expense, settings.value, account.id, vendorId)),
  });

  const linkFailure = await recordLink(
    ctx,
    'expenses',
    row.entity_id,
    { qb_synced_at: new Date().toISOString(), qb_push_status: 'pushed' },
    `Purchase ${expense.qb_purchase_id}`
  );
  if (linkFailure) return linkFailure;

  return { kind: 'pushed' };
}

/** Deleted here, deleted there. Same `operation=delete` shape as a Bill — the
 *  accounting API has no void for either. Our own row keeps its audit trail. */
async function handlePurchaseVoid(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const expense = await loadExpense(ctx, row.entity_id);
  if (!expense) return { kind: 'terminal', reason: 'The expense no longer exists.' };
  if (!expense.qb_purchase_id) return { kind: 'pushed' };

  const syncToken = await readSyncToken(ctx, 'purchase', expense.qb_purchase_id);
  // Already gone from QuickBooks. The outcome we wanted; not a failure.
  if (!syncToken) return { kind: 'pushed' };

  await qboWrite(ctx.conn, '/purchase?operation=delete', {
    Id: expense.qb_purchase_id,
    SyncToken: syncToken,
  });

  const linkFailure = await recordLink(
    ctx,
    'expenses',
    row.entity_id,
    { qb_synced_at: new Date().toISOString() },
    `Purchase ${expense.qb_purchase_id} (deleted)`
  );
  if (linkFailure) return linkFailure;

  return { kind: 'pushed' };
}

// ---------------------------------------------------------------------------
// expense_payment:create — a recorded PAYMENT becomes ONE Purchase
// ---------------------------------------------------------------------------
//
// ⚠️ THIS REPLACES THE BILL/BILLPAYMENT PAIR WITH A SINGLE RECORD [M-L].
//
// ⚠️ AND IT CLOSES THE HOLE M-G LEFT. Under M-G a sub-contract payable reached
// QuickBooks as NOTHING: not a Bill (the create arm was gone) and not a
// Purchase (a payable fails the receipt filter). Subcontractor cost simply
// vanished. One Purchase per payment is where that cost now lands.
//
// ⚠️ THE TWO PUSH PATHS CANNOT OVERLAP, and it is the database that guarantees
// it rather than our care: `record_expense_payment` refuses a receipt outright
// ("this row is a receipt, not a payable"), and the receipt push is gated on
// NOT payable. A receipt pushes one Purchase at approval; a payable pushes one
// per payment; no row does both.
async function handleExpensePaymentCreate(
  ctx: DrainContext,
  row: QbQueueRow
): Promise<HandlerResult> {
  const { data: payment } = await ctx.admin
    .from('expense_payments')
    .select(
      'id, expense_id, amount, retainage_withheld, paid_date, is_deleted, qb_purchase_id, payment_account_id'
    )
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!payment) return { kind: 'terminal', reason: 'The payment no longer exists.' };
  // The half-synced-create guard every handler opens with.
  if (payment.qb_purchase_id) return { kind: 'pushed' };
  if (payment.is_deleted) {
    return { kind: 'terminal', reason: 'This payment was removed before it reached QuickBooks.' };
  }

  const expense = await loadExpense(ctx, payment.expense_id as string);
  if (!expense) return { kind: 'terminal', reason: 'The expense no longer exists.' };

  const account = await billAccountRef(ctx, expense);
  if (!account.ok) return { kind: 'park', reason: account.reason };

  // ⚠️ THE PAYMENT'S OWN ACCOUNT, NOT THE EXPENSE'S. One commitment is paid in
  // stages and the stages can come from different cards.
  const settings = await paymentAccountSettings(ctx, payment.payment_account_id as string | null);
  if (!settings.ok) return { kind: 'park', reason: settings.reason };

  // ⚠️ NET, NOT GROSS. `amount` is the GROSS billed against the stage; what
  // actually left the company is `amount − retainage_withheld` (7C, S91 — see
  // netCashOut() in payables-shared.ts). The held portion has not been spent.
  const net = money(Number(payment.amount) - Number(payment.retainage_withheld ?? 0));
  if (net <= 0) {
    return {
      kind: 'terminal',
      reason: 'This payment withheld its full amount as retainage, so no cash left to record.',
    };
  }

  const vendorId = await resolveOrCreateVendor(ctx, expense.supplier);
  const { customerRef, note } = await projectRefs(ctx, expense.project_id);

  // ⚠️ THIS IS THE HANDLER THE S104 DEFECT WAS FOUND ON, so read the guard as
  // load-bearing rather than defensive. `expense_payments` carries a NOT VALID
  // check constraint that REJECTS any update to a legacy row (7 of 17 on
  // rebuild-test), so the link write below genuinely fails — and until S104 it
  // failed silently while the handler returned `pushed`. A Purchase then
  // existed in QuickBooks with nothing pointing at it. See `reconcile.ts`.
  if (row.attempts > 0) {
    const existingId = await adoptExistingByMarker(
      ctx,
      'Purchase',
      payment.id as string,
      qbDate(payment.paid_date as string)
    );
    if (existingId) {
      const adopted = await recordLink(
        ctx,
        'expense_payments',
        row.entity_id,
        {
          qb_purchase_id: existingId,
          qb_push_status: 'pushed',
          qb_synced_at: new Date().toISOString(),
        },
        `Purchase ${existingId} (adopted from an earlier attempt)`
      );
      return adopted ?? { kind: 'pushed' };
    }
  }

  const created = (await qboWrite(ctx.conn, '/purchase', {
    AccountRef: { value: settings.value.accountId },
    PaymentType: settings.value.paymentType,
    TxnDate: qbDate(payment.paid_date as string),
    ...(vendorId ? { EntityRef: { value: vendorId, type: 'Vendor' } } : {}),
    PrivateNote: withMarker(note, payment.id as string),
    Line: [
      {
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: net,
        Description: expense.description ?? expense.supplier,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: account.id },
          // Same ruling as `buildPurchaseBody` — see the note there [S104].
          TaxCodeRef: NON_TAXABLE,
          ...(customerRef
            ? { CustomerRef: { value: customerRef }, BillableStatus: 'NotBillable' }
            : {}),
        },
      },
    ],
  })) as { Purchase?: { Id?: string; TotalAmt?: number } };

  const qbId = created.Purchase?.Id;
  if (!qbId) {
    return { kind: 'terminal', reason: 'QuickBooks accepted the payment but returned no id.' };
  }

  // `net`, not `amount` — the withheld portion never left the company.
  const totalFault = totalMismatch(net, created.Purchase?.TotalAmt, `Purchase ${qbId}`);
  if (totalFault) return totalFault;

  const linkFailure = await recordLink(
    ctx,
    'expense_payments',
    row.entity_id,
    {
      qb_purchase_id: qbId,
      qb_push_status: 'pushed',
      qb_synced_at: new Date().toISOString(),
    },
    `Purchase ${qbId}`
  );
  if (linkFailure) return linkFailure;

  return { kind: 'pushed' };
}

export async function handleQueueRow(
  ctx: DrainContext,
  row: QbQueueRow
): Promise<HandlerResult> {
  const key = `${row.entity_type}:${row.operation}`;
  switch (key) {
    case 'customer:create':
      return handleCustomerCreate(ctx, row);
    // ⚠️ A NO-OP SUCCESS, AND `pushed` IS THE HONEST ANSWER [M-M]. Sub-customers
    // are removed, so there is nothing to do — but this must NOT be terminal.
    // `claimDue()` releases a dependant only when its dependency reaches
    // `pushed`, and rebuild-test had a live `customer -> sub_customer -> invoice`
    // chain queued when this shipped. Failing this row would strand that invoice
    // forever; `pushed` releases it in the same drain.
    case 'sub_customer:create':
      return { kind: 'pushed' };
    case 'invoice:create':
      return handleInvoiceCreate(ctx, row);
    case 'invoice:update':
      return handleInvoiceUpdate(ctx, row);
    case 'invoice:void':
      return handleInvoiceVoid(ctx, row);
    case 'expense_payment:create':
      return handleExpensePaymentCreate(ctx, row);
    case 'purchase:create':
      return handlePurchaseCreate(ctx, row);
    case 'purchase:update':
      return handlePurchaseUpdate(ctx, row);
    case 'purchase:void':
      return handlePurchaseVoid(ctx, row);
    // ⚠️ EVERY `bill:*` AND `bill_payment:*` ARM IS GONE [M-L]. Nothing
    // enqueues them any more, and the nine historical rows on rebuild-test are
    // all `pushed`. A row of this shape can now only be hand-made, and acting
    // on it would recreate the two-records-for-one-event shape the ruling
    // removes.
    case 'bill:create':
    case 'bill:update':
    case 'bill:void':
    case 'bill_payment:create':
    case 'bill_payment:void':
      return {
        kind: 'terminal',
        reason:
          'Expenses sync to QuickBooks as purchases now, not bills. This queued row is from ' +
          'the earlier design and was not sent.',
      };
    case 'payment:create':
      return handlePaymentCreate(ctx, row);
    case 'refund:create':
      return handleRefundCreate(ctx, row);
    case 'vendor:create':
      // ⚠️ NOT A QUEUEABLE STEP IN 7G, AND DELIBERATELY SO. There is nowhere to
      // persist a QuickBooks Vendor id (`expenses.supplier` is free text and
      // `subcontractors` has no `qb_vendor_id`), so a vendor is resolved inline
      // by `bill:create`. A row of this shape can only come from older code or
      // by hand; say so rather than spin.
      return {
        kind: 'terminal',
        reason: 'Vendors are resolved when the bill is pushed; this row is not needed.',
      };
    case 'time_activity:create':
      return {
        kind: 'terminal',
        reason: 'Time export to QuickBooks is Module 6 payroll, not the 7G connector.',
      };
    default:
      return { kind: 'terminal', reason: `No QuickBooks handler for ${key}.` };
  }
}
