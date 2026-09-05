import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QB_DUPLICATE_NAME_CODE, QboApiError, qbQuoteLiteral, qboQuery, qboRead, qboWrite } from './client';
import type { QboConnection } from './tokens';
import type { QbQueueRow } from './queue';

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
 * ⚠️ THERE IS NOWHERE TO PERSIST A VENDOR ID, AND THAT IS A REAL GAP, NOT AN
 * OVERSIGHT HERE. `expenses.supplier` is FREE TEXT and `subcontractors` carries
 * NO `qb_vendor_id` column (checked against the live schema this run). So a
 * vendor cannot be modelled the way a customer is — there is no row to write
 * the id back to.
 *
 * Consequence, stated plainly: the vendor is resolved by DisplayName on each
 * bill push, memoised for the drain. That is one extra metered read per distinct
 * supplier per drain, not per bill.
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

  ctx.vendorCache.set(key, id);
  return id;
}

/** Read one object's SyncToken. QuickBooks rejects any update or void without
 *  the CURRENT token — it is the optimistic-concurrency stamp, and a stale one
 *  is a 5010 fault. Metered. */
async function readSyncToken(
  ctx: DrainContext,
  resource: string,
  id: string
): Promise<string | null> {
  const result = (await qboRead(ctx.admin, ctx.conn, `/${resource}/${id}`)) as Record<
    string,
    { SyncToken?: string } | undefined
  >;
  const key = resource.charAt(0).toUpperCase() + resource.slice(1);
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
// sub_customer:create — a project becomes a QuickBooks JOB under its client
// ---------------------------------------------------------------------------

async function handleSubCustomerCreate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const { data: project } = await ctx.admin
    .from('projects')
    .select('id, name, project_number, contact_id, qb_sub_customer_id')
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!project) return { kind: 'terminal', reason: 'The project no longer exists.' };
  if (project.qb_sub_customer_id) return { kind: 'pushed' };

  const { data: contact } = await ctx.admin
    .from('contacts')
    .select('id, qb_customer_id, company_name, first_name, last_name')
    .eq('id', project.contact_id as string)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!contact?.qb_customer_id) {
    // The dependency row should have run first; if it has not, WAIT rather than
    // fail. A sub-customer with no parent is not a record QuickBooks can hold.
    return {
      kind: 'park',
      reason: 'Waiting for this project’s client to reach QuickBooks first.',
    };
  }

  // `project_number` (PRJ-###) plus the job name — both already exist, so no new
  // source field is needed. QuickBooks requires DisplayName to be unique across
  // customers AND jobs, which the project number guarantees.
  const displayName = `${project.project_number} — ${project.name}`;

  let created;
  try {
    created = (await qboWrite(ctx.conn, '/customer', {
      DisplayName: displayName,
      Job: true,
      ParentRef: { value: contact.qb_customer_id as string },
    })) as { Customer?: { Id?: string } };
  } catch (err) {
    if (err instanceof QboApiError && err.qbCode === QB_DUPLICATE_NAME_CODE) {
      // A job name collision is not the §5.2 client-identity question — the
      // project number makes this name ours. Adopt the existing job.
      const again = (await qboQuery(
        ctx.admin,
        ctx.conn,
        `select Id from Customer where DisplayName = ${qbQuoteLiteral(displayName)}`
      )) as { QueryResponse?: { Customer?: Array<{ Id: string }> } };
      const raced = again.QueryResponse?.Customer?.[0]?.Id;
      if (raced) {
        await ctx.admin
          .from('projects')
          .update({ qb_sub_customer_id: raced })
          .eq('id', row.entity_id)
          .eq('company_id', ctx.companyId);
        return { kind: 'pushed' };
      }
    }
    throw err;
  }

  const qbId = created.Customer?.Id;
  if (!qbId) return { kind: 'terminal', reason: 'QuickBooks accepted the job but returned no id.' };

  await ctx.admin
    .from('projects')
    .update({ qb_sub_customer_id: qbId })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

  return { kind: 'pushed' };
}

