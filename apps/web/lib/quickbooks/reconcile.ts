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

/**
 * Has a previous attempt at this record already reached Intuit? [R2, S104c]
 *
 * ⚠️ TWO SIGNALS, BECAUSE EITHER ONE ALONE HAS A HOLE, AND THEY FAIL IN
 * OPPOSITE DIRECTIONS.
 *
 * `attempts` lives on the QUEUE ROW. It is the right signal when the same row is
 * retried, and it survives the case where our own table is unwritable — which is
 * exactly the failure that created the first orphan.
 *
 * ⚠️ BUT A TERMINAL FAILURE RETIRES THAT ROW. `idx_qb_sync_queue_one_live_per_
 * entity_op` only covers `queued`/`in_flight`/`failed_transient`, so once a row
 * is `failed_terminal` a **new** row for the same (entity, operation) can be
 * enqueued — with `attempts = 0`. Gating on attempts alone, that row would not
 * probe, and QuickBooks has no PUT: the create would make a SECOND object.
 *
 * Reachable today by a deliberate status round-trip, which is precisely what
 * someone does when a sync has visibly failed:
 *   * `qb_enqueue_expense` re-enqueues `purchase:create` on
 *     `approved -> not approved -> approved`;
 *   * `qb_enqueue_invoice` on `sent -> draft -> sent`.
 *
 * `qb_push_status` lives on the RECORD, is written by `markRecordFailed()` on
 * every terminal outcome, and survives the queue row being replaced. Between
 * them the two cover both shapes.
 */
export function priorAttemptReachedIntuit(
  row: { attempts: number },
  record: { qb_push_status?: string | null } | null | undefined
): boolean {
  return row.attempts > 0 || record?.qb_push_status === 'failed';
}

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
 *
 * ⚠️ INTERNAL IS NOT THE SAME AS OURS [R1, ruled Josh, S104c]. **A bookkeeper
 * types in that field**, and the first version of this shipped as an
 * unconditional `PrivateNote: withMarker(note, id)` on a body shared by create
 * AND update — so an expense with no project note REPLACED whatever they had
 * written with the bare marker. Measured on the sandbox: **22 of 39 Purchases
 * carry no project note**, so that was the common case, not the edge.
 *
 * ⚠️ That is the inverse of the bug F10's read-modify-write exists to prevent —
 * *"anything we omit is DELETED, including fields the customer set themselves"* —
 * committed while fixing a different one. The update path now feeds the existing
 * memo back in, and this function appends rather than replaces.
 *
 * ⚠️ THE MARKER STRING ITSELF IS FROZEN. `linkMarker()` has always returned
 * `[FF:<row id>]` and must keep returning exactly that: anything already written
 * to a customer's books is adoptable only for as long as `memoMatches()` still
 * recognises it. Change the composition freely; never change the token.
 */
