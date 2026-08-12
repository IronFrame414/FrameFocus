import { describe, it, expect } from 'vitest';
import { isLockExemptApiPath, isLockExemptPagePath, LOCK_EXEMPT_API_PREFIXES } from './lock-guard';

/**
 * S138 — the exemption list is the load-bearing half of the lock guard.
 *
 * The guard itself is three lines. What can go catastrophically wrong is the
 * list: lock a company out of the payment route and the only action that ends
 * the lock becomes unreachable. These run in the CI suite (not `.live.ts`)
 * because they need no database and must never be skipped.
 */
describe('the payment path survives a lock — the one that must never regress', () => {
  it('⚠️ /api/stripe/checkout is exempt, or the lock is unrecoverable', () => {
    expect(isLockExemptApiPath('/api/stripe/checkout')).toBe(true);
  });

  it('the billing pages are reachable while locked', () => {
    expect(isLockExemptPagePath('/dashboard/billing')).toBe(true);
    expect(isLockExemptPagePath('/dashboard/billing/plans')).toBe(true);
  });

  it('the locked screen does not redirect to itself', () => {
    expect(isLockExemptPagePath('/locked')).toBe(true);
  });
});

describe('paths that carry no user session are exempt', () => {
  it.each([
    '/api/stripe/webhook',
    '/api/webhooks/resend',
    '/api/cron/trial-lock',
    '/api/admin/trial-unlock',
  ])('%s', (p) => {
    expect(isLockExemptApiPath(p)).toBe(true);
  });
});

describe('everything else is guarded', () => {
  it.each([
    '/api/deliveries/abc',
    '/api/projects',
    '/api/trial/export',
    '/dashboard',
    '/dashboard/projects',
    '/m/projects',
  ])('%s is NOT exempt', (p) => {
    expect(isLockExemptApiPath(p) || isLockExemptPagePath(p)).toBe(false);
  });

  it('⚠️ prefix matching does not leak on a lookalike path', () => {
    // `/api/cronjob-runner` must NOT inherit `/api/cron`'s exemption.
    expect(isLockExemptApiPath('/api/cronjob-runner')).toBe(false);
    expect(isLockExemptApiPath('/api/stripe/checkout-evil')).toBe(false);
    expect(isLockExemptPagePath('/lockedout')).toBe(false);
  });
});

describe('the list itself', () => {
  it('every entry is an absolute /api path', () => {
    for (const p of LOCK_EXEMPT_API_PREFIXES) {
      expect(p.startsWith('/api')).toBe(true);
    }
  });
});