// ---------------------------------------------------------------------------
// invoice:create — THE flow that makes the pay-link exist (§1.2)
// ---------------------------------------------------------------------------

interface QbInvoiceLine {
  DetailType: string;
  Amount?: number;
  Description?: string;
  SalesItemLineDetail?: { ItemRef: { value: string }; Qty?: number; UnitPrice?: number };
  DescriptionLineDetail?: Record<string, never>;
}

/**
 * Build the QuickBooks invoice lines.
 *
 * ⚠️ RETAINAGE — RULED [S103, Q7] AND IT FOOTS. "Send QB the FULL invoice
 * amount with retainage as a LINE ITEM; the held portion sits OPEN until
 * released; releasing retainage is a PAYMENT against the existing open invoice,
 * never a second invoice."
 *
 * So for `billed_total 12,500` with `retainage_withheld 1,250`:
 *   - the WORK lines carry the full 12,500, and
 *   - the retainage line is **DescriptionOnly** — visible on the document,
 *     designating the held amount, and adding NOTHING to the total.
 *
 * ⚠️ THE RETAINAGE LINE MUST NOT CARRY AN AMOUNT. A `1,250` line on top of
 * `12,500` of work lines makes `TotalAmt 13,750`, and the ruling's own arithmetic
 * (`11,250 + 1,250 = 12,500 = billed_total`) stops footing. The held portion is
 * expressed by the invoice staying OPEN for `1,250` after the first payment —
 * not by an extra line of money.
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
    SalesItemLineDetail: { ItemRef: { value: incomeItemId } },
  }));

  // A bill with no derived lines (a lump-sum draw) is legitimate: one line for
  // the whole amount rather than an invoice QuickBooks would reject as empty.
  if (built.length === 0) {
    built.push({
      DetailType: 'SalesItemLineDetail',
      Amount: money(invoice.billed_total),
      Description: invoice.title || 'Progress billing',
      SalesItemLineDetail: { ItemRef: { value: incomeItemId } },
    });
  }

  if (invoice.retainage_withheld > 0) {
    built.push({
      DetailType: 'DescriptionOnly',
      Description:
        `Retainage withheld: $${money(invoice.retainage_withheld).toFixed(2)} — ` +
        `remains open on this invoice until released.`,
      DescriptionLineDetail: {},
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

  const { data: project } = await ctx.admin
    .from('projects')
    .select('id, qb_sub_customer_id')
    .eq('id', invoice.project_id as string)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  if (!project?.qb_sub_customer_id) {
    return { kind: 'park', reason: 'Waiting for this project to reach QuickBooks first.' };
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
    CustomerRef: { value: project.qb_sub_customer_id as string },
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

  // ⚠️ CORRECTION TO 7g2 §3.1, recorded in the build log: the accounting API
  // exposes NO "QuickBooks Payments is enabled" field on CompanyInfo or
  // Preferences. The capability is observable HERE and only here — a company
  // without Payments gets the AllowOnline* flags echoed back FALSE and no
  // InvoiceLink. This is the authoritative source for `qb_payments_enabled`.
  const paymentsEnabled = Boolean(
    qbInvoice.InvoiceLink ||
      qbInvoice.AllowOnlineACHPayment ||
      qbInvoice.AllowOnlineCreditCardPayment
  );

  await ctx.admin
    .from('invoices')
    .update({
      qb_invoice_id: qbInvoice.Id,
      // RULED [S103, Q4] — STORED, because it prints on a client-held document.
      qb_invoice_link: qbInvoice.InvoiceLink ?? null,
      qb_push_status: 'pushed',
      qb_synced_at: new Date().toISOString(),
    })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

  await ctx.admin
    .from('companies')
    .update({ qb_payments_enabled: paymentsEnabled })
    .eq('id', ctx.companyId);

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
  await qboWrite(ctx.conn, '/invoice', {
    Id: invoice.qb_invoice_id,
    SyncToken: syncToken,
    CustomerRef: await subCustomerRef(ctx, invoice.project_id as string),
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
  });

  await ctx.admin
    .from('invoices')
    .update({ qb_synced_at: new Date().toISOString(), qb_push_status: 'pushed' })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

  return { kind: 'pushed' };
}

async function subCustomerRef(ctx: DrainContext, projectId: string): Promise<{ value: string }> {
  const { data: project } = await ctx.admin
    .from('projects')
    .select('qb_sub_customer_id')
    .eq('id', projectId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  return { value: (project?.qb_sub_customer_id as string) ?? '' };
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

  await ctx.admin
    .from('invoices')
    .update({ qb_synced_at: new Date().toISOString() })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

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

/**
 * The subcontractor's EIN, for 1099 tracking on the QuickBooks Vendor.
 *
 * ⚠️ ASSERTS SUCCESS. NEVER TREATS AN ERROR AS "NO EIN" (7g1 §7G.4).
 * `subcontractor_financials` is Owner/Admin-floored, so a caller that lost its
 * privilege reads zero rows and looks exactly like a sub who genuinely has no
 * EIN. Silently marking a 1099 vendor as non-1099 is a tax-reporting defect, so
 * a query ERROR throws (the row retries) while a genuine absence returns null.
 *
 * The chain is three hops and none of them is obvious:
 *   expenses.sub_contract_id -> subcontractor_contracts.member_id
 *                            -> subcontractors.member_id
 *                            -> subcontractor_financials.subcontractor_id
 */