export function withMarker(note: string | null | undefined, entityId: string): string {
  const marker = linkMarker(entityId);
  if (!note) return marker;
  // ⚠️ IDEMPOTENT [R1, S104c]. `buildPurchaseBody` is shared by create AND
  // update, and the update path now feeds it the memo QuickBooks already holds.
  // Without this test the marker would be appended again on every amendment and
  // the memo would grow a tail of identical tags.
  //
  // ⚠️ IT TESTS FOR *THIS ROW'S* MARKER, NOT FOR MARKER-SHAPED TEXT. A memo
  // carrying some other row's `[FF:…]` — or a bookkeeper's own square brackets —
  // must still receive ours.
  return note.includes(marker) ? note : `${note} ${marker}`;
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
 * clause; the date narrows the page and the marker is matched in memory.
 *
 * ⚠️ A RANGE, NOT THE EXACT DAY [R3, ruled Josh, S104c]. The first version
 * matched `TxnDate = <the record's date today>`, which quietly made the DATE
 * part of the key — and `expenses.expense_date` is **mutable**
 * (`enforce_expenses_column_scope` does not freeze it, and Owner/Admin bypass
 * that trigger outright). Edit the date between the failed push and the retry
 * and the probe looks at the wrong day, finds nothing, and creates a SECOND
 * Purchase. The window is human-length, because a terminal failure does not
 * auto-retry.
 *
 * `paid_date` and an invoice's `DocNumber` are frozen by their own triggers, so
 * only the expense path had the hole — but the range costs the same single
 * metered read for all of them.
 *
 * ⚠️ `maxresults` IS THE LIMIT OF THIS APPROACH, and it is stated rather than
 * hidden: Intuit caps a page at 1000. A realm with more than 1000 Purchases
 * inside the window would truncate, and a truncated page can miss the marker and
 * duplicate. 39 exist on the sandbox today. If that ever stops being comfortable
 * the answer is a queryable key of our own, not a wider net.
 *
 * ⚠️ A NULL RESULT MEANS "NOT FOUND BY THIS MARKER", NEVER "does not exist".
 * An object created BEFORE the marker shipped carries no marker and will not be
 * found here. That is why it returns null rather than asserting absence, and
 * why nothing downstream may treat null as permission to create a second one
 * without other evidence.
 */
/** Days either side of the record's current date that the probe will scan. */
export const ADOPTION_WINDOW_DAYS = 90;

/** The inclusive `TxnDate` range to scan around a record's current date. */
export function adoptionWindow(txnDate: string): { from: string; to: string } {
  const centre = new Date(`${txnDate}T00:00:00Z`).getTime();
  const day = 24 * 60 * 60 * 1000;
  return {
    from: new Date(centre - ADOPTION_WINDOW_DAYS * day).toISOString().slice(0, 10),
    to: new Date(centre + ADOPTION_WINDOW_DAYS * day).toISOString().slice(0, 10),
  };
}

export async function adoptExistingByMarker(
  ctx: DrainContext,
  qbEntity: 'Purchase' | 'Payment' | 'CreditMemo' | 'RefundReceipt',
  entityId: string,
  txnDate: string | undefined
): Promise<string | null> {
  if (!txnDate) return null;
  const { from, to } = adoptionWindow(txnDate);
  const found = (await qboQuery(
    ctx.admin,
    ctx.conn,
    `select * from ${qbEntity} where TxnDate >= ${qbQuoteLiteral(from)} ` +
      `and TxnDate <= ${qbQuoteLiteral(to)} maxresults 1000`
  )) as { QueryResponse?: Record<string, Array<{ Id: string; PrivateNote?: string }> | undefined> };

  const rows = found.QueryResponse?.[qbEntity] ?? [];
  for (const candidate of rows) {
    if (memoMatches(candidate.PrivateNote, entityId)) return candidate.Id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The third number
// ---------------------------------------------------------------------------

/**
 * ⚠️ RULED [Josh, S104]: **THIS SYSTEM COMPUTES THE TOTAL. QUICKBOOKS RECEIVES
 * IT AND DOES NOT CALCULATE.** This is the check that makes the ruling
 * enforceable rather than merely intended.
 *
 * ----------------------------------------------------------------------------
 * ⚠️ THERE ARE THREE NUMBERS, AND ONLY TWO WERE EVER COMPARED
 * ----------------------------------------------------------------------------
 * `handleInvoiceCreate` already refuses when the LINES disagree with
 * `billed_total` — *"MONEY THAT DOES NOT FOOT IS FLAGGED, NOT ADJUSTED"*. But
 * that compares two of OUR numbers. The third is what QuickBooks reports back
 * in `TotalAmt`, and **that is the one the books actually use.** It was
 * declared in the response type and never read.
 *
 * ⚠️ WHY IT CAN DIFFER AT ALL, given we send explicit `TaxCodeRef: 'NON'`.
 * Because `NON` is the INSTRUCTION, not the outcome. QuickBooks Online computes
 * tax server-side from the customer's taxable status and the company's tax
 * setup; the sandbox company runs with `TaxPrefs.UsingSalesTax: true` and
 * `TaxGroupCodeRef 2` [measured S104]. `NON` resolves that computation to zero
 * — but a rejected code, a non-US realm (where `NON` is invalid and
 * `GlobalTaxCalculation` governs instead), or a customer-level override are all
 * ways the arithmetic can come back different. **A silent difference here is an
 * invoice showing one total to the client and another in the books**, which is
 * the entire risk this item exists to close.
 *
 * ⚠️ AND IT FIRES AFTER THE OBJECT EXISTS, WHICH IS WHY THE MESSAGE SAYS SO.
 * We cannot un-send it. What we can do is refuse to record it as a good push
 * and tell a person exactly which QuickBooks object to go and look at.
 *
 * ⚠️ A VOID IS NOT A MISMATCH — DO NOT CALL THIS ON ONE. QuickBooks zeroes the
 * lines of a voided invoice and returns `TotalAmt: 0` while our row keeps its
 * original `billed_total`. Measured on INV-3676: ours 291.44, QuickBooks 0,
 * both correct. A total check on the void path would fail every void.
 */
export function totalMismatch(
  expected: number,
  reported: number | undefined,
  qbDescription: string
): HandlerResult | null {
  // ⚠️ ABSENT IS NOT ZERO. A response that omits `TotalAmt` tells us nothing,
  // and treating the omission as 0 would invent a mismatch on every such reply.
  if (reported === undefined || reported === null) return null;

  // Half a cent: the same tolerance the lines-vs-total foot check already uses,
  // so the two never disagree about what "equal" means.
  if (Math.abs(Number(reported) - expected) <= 0.005) return null;

  return {
    kind: 'terminal',
    reason:
      `QuickBooks recorded ${qbDescription} as $${Number(reported).toFixed(2)}, but this ` +
      `record is $${expected.toFixed(2)}. The two must agree — the books would show a ` +
      `different figure from the document. The QuickBooks entry EXISTS and needs to be ` +
      `corrected or removed there before this is pushed again.`,
  };
}
