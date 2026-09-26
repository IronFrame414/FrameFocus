import { describe, expect, it } from 'vitest';
import { summariesToShow, type ApprovedCoSummary } from '@/lib/change-orders/summaries';

// S112 R5b — which approved-CO summaries sit beside a caller's full rows.
// The database decides WHAT a summary may contain; this decides only that the
// same change order is never shown twice, once with money and once without.

const sum = (id: string): ApprovedCoSummary => ({
  id,
  project_id: 'p',
  co_number: `CO-${id}`,
  title: `t${id}`,
  description: null,
  signed_at: null,
});
const ALL = ['a', 'b', 'c'].map(sum);

describe('summariesToShow', () => {
  it('Owner/Admin hold every row in full → no summaries', () => {
    expect(summariesToShow(ALL, ['a', 'b', 'c', 'd-draft'])).toEqual([]);
  });

  it("PM holds their own → only other authors' approved COs", () => {
    expect(summariesToShow(ALL, ['b']).map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('foreman/crew hold nothing → every approved CO', () => {
    expect(summariesToShow(ALL, []).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('CONTROL — a helper that ignored the held set would show a CO twice (this must differ)', () => {
    const naive = (s: readonly ApprovedCoSummary[]) => [...s];
    expect(naive(ALL)).not.toEqual(summariesToShow(ALL, ['b']));
  });
});