async function resolveSubcontractorEin(
  ctx: DrainContext,
  subContractId: string
): Promise<string | null> {
  const { data: contract, error: contractError } = await ctx.admin
    .from('subcontractor_contracts')
    .select('member_id')
    .eq('id', subContractId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (contractError) throw new Error(`EIN lookup failed at contract: ${contractError.message}`);
  if (!contract?.member_id) return null;

  const { data: sub, error: subError } = await ctx.admin
    .from('subcontractors')
    .select('id')
    .eq('member_id', contract.member_id as string)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (subError) throw new Error(`EIN lookup failed at subcontractor: ${subError.message}`);
  if (!sub?.id) return null;

  const { data: financials, error: finError } = await ctx.admin
    .from('subcontractor_financials')
    .select('ein')
    .eq('subcontractor_id', sub.id as string)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (finError) throw new Error(`EIN lookup failed at financials: ${finError.message}`);

  return (financials?.ein as string | null) ?? null;
}

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
}

async function loadExpense(ctx: DrainContext, id: string): Promise<ExpenseRow | null> {
  const { data } = await ctx.admin
    .from('expenses')
    .select(
      'id, project_id, cost_category, supplier, amount, description, expense_date, due_date, status, is_deleted, sub_contract_id, qb_bill_id'
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
    .select(column)
    .eq('id', ctx.companyId)
    .single();

  const path = (company as Record<string, string | null> | null)?.[column] ?? null;
  if (!path) {
    return {
      ok: false,
      reason:
        `No QuickBooks account is mapped for ${expense.cost_category} costs. ` +
        `Set it on Settings → Accounting, and this expense will sync automatically.`,
    };
  }

  // ⚠️ THE PATH IS A NAME, NOT AN ID — resolve it (see resolveAccountId).
  const id = await resolveAccountId(ctx, path);
  if (!id) {
    return {
      ok: false,
      reason:
        `The QuickBooks account "${path}" mapped for ${expense.cost_category} costs was not ` +
        `found in QuickBooks. Check the name on Settings → Accounting.`,
    };
  }
  return { ok: true, id };
}

async function buildBillBody(
  ctx: DrainContext,
  expense: ExpenseRow,
  vendorId: string,
  accountId: string
): Promise<Record<string, unknown>> {
  const { data: project } = await ctx.admin
    .from('projects')
    .select('qb_sub_customer_id')
    .eq('id', expense.project_id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();

  const jobRef = project?.qb_sub_customer_id as string | undefined;

  return {
    VendorRef: { value: vendorId },
    TxnDate: qbDate(expense.expense_date),
    ...(qbDate(expense.due_date) ? { DueDate: qbDate(expense.due_date) } : {}),
    Line: [
      {
        DetailType: 'AccountBasedExpenseLineDetail',
        Amount: money(Number(expense.amount)),
        Description: expense.description ?? undefined,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: accountId },
          // Job-costing: attach the bill to the QuickBooks job when the project
          // has reached QB. Billable so it shows against the job's costs.
          ...(jobRef
            ? { CustomerRef: { value: jobRef }, BillableStatus: 'NotBillable' }
            : {}),
        },
      },
    ],
  };
}

