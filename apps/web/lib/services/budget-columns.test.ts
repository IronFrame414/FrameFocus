import { describe, expect, it } from 'vitest';
import { budgetColumnsFor } from '@/lib/services/invoices-shared';

// §7.1 — Budget & Cost column counts per role. These sat "verified by reading
// the mount" for three sessions because the rule was inline in a server
// component, which no harness can render. Extracting it made it assertable;
// this asserts it exhaustively, for every role the platform gates on.

describe('§7.1 — Budget & Cost columns per role', () => {
  it('Owner and Admin get the full 7 columns, budgeted included', () => {
    for (const role of ['owner', 'admin']) {
      const plan = budgetColumnsFor(role);
      expect(plan.columns, `${role} column count`).toBe(7);
      expect(plan.set).toBe('full');
      expect(plan.seesBudgeted).toBe(true);
      expect(plan.seesCommitted).toBe(true);
    }
  });

  it('a PM gets 5 columns — committed yes, budgeted NO', () => {
    const plan = budgetColumnsFor('project_manager');
    expect(plan.columns).toBe(5);
    expect(plan.set).toBe('committed');
    // The Financial Visibility Floor: a PM sees what is committed and actual,
    // never the budgeted/sell figure or the margin derived from it.
    expect(plan.seesBudgeted).toBe(false);
    expect(plan.seesCommitted).toBe(true); // A-3 widened the floor to include PM
  });

  it('a Foreman gets 3 columns — actual cost only', () => {
    const plan = budgetColumnsFor('foreman');
    expect(plan.columns).toBe(3);
    expect(plan.set).toBe('actual_only');
    expect(plan.seesBudgeted).toBe(false);
    expect(plan.seesCommitted).toBe(false);
  });

  it('Crew reaches no columns at all — the page redirects them', () => {
    const plan = budgetColumnsFor('crew_member');
    expect(plan.columns).toBe(0);
    expect(plan.set).toBe('none');
  });

  it('an unknown role is treated as crew, not as an owner', () => {
    // Fail closed: a role the rule does not recognise must get nothing.
    for (const role of ['client', 'subcontractor', '', 'OWNER']) {
      expect(budgetColumnsFor(role).columns, `${role} should get nothing`).toBe(0);
      expect(budgetColumnsFor(role).seesBudgeted).toBe(false);
    }
  });

  it('the counts are strictly descending — no role sees more than the one above', () => {
    const order = ['owner', 'admin', 'project_manager', 'foreman', 'crew_member'];
    const counts = order.map((r) => budgetColumnsFor(r).columns);
    expect(counts).toEqual([7, 7, 5, 3, 0]);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });
});
