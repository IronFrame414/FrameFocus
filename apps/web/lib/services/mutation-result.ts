/**
 * The row-count guard, in ONE place. [M2-03, S154]
 *
 * ⚠️ WHY THIS FILE EXISTS. Postgres does not consider a zero-row UPDATE an
 * error. When an RLS policy matches nothing, the statement is valid and changes
 * nothing; PostgREST returns `error: null`. A caller that checks only `error`
 * therefore reports success over a row it never touched.
 *
 * That defect was found and fixed three times, in three files, and the third
 * finding was that a third COPY was the wrong answer:
 *
 *   * `#1-s146` [S146] — `contracts-client.ts`. A PM was told a legal document
 *     had been voided over a contract that was still live.
 *   * `M1-01` [S151/S152] — `company-client.ts`. R17 had guarded ONE of eight
 *     writers, so the file taught both patterns and the next person copying a
 *     neighbouring function copied the unguarded one. Two of the seven wrote
 *     `contractor_signature_path`, the image stamped onto change orders and
 *     lien releases.
 *   * `M2-03` [S153/S154] — `contacts-client.ts` and `contact-addresses-client.ts`.
 *     0 of 3 UPDATE-shaped writers guarded. `deleteContact()` reported success
 *     to a crew member whose write RLS had discarded — while ERRORING for an
 *     Owner, who may actually delete.
 *
 * **The rule for every service in this repo: an UPDATE-shaped write ends
 * `.select('id')` and goes through `applied()`. No exceptions.**
 *
 * INSERT-shaped writes do NOT need this — an RLS-refused INSERT raises a real
 * error, so checking `error` is sufficient there. (Watch the inverse trap:
 * `.select()` after an INSERT compiles to `INSERT … RETURNING`, and a 42501
 * from that is RLS refusing the READ, not the insert.)
 *
 * Deliberately in `lib/services/` and NOT under `app/dashboard/` or `app/m/`:
 * CLAUDE.md's PARITY ruling makes a helper's directory a claim of ownership, and
 * this belongs to no single surface. It is pure — **no supabase import** — so
 * server files, client files and future modules can all reach it without
 * dragging `next/headers` into a client bundle.
 */

/**
 * The user-facing message for a write the database discarded.
 *
 * It names no cause it has not verified (CLAUDE.md): an empty result cannot
 * distinguish "the policy refused you" from "the row is gone", so it says both.
 */
export const DISCARDED =
  'That change was not applied. You may not have permission to make it, or the record no longer exists.';

/**
 * Did the write touch anything?
 *
 * Pass the `data` from a write that ended `.select('id')`. `.select('id')` is
 * what makes the affected rows observable at all — without it there is nothing
 * to count and the caller is blind.
 *
 * ⚠️ DO NOT apply this to a DELETE whose empty result is legitimate. See
 * `saveContractBoxMap()`, where clearing a template that has no boxes yet
 * correctly affects zero rows; that path gates on the caller's role instead.
 */
export function applied(rows: unknown[] | null): boolean {
  return Array.isArray(rows) && rows.length > 0;
}
