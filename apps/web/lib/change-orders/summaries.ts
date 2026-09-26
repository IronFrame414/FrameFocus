// S112 R5b — the no-money summary of an APPROVED change order, and which of
// them a caller should see. Shared by /m and desktop (PARITY): the two lists
// must answer "what is on this project's change-order screen" identically.

/** One row of `get_approved_change_order_summaries()`. No figure, by construction. */
export interface ApprovedCoSummary {
  id: string;
  project_id: string;
  co_number: string;
  title: string;
  description: string | null;
  signed_at: string | null;
}

/**
 * Roles for whom a summary can ever add something. Mirrors the role arm of
 * `get_approved_change_order_summaries` minus Owner/Admin, who already hold
 * every row in full. A UI convenience that saves a round-trip — NOT the rule:
 * the function applies its own role check whatever the caller does.
 */
export const SUMMARY_READER_ROLES = ['project_manager', 'foreman', 'crew_member'] as const;

export function readsCoSummaries(role: string | null | undefined): boolean {
  return (SUMMARY_READER_ROLES as readonly string[]).includes(role ?? '');
}

/**
 * The summaries to render BESIDE the caller's full rows.
 *
 * `fullRowIds` is whatever `change_orders` returned under RLS — every CO for
 * Owner/Admin, the PM's own, nothing for foreman and crew. A summary is shown
 * only for an approved CO the caller does NOT already hold in full, so:
 *
 *   Owner / Admin  → none (they hold every row, with its figures)
 *   PM             → other authors' approved COs, as summaries
 *   foreman / crew → every approved CO on the project, as summaries
 *
 * Never shows the same change order twice, in either form.
 */
export function summariesToShow(
  summaries: readonly ApprovedCoSummary[],
  fullRowIds: Iterable<string>
): ApprovedCoSummary[] {
  const held = new Set(fullRowIds);
  return summaries.filter((s) => !held.has(s.id));
}
