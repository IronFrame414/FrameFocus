// S107 Part B — the marker that says "a subcontractor uploaded this through a
// bid token", and the rule for who may see such a row.
//
// ⚠️ IT LIVES IN `lib/`, NOT IN THE ROUTE, DELIBERATELY. Two surfaces depend on
// it — `app/api/bid/[token]/files` stamps it on upload and filters on it when
// listing — and CLAUDE.md's parity rule is that a shared mechanism belongs below
// the surfaces that use it, or one of them will grow its own version. A Next
// route file also cannot export a constant at all (the App Router's generated
// types constrain a route module's exports to the handlers), so putting it here
// is both the correct home and the only legal one.

/** Stamped into `files.tags` by the anonymous bid-token upload path. */
export const SUB_UPLOAD_TAG = 'sub-bid-upload';

/**
 * May an ANONYMOUS bidder see this estimate file?
 *
 * ⚠️ An estimate's files are the estimator's scope documents AND every other
 * subcontractor's uploaded bid. The bid page is anonymous, so showing an
 * unfiltered list hands a bidder their competitors' pricing — a money
 * disclosure on a public surface.
 *
 * A row is visible ONLY if BOTH hold:
 *   1. `created_by` is set — a signed-in staff member uploaded it. Every
 *      bid-token upload goes through the service role and has no `auth.uid()`.
 *   2. it does not carry `SUB_UPLOAD_TAG` — the positive marker the upload path
 *      stamps.
 *
 * ⚠️ Either test alone would be sufficient TODAY. Both are applied because they
 * fail INDEPENDENTLY: (1) breaks if some future staff-side insert forgets
 * `created_by`; (2) breaks if the tag is edited off the row. Requiring both
 * means one regression is a bug, not a leak. That asymmetry — cheap to keep,
 * severe to get wrong — is the whole argument for the redundancy.
 */
export function bidderCanSeeFile(file: {
  created_by?: string | null;
  tags?: string[] | null;
}): boolean {
  if (!file.created_by) return false;
  return !(file.tags ?? []).includes(SUB_UPLOAD_TAG);
}

// ===========================================================================
// [S112, RULED Josh] THE TOKEN PROVES WHO; THE BID'S CURRENT STATUS DECIDES WHETHER.
// ===========================================================================
// Before S112 the bid token was checked for `is_deleted` and `expires_at` only,
// so a CANCELLED or DECLINED bid's token went on serving the scope documents —
// and accepting uploads — for the rest of its 14 days. Measured on rebuild-test:
// 200 and a fetchable URL for both. Ruled:
//   cancelled / declined (and any "withdrawn" — no such status exists today) → refused
//   submitted → still served (a sub may reference what they bid on)
//   expired  → refused, as before
// The same set is enforced in the database for the page's read
// (get_sub_bid_request, 20261850000000), so the page, the API and a direct RPC
// call cannot disagree. Read on EVERY request, never cached from token issue.
export const BID_TOKEN_OPEN_STATUSES: readonly string[] = ['sent', 'viewed', 'submitted'];

export function bidTokenIsOpen(status: string | null | undefined): boolean {
  return BID_TOKEN_OPEN_STATUSES.includes(status ?? '');
}
