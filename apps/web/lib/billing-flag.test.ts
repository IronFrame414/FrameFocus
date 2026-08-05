import { describe, expect, it } from 'vitest';
import { billingEnforcementEnabled } from './billing-flag';

// The kill-switch's whole value is its DIRECTION: a mistake must leave billing
// enforced, never silently unenforced. These pin that, because the failure mode
// is invisible — nobody gets paged when customers stop being charged.

describe('billing kill-switch defaults to ENFORCED', () => {
  it('enforces when the env var is absent — the normal production case', () => {
    expect(billingEnforcementEnabled(undefined)).toBe(true);
  });

  it('enforces on an empty string (a set-but-blank Vercel var)', () => {
    expect(billingEnforcementEnabled('')).toBe(true);
  });

  it.each(['false', 'FALSE', '0', 'no', 'off', 'disabled'])(
    'enforces on %s — only one exact value disables',
    (value) => {
      expect(billingEnforcementEnabled(value)).toBe(true);
    }
  );

  // Case sensitivity is a FEATURE here, not an oversight: a near-miss must not
  // silently stop revenue. It fails toward the loud outcome.
  it.each(['TRUE', 'True', ' true', 'true '])('enforces on the near-miss %p', (value) => {
    expect(billingEnforcementEnabled(value)).toBe(true);
  });
});

describe('billing kill-switch turns off on exactly one value', () => {
  it('disables enforcement on the literal string true', () => {
    expect(billingEnforcementEnabled('true')).toBe(false);
  });
});
