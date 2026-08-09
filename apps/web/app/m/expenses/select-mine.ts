// M-26's "Mine" chip — the row selection and the empty copy, as pure functions
// so the FAIL-OPEN path below is directly assertable. Both were inline in
// page.tsx, where neither could be tested.

/**
 * The rows the "Mine" chip shows.
 *
 * ⚠️ FAILS CLOSED ON A NULL MEMBER [S107]. This used to read
 *
 *     active === 'mine' && myMember ? visible.filter(...) : visible
 *
 * where a null member short-circuits the `&&` and the ternary falls through to
 * `visible` — **every row the caller can see, silently relabelled "Mine"**, on
 * the one `/m` screen that renders currency.
 *
 * It was reachable, not theoretical: `getMyMember()` returns null whenever the
 * profile has no `company_members` row, and that row is genuinely optional —
 * `members.ts` ends in `.maybeSingle()`, and the schema's own comment notes
 * subs carry `profile_id NULL until invited`.
 *
 * A filter that cannot identify the user must match NOTHING. It is not a
 * security hole — RLS returned those rows either way — but a filter that
 * silently means its opposite is worse than one that shows nothing, because
 * the user cannot tell it is lying.
 */
export function selectMine<T extends { author_member_id: string | null }>(
  rows: T[],
  myMemberId: string | null
): T[] {
  if (myMemberId === null) return [];
  return rows.filter((e) => e.author_member_id === myMemberId);
}

/**
 * The empty state for each chip.
 *
 * `'No expenses of yours.'` was UNREACHABLE before the fix above: the null-member
 * path always returned a full list, so the "mine" empty state could never
 * render. That copy appearing is the observable tell that the chip fails closed,
 * which is what the unit suite asserts.
 */
export function emptyCopyFor(active: 'mine' | 'pending' | null): string {
  if (active === 'pending') return 'No pending expenses.';
  if (active === 'mine') return 'No expenses of yours.';
  return 'No expenses.';
}
