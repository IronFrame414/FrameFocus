import { describe, it, expect } from 'vitest';
import { storageStatus, formatBytes } from './storage-cap';
import { storageCapBytesFor, PLANS } from './plan-catalog';

const GB = 1024 * 1024 * 1024;

describe('storageStatus — the ruled boundaries, exactly', () => {
  it('the ruled caps are what the catalog advertises: 50/120/500', () => {
    expect(PLANS.map((p) => p.storageGb)).toEqual([50, 120, 500]);
    // Q1: the advertised string carries the SAME number as the enforced field.
    for (const p of PLANS) {
      expect(
        p.features.some((f) => f === `${p.storageGb} GB storage`),
        `${p.id} advertises a different number than it enforces`
      ).toBe(true);
    }
  });

  it('⚠️ the catalog carries NO AI-estimates line — removed by ruling, not reworded', () => {
    for (const p of PLANS) {
      expect(p.features.join(' ')).not.toMatch(/AI estimate/i);
    }
  });

  it('79.9% is ok, 80% warns', () => {
    const cap = storageCapBytesFor('starter')!;
    expect(storageStatus(cap * 0.799, 'starter').level).toBe('ok');
    expect(storageStatus(cap * 0.8, 'starter').level).toBe('warn80');
  });

  it('94.9% warns at 80-level, 95% escalates', () => {
    const cap = storageCapBytesFor('professional')!;
    expect(storageStatus(cap * 0.949, 'professional').level).toBe('warn80');
    expect(storageStatus(cap * 0.95, 'professional').level).toBe('warn95');
  });

  it('⚠️ 99.99% is NOT blocked; exactly 100% is', () => {
    const cap = storageCapBytesFor('business')!;
    expect(storageStatus(cap - 1, 'business').level).toBe('warn95');
    expect(storageStatus(cap, 'business').level).toBe('blocked');
    expect(storageStatus(cap + 1, 'business').level).toBe('blocked');
  });

  it('⚠️ an unknown tier FAILS OPEN — a bookkeeping gap must not block a business', () => {
    expect(storageStatus(999 * GB, 'enterprise-legacy').level).toBe('ok');
    expect(storageStatus(999 * GB, null).level).toBe('ok');
    expect(storageStatus(999 * GB, null).capBytes).toBeNull();
  });

  it('zero usage on a real plan: ok, 0%', () => {
    const s = storageStatus(0, 'starter');
    expect(s.level).toBe('ok');
    expect(s.usedPct).toBe(0);
  });
});

describe('formatBytes', () => {
  it('rounds sensibly at each magnitude', () => {
    expect(formatBytes(50 * GB)).toBe('50 GB');
    expect(formatBytes(2.44 * GB)).toBe('2.4 GB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3 MB');
    expect(formatBytes(2048)).toBe('2 KB');
  });
});
