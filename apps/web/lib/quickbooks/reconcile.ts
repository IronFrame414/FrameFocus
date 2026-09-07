import 'server-only';
import type { DrainContext, HandlerResult } from './entities';
import { qbQuoteLiteral, qboQuery } from './client';

/**
 * 7G — recording a push, and finding an object we already created.
 *
 * ⚠️ THESE TWO THINGS SHIP TOGETHER ON PURPOSE, AND SPLITTING THEM WOULD MAKE
 * THE BOOKS WORSE RATHER THAN BETTER [Josh, S104].
 *
 * Before S104 every writer in `entities.ts` ended the same way:
 *
 *     await ctx.admin.from('expense_payments').update({ qb_purchase_id: qbId, … });
 *     return { kind: 'pushed' };
 *
 * with **no `{ error }` check on nine separate calls**. So when the update was
 * rejected — and one is rejected today, see below — the Purchase existed in
 * QuickBooks, the local link was never written, and the handler reported
 * success. `markPushed()` then closed the queue row over it.
 *
 * ⚠️ CHECKING THE ERROR, ON ITS OWN, MAKES THAT WORSE. It converts a silent
 * wrong state into a **retryable** one, and a retry of a create whose
 * QuickBooks object already exists is a DUPLICATE FINANCIAL RECORD — a second
 * Purchase for one payment, in someone's real books. **QuickBooks has no PUT: a
 * second POST creates a second object** (`queue.ts` says the same thing about
 * the one-live-row index). So the error check is only safe alongside an
 * idempotency answer, which is `adoptExisting*()` below.
 *
 * ⚠️ THE REJECTION THAT MOTIVATED THIS IS REAL AND MEASURED, not hypothetical.
 * `expense_payments_retainage_rate_recorded_check` is a **NOT VALID**
 * constraint:
 *
 *     CHECK (retainage_withheld = 0 OR retainage_percent_applied IS NOT NULL) NOT VALID
 *
 * `NOT VALID` exempts rows that already exist — until something UPDATEs one, at
 * which point the whole row is re-checked and the write fails. **7 of 17
 * `expense_payments` rows on rebuild-test violated it** at S104. S187 hit the
 * same constraint on the DISCONNECT path and scoped around it; a sync writer
 * cannot scope around it, because it must update the one row it just pushed.
 */

/** The durable link stamped into a QuickBooks object's `PrivateNote`. */
export function linkMarker(entityId: string): string {
  return `[FF:${entityId}]`;
}

/**
 * Append the marker to whatever memo the object was already going to carry.
 *
 * ⚠️ `PrivateNote` IS INTERNAL — it maps to the QuickBooks **Memo** field on the
 * form and is never printed on a document the client receives (`entities.ts`
 * records the `PrivateNote` vs `CustomerMemo` choice and why). So the marker is
 * visible to a bookkeeper and to nobody else, which is exactly right: it is a
 * reconciliation key, not customer-facing text.
 */
export function withMarker(note: string | null | undefined, entityId: string): string {
  const marker = linkMarker(entityId);
  return note ? `${note} ${marker}` : marker;
}

/** True when a QuickBooks object's memo carries OUR marker for this row. */
export function memoMatches(privateNote: unknown, entityId: string): boolean {
  return typeof privateNote === 'string' && privateNote.includes(linkMarker(entityId));
}

/**
 * Write the QuickBooks link back onto our row, and say so when it fails.
 *
 * ⚠️ `reason` NAMES THE QUICKBOOKS OBJECT, and that is the whole point of the
 * string. The object EXISTS in the customer's books; the only thing that failed
 * is our record of it. A message that says merely "could not save" leaves a
 * bookkeeper with an unexplained transaction and no id to search for.
 */
export async function recordLink(
  ctx: DrainContext,
  table: string,
  entityId: string,
  patch: Record<string, unknown>,
  qbDescription: string
): Promise<HandlerResult | null> {
  const { error } = await ctx.admin
    .from(table)
    .update(patch)
    .eq('id', entityId)
    .eq('company_id', ctx.companyId);

  if (!error) return null;

  console.error(
    `[qb-link] ${table}/${entityId} could not record ${qbDescription} for company=${ctx.companyId}:`,
    error.message
  );

  return {
    kind: 'terminal',
    reason:
      `QuickBooks ${qbDescription} was created, but this record could not be linked to it: ` +
      `${error.message}. The QuickBooks entry EXISTS — do not push this again until the link is ` +
      `repaired, or the books will hold two of it.`,
  };
}

// ---------------------------------------------------------------------------
// Adoption — "did a previous attempt already create this?"
// ---------------------------------------------------------------------------
//
// ⚠️ ONLY CALLED WHEN A PREVIOUS ATTEMPT IS ON RECORD (`row.attempts > 0`), so
// a first push pays nothing. `qboQuery` is METERED against `qb_read_budget`;
// spending a read on every create to guard against a failure that has not
// happened would be the wrong trade. On a RETRY the read is cheap insurance
// against duplicating a money record, which is not.

/**
 * An invoice's natural key in QuickBooks is the `DocNumber` we set from
 * `invoices.invoice_number`, and `DocNumber` is directly queryable. No marker
 * needed and none used — the number IS the key, and it is the same key a human
 * would search for.
 */
export async function adoptExistingInvoice(
  ctx: DrainContext,
  invoiceNumber: string | null
): Promise<string | null> {
  if (!invoiceNumber) return null;
  const found = (await qboQuery(
    ctx.admin,
    ctx.conn,
    `select Id, DocNumber from Invoice where DocNumber = ${qbQuoteLiteral(invoiceNumber)}`
  )) as { QueryResponse?: { Invoice?: Array<{ Id: string }> } };
  return found.QueryResponse?.Invoice?.[0]?.Id ?? null;
}

/**
 * Purchases, Payments and credits have no natural key, so they carry the marker.
 *
 * ⚠️ THE QUERY FILTERS ON `TxnDate`, NOT ON THE MEMO, AND THAT IS A LIMIT OF
 * INTUIT'S QUERY LANGUAGE RATHER THAN A CHOICE. `PrivateNote` is not a
 * filterable field on these entities, so the marker cannot appear in the WHERE
 * clause. One transaction date is a small enough page to scan in memory, and
 * `TxnDate` is a value we set ourselves, so we always know it exactly.
 *
 * ⚠️ A NULL RESULT MEANS "NOT FOUND BY THIS MARKER", NEVER "does not exist".
 * An object created BEFORE the marker shipped carries no marker and will not be
 * found here. That is why it returns null rather than asserting absence, and
 * why nothing downstream may treat null as permission to create a second one
 * without other evidence.
 */
export async function adoptExistingByMarker(
  ctx: DrainContext,
  qbEntity: 'Purchase' | 'Payment' | 'CreditMemo' | 'RefundReceipt',
  entityId: string,
  txnDate: string | undefined
): Promise<string | null> {
  if (!txnDate) return null;
  const found = (await qboQuery(
    ctx.admin,
    ctx.conn,
    `select * from ${qbEntity} where TxnDate = ${qbQuoteLiteral(txnDate)}`
  )) as { QueryResponse?: Record<string, Array<{ Id: string; PrivateNote?: string }> | undefined> };

  const rows = found.QueryResponse?.[qbEntity] ?? [];
  for (const candidate of rows) {
    if (memoMatches(candidate.PrivateNote, entityId)) return candidate.Id;
  }
  return null;
}
