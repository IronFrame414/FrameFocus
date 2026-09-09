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
