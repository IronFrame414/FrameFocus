import { describe, it, expect } from 'vitest';
import { emptyCopyFor, selectMine } from '@/app/m/expenses/select-mine';

// M6M §4.13.3 — M-26's "Mine" chip.
//
// These exist because A-45g PASSED WITH THE BUG PRESENT. It asserted only
// `mine <= all` and `pending <= all`, which is true of a filter that narrows,
// a filter that is inert, AND a filter that fails open and returns everything.
// The regression below is the one that assertion could never see.

describe('M-26 · the "Mine" chip fails CLOSED on a null member (A-45g)', () => {
  const rows = [
    { id: 'a', author_member_id: 'me' },
    { id: 'b', author_member_id: 'someone-else' },
    { id: 'c', author_member_id: null },
  ];

  it('a null member matches NOTHING — it must not fall through to every row', () => {
    expect(selectMine(rows, null)).toEqual([]);
    // Stated the other way round, because this is the exact shape of the bug:
    // the old code returned the full set here.
    expect(selectMine(rows, null)).not.toHaveLength(rows.length);
  });

  it('and the empty state that then renders says so — copy previously unreachable', () => {
    // With the fail-open bug the "mine" list was never empty, so this string
    // could not appear on screen. Its reachability IS the fix, observable.
    expect(selectMine(rows, null)).toHaveLength(0);
    expect(emptyCopyFor('mine')).toBe('No expenses of yours.');
  });

  it('a real member still gets exactly their own rows', () => {
    expect(selectMine(rows, 'me')).toEqual([{ id: 'a', author_member_id: 'me' }]);
  });

  it('a member who authored nothing gets an empty list, not everything', () => {
    expect(selectMine(rows, 'nobody')).toEqual([]);
  });

  it('a row with a null author is never attributed to anyone', () => {
    // Guards the sloppy fix — `e.author_member_id === myMemberId` with both
    // null would have matched, handing an unattributed row to whoever asked.
    expect(selectMine(rows, null)).not.toContainEqual({ id: 'c', author_member_id: null });
    expect(selectMine(rows, 'me')).not.toContainEqual({ id: 'c', author_member_id: null });
  });

  it('the other chips keep their own copy', () => {
    expect(emptyCopyFor('pending')).toBe('No pending expenses.');
    expect(emptyCopyFor(null)).toBe('No expenses.');
  });
});