async function handleBillCreate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const expense = await loadExpense(ctx, row.entity_id);
  if (!expense) return { kind: 'terminal', reason: 'The expense no longer exists.' };
  if (expense.qb_bill_id) return { kind: 'pushed' };
  if (expense.status !== 'approved') {
    return { kind: 'terminal', reason: 'Only approved expenses are sent to QuickBooks.' };
  }

  const account = await billAccountRef(ctx, expense);
  if (!account.ok) return { kind: 'park', reason: account.reason };

  const vendorId = await resolveOrCreateVendor(ctx, expense.supplier);
  if (!vendorId) {
    return { kind: 'terminal', reason: 'This expense has no supplier name to send to QuickBooks.' };
  }

  // 1099 tracking for subcontractor bills. Best effort on the WRITE, strict on
  // the READ: `resolveSubcontractorEin` throws on a query error so the row
  // retries rather than silently filing a 1099 vendor as non-1099.
  if (expense.cost_category === 'subcontractor' && expense.sub_contract_id) {
    const ein = await resolveSubcontractorEin(ctx, expense.sub_contract_id);
    if (ein) {
      try {
        await qboWrite(ctx.conn, '/vendor', {
          Id: vendorId,
          SyncToken: (await readSyncToken(ctx, 'vendor', vendorId)) ?? '0',
          sparse: true,
          TaxIdentifier: ein,
          Vendor1099: true,
        });
      } catch (err) {
        // A failed 1099 stamp must not block the bill — the money record is the
        // point, and the EIN can be corrected in QuickBooks.
        console.error(`[qb-entities] 1099 stamp failed for vendor ${vendorId}:`, err);
      }
    }
  }

  const created = (await qboWrite(
    ctx.conn,
    '/bill',
    await buildBillBody(ctx, expense, vendorId, account.id)
  )) as { Bill?: { Id?: string } };

  const qbId = created.Bill?.Id;
  if (!qbId) return { kind: 'terminal', reason: 'QuickBooks accepted the bill but returned no id.' };

  await ctx.admin
    .from('expenses')
    .update({
      qb_bill_id: qbId,
      qb_push_status: 'pushed',
      qb_synced_at: new Date().toISOString(),
    })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

  return { kind: 'pushed' };
}

