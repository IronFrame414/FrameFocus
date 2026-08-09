import Link from 'next/link';
import { getExpenses, getExpenseReceipts } from '@/lib/services/expenses';
import { getBillsAndCommitments } from '@/lib/services/payables';
import { getMyMember } from '@/lib/services/members';
import { emptyCopyFor, selectMine } from './select-mine';
import { SetMobileHeader } from '../mobile-header';
import {
  EmptyState,
  FilterChips,
  ListRow,
  StatusPill,
  formatMoney,
  type Chip,
} from '../mobile-ui';

// M6M §4.13.3 — M-26 · Expenses. THE FIRST CURRENCY ON /m (D-37).
//
// ─────────────────────────────────────────────────────────────────────────────
// NO UI ROLE CHECK. THE DATABASE DECIDES WHICH ROWS ARRIVE. (A-45d)
// ─────────────────────────────────────────────────────────────────────────────
// This screen renders exactly what getExpenses() returns for the caller, with no
// role branch anywhere in the file. That is deliberate and asserted:
// expenses_select_scoped is a REAL DB row floor — unlike change_orders.net_delta,
// which is UI-gated only (TECH_DEBT #117) and is why D-26 cut CO money from
// mobile entirely. An expense is ACTUAL COST, which the Financial Visibility
// Floor makes visible to every role by design.
//
// After D-47 (migration 20260825000000) the row set is:
//   crew_member / subcontractor — own, plus every expense on ASSIGNED projects
//   foreman / project_manager   — the same
//   owner / admin               — everything in the company
// can_view_project() is what bounds the first two to assigned projects. Nothing
// in this file re-implements or second-guesses that.
//
// DO NOT add a role gate here "to be safe". A UI gate over a real DB floor is
// the pattern #117 exists to warn about, and A-45d fails on it.

const CHIPS: readonly Chip[] = [
  { value: null, label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'pending', label: 'Pending' },
];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const CATEGORY_LABEL: Record<string, string> = {
  material: 'Material',
  subcontractor: 'Subcontractor',
  other: 'Other',
};