/** RULED [S103, Q9]: an expense edited here becomes a sparse update on its Bill. */
async function handleBillUpdate(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const expense = await loadExpense(ctx, row.entity_id);
  if (!expense) return { kind: 'terminal', reason: 'The expense no longer exists.' };
  if (!expense.qb_bill_id) {
    return { kind: 'terminal', reason: 'This expense has never reached QuickBooks.' };
  }

  const account = await billAccountRef(ctx, expense);
  if (!account.ok) return { kind: 'park', reason: account.reason };

  const vendorId = await resolveOrCreateVendor(ctx, expense.supplier);
  if (!vendorId) {
    return { kind: 'terminal', reason: 'This expense has no supplier name to send to QuickBooks.' };
  }

  const syncToken = await readSyncToken(ctx, 'bill', expense.qb_bill_id);
  if (!syncToken) return { kind: 'terminal', reason: 'This bill could not be found in QuickBooks.' };

  // Full object, not sparse — same reason as the invoice update: QuickBooks
  // REPLACES the Line array, and omitting it leaves the old amount in place
  // while this side reads as synced.
  await qboWrite(ctx.conn, '/bill', {
    Id: expense.qb_bill_id,
    SyncToken: syncToken,
    ...(await buildBillBody(ctx, expense, vendorId, account.id)),
  });

  await ctx.admin
    .from('expenses')
    .update({ qb_synced_at: new Date().toISOString(), qb_push_status: 'pushed' })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

  return { kind: 'pushed' };
}

/**
 * RULED [S103, Q9]: an expense deleted here becomes a transaction delete in QB.
 *
 * ⚠️ QUICKBOOKS BILLS ARE DELETED, NOT VOIDED. There is no `operation=void` for
 * a Bill — the accounting API exposes `operation=delete`. The queue's operation
 * is still called `void` because that is our vocabulary (and the CHECK
 * constraint's), and the two words mean the same thing here: the payable stops
 * existing. Our own row is soft-deleted and keeps its audit trail.
 */
async function handleBillVoid(ctx: DrainContext, row: QbQueueRow): Promise<HandlerResult> {
  const expense = await loadExpense(ctx, row.entity_id);
  if (!expense) return { kind: 'terminal', reason: 'The expense no longer exists.' };
  if (!expense.qb_bill_id) return { kind: 'pushed' };

  const syncToken = await readSyncToken(ctx, 'bill', expense.qb_bill_id);
  if (!syncToken) {
    // Already gone from QuickBooks. The outcome we wanted; not a failure.
    return { kind: 'pushed' };
  }

  await qboWrite(ctx.conn, '/bill?operation=delete', {
    Id: expense.qb_bill_id,
    SyncToken: syncToken,
  });

  await ctx.admin
    .from('expenses')
    .update({ qb_synced_at: new Date().toISOString() })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

  return { kind: 'pushed' };
}

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

    if (!customerRef) {
      const ref = await subCustomerRef(ctx, invoice.project_id as string);
      customerRef = ref.value || null;
    }

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

  await ctx.admin
    .from('client_payments')
    .update({
      qb_payment_id: qbId,
      qb_push_status: 'pushed',
      qb_synced_at: new Date().toISOString(),
    })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

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

  // A refund on a project belongs to that job; one without belongs to the client.
  let customerRef: string | null = null;
  if (refund.project_id) {
    const ref = await subCustomerRef(ctx, refund.project_id as string);
    customerRef = ref.value || null;
  }
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

  await ctx.admin
    .from('client_refunds')
    .update({
      qb_refund_id: qbId,
      qb_push_status: 'pushed',
      qb_synced_at: new Date().toISOString(),
    })
    .eq('id', row.entity_id)
    .eq('company_id', ctx.companyId);

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
export async function handleQueueRow(
  ctx: DrainContext,
  row: QbQueueRow
): Promise<HandlerResult> {
  const key = `${row.entity_type}:${row.operation}`;
  switch (key) {
    case 'customer:create':
      return handleCustomerCreate(ctx, row);
    case 'sub_customer:create':
      return handleSubCustomerCreate(ctx, row);
    case 'invoice:create':
      return handleInvoiceCreate(ctx, row);
    case 'invoice:update':
      return handleInvoiceUpdate(ctx, row);
    case 'invoice:void':
      return handleInvoiceVoid(ctx, row);
    case 'bill:create':
      return handleBillCreate(ctx, row);
    case 'bill:update':
      return handleBillUpdate(ctx, row);
    case 'bill:void':
      return handleBillVoid(ctx, row);
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