export default async function MobileExpensesPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const raw = searchParams.filter;
  const active = raw === 'mine' || raw === 'pending' ? raw : null;

  // "Pending" goes through the SERVICE FILTER — the same predicate
  // getPendingExpenses() uses, so the chip and that function cannot diverge
  // (A-45g asserts they agree).
  //
  // "Mine" is narrowed AFTER the fetch against getMyMember(). That is the house
  // pattern, not a shortcut: getExpenses() takes { project_id, status } and no
  // author filter, and neither does getPunchLists() or getProjects() — M-14's
  // and M-2's "Mine" chips have exactly this shape. Adding an author filter to
  // a shared service for one mobile chip is a bigger change than this slice
  // should make unasked.
  const [rows, myMember, payables] = await Promise.all([
    getExpenses(active === 'pending' ? { status: 'pending' } : undefined),
    getMyMember(),
    // RULING 2 [S106] — the SAME source desktop's `payableIds` comes from
    // (expenses-page-client.tsx:89). Deliberately the whole function and not a
    // local re-test: it resolves the has-payments condition, which no
    // predicate over an expense row alone can answer. See below.
    getBillsAndCommitments(),
  ]);

  // ── PAYABLES ARE EXCLUDED, FOR EVERY ROLE (D-49 as corrected [S106]) ─────
  // M-26 IS mobile's Receipts tab, and desktop's Receipts tab excludes every
  // row in getBillsAndCommitments() — NOT retainage alone.
  //
  // ⚠ THE COMMENT THAT USED TO SIT HERE WAS RIGHT AND THE CODE BELOW IT WAS
  // WRONG, which is how this survived review. It said desktop "filters out
  // everything in getBillsAndCommitments()" — an accurate description — and
  // then the line beneath it filtered `!e.is_retainage`, one of the five
  // conditions. A correct comment over wrong code reads as verified on a
  // skim. D-49's own premise repeated the same claim, so the spec agreed with
  // the comment rather than with the behaviour.
  //
  // THE EXCLUSION IS FIVE CONDITIONS, FOUR OF WHICH ARE PAYABLE_OR_FILTER:
  //     state = 'committed'
  //     sub_contract_id IS NOT NULL
  //     purchase_order_id IS NOT NULL
  //     is_retainage = true
  //   plus HAS PAYMENTS — a settled manual bill (state flipped back to
  //   'actual', no linkage) matches none of the four and is caught only by its
  //   payments. That is why this calls getBillsAndCommitments() rather than
  //   testing rows locally: the fifth condition needs a second query, and
  //   isPayableRow(e) alone would silently miss it.
  //
  // PAYABLE_OR_FILTER IS READ, NEVER MODIFIED. It is also the budget
  // recompute's ORIGIN test, mirrored in SQL inside
  // recompute_budget_item_actual/_committed (20260730010000) — changing it
  // silently moves budget numbers (money-representation.md §4.5, locked S93).
  //
  // FILTER THE COLUMN, NEVER THE SUPPLIER STRING. `supplier` reads
  // "Retainage held — {sub display_name}" (20260729010000:712) — a GENERATED
  // LABEL, not a flag.
  //
  // ROLE-BLIND ON PURPOSE. A-45d forbids a UI ROLE check and still does; this
  // exclusion applies to owner and crew alike. Filtering for crew but not for
  // Owner would introduce exactly the role gate A-45d has always banned.
  // (Desktop additionally hides its Bills TAB from crew; mobile has no second
  // tab to hide, so the row-level exclusion is the whole of the parity.)
  //
  // STILL UI-ONLY. expenses_select_scoped returns these rows — nothing changed
  // at the database — so any other consumer of getExpenses() still sees them.
  // Same class as TECH_DEBT #117/#132, desktop half #136. A-45i fails if this
  // is deleted.
  //
  // THE FILTER IS UI-ONLY. expenses_select_scoped still RETURNS these rows —
  // D-49 changed nothing at the database — so any other consumer of
  // getExpenses() will see them. Same class as TECH_DEBT #117 and #132, and the
  // desktop half of it is #136. A-45i is the criterion that fails if this line
  // is deleted.
  const payableIds = new Set(payables.map((p) => p.id));
  const visible = rows.filter((e) => !payableIds.has(e.id));

  // A null member matches NOTHING, never everything — see select-mine.ts.
  const expenses = active === 'mine' ? selectMine(visible, myMember?.id ?? null) : visible;

  // §4.13.3 binds receipts to getExpenseReceipts(expenseId) — one call per
  // expense. N+1 by construction, accepted for a field user's list: the
  // alternative is a batch function that does not exist, and inventing one
  // would break §4.13's bound-or-cut rule in the other direction.
  const receiptsByExpense = new Map<string, string | null>(
    await Promise.all(
      expenses.map(async (e) => {
        const files = await getExpenseReceipts(e.id);
        return [e.id, files[0]?.id ?? null] as [string, string | null];
      })
    )
  );

  const emptyCopy = emptyCopyFor(active);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Expenses" sub="Company costs" />

      <FilterChips chips={CHIPS} active={active} basePath="/m/expenses" param="filter" />

      {expenses.length === 0 ? (
        <div className="pt-[18px]">
          <EmptyState>{emptyCopy}</EmptyState>
        </div>
      ) : (
        <ul className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {expenses.map((e) => {
            const receiptId = receiptsByExpense.get(e.id) ?? null;
            return (
              <ListRow key={e.id} testId="m-expense-row">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                    {e.supplier}
                  </p>
                  <p className="mt-[3px] flex flex-wrap items-center gap-[6px]">
                    <StatusPill
                      label={STATUS_LABEL[e.status] ?? e.status}
                      tone={e.status === 'rejected' ? 'danger' : 'muted'}
                    />
                    <span className="font-mono text-[11px] font-semibold text-m6m-muted">
                      {CATEGORY_LABEL[e.cost_category] ?? e.cost_category}
                    </span>
                    {/* §2 — every date is mono. */}
                    <span className="font-mono text-[11px] text-m6m-muted">{e.expense_date}</span>
                  </p>
                  {e.author?.display_name ? (
                    <p className="mt-[2px] truncate text-[13px] text-m6m-muted">
                      {e.author.display_name}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-[4px]">
                  {/* §2's money token (D-46). Mono, like every number, and the
                      em-dash rather than $0.00 when the amount is absent. */}
                  <span
                    data-testid="m-expense-amount"
                    className="font-mono text-[15px] font-semibold text-m6m-navy"
                  >
                    {formatMoney(e.amount)}
                  </span>

                  {/* §4.13.3 — receipts open into M-9, the EXISTING viewer. No
                      second image surface is built here (A-45h). [S107] M-9 now
                      RESOLVES a receipt: it shipped resolving only category
                      'photos', so every one of these links 404'd. The stale note
                      that used to sit here blamed "M-9 is a later slice", which
                      stopped being true when M-9 landed and left a 100% failure
                      reading as a known-and-accepted state. */}
                  {receiptId ? (
                    <Link
                      href={`/m/p/${e.project_id}/photos/${receiptId}`}
                      data-testid="m-receipt-link"
                      aria-label={`Receipt for ${e.supplier}`}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-m6m-border bg-m6m-card text-m6m-blue"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                        <path d="m21 15-5-5L5 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </Link>
                  ) : null}
                </div>
              </ListRow>
            );
          })}
        </ul>
      )}

      {/* CUT from M-26, all with reasons in §4.13.3: approve/reject (the 7A
          desktop review flow — approval is a money decision with a rejection-note
          requirement), capture (not in D-6's offline-write set, not among
          GAP-8's five capture screens), allocations (crew cannot read
          expense_allocations at all — the asymmetry §4.13.3 records), and
          getJobCostRollup() in its entirety (labor cost burdened from
          Owner/Admin-only rate snapshots, plus the committed/payables side,
          which is Budget-adjacent and still excluded by D-9-as-narrowed). */}
    </div>
  );
}
