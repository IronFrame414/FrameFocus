import { describe, expect, it } from 'vitest';
import { deriveViewStats, isLikelyNonHuman } from '@/lib/proposal/view-filter';

// Unit half of P3 (proposal-view-tracking-spec §5/§7): the derivation and the
// read-time human filter. Structure assertions, not an exhaustive UA corpus —
// the heuristic is DESIGNED to be replaceable without touching stored rows.

describe('isLikelyNonHuman', () => {
  it('flags scanners, previewers and scripted clients', () => {
    for (const ua of [
      'Mozilla/5.0 (compatible; GoogleImageProxy)',
      'ProofPoint URL Defense scanner',
      'curl/8.4.0',
      'python-requests/2.31',
      'Slackbot-LinkExpanding 1.0',
      '',
      null,
      '   ',
    ]) {
      expect(isLikelyNonHuman(ua), `should flag: ${JSON.stringify(ua)}`).toBe(true);
    }
  });

  it('passes real browsers', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    ]) {
      expect(isLikelyNonHuman(ua), `should pass: ${ua}`).toBe(false);
    }
  });
});

describe('deriveViewStats', () => {
  const est = 'e-1';

  it('counts human opens and takes the latest timestamp, any row order', () => {
    const stats = deriveViewStats([
      { estimate_id: est, created_at: '2026-08-14T09:14:00Z', user_agent: 'Mozilla/5.0 Safari/605.1.15' },
      { estimate_id: est, created_at: '2026-08-14T09:12:00Z', user_agent: 'Mozilla/5.0 Chrome/128.0' },
      // The scanner row is STORED but never displayed — write-time filtering
      // would have frozen today's rule into the data.
      { estimate_id: est, created_at: '2026-08-12T16:03:00Z', user_agent: 'GoogleImageProxy' },
    ]);
    expect(stats[est]).toEqual({ total: 2, lastViewedAt: '2026-08-14T09:14:00Z' });
  });

  it('an estimate with only scanner rows derives NO stats — the display falls back to "sent"', () => {
    const stats = deriveViewStats([
      { estimate_id: est, created_at: '2026-08-12T16:03:00Z', user_agent: 'curl/8.4.0' },
    ]);
    expect(stats[est]).toBeUndefined();
  });

  it('groups by estimate and returns an empty map for no rows', () => {
    expect(deriveViewStats([])).toEqual({});
    const stats = deriveViewStats([
      { estimate_id: 'a', created_at: '2026-08-01T00:00:00Z', user_agent: 'Mozilla/5.0 Safari' },
      { estimate_id: 'b', created_at: '2026-08-02T00:00:00Z', user_agent: 'Mozilla/5.0 Safari' },
    ]);
    expect(Object.keys(stats).sort()).toEqual(['a', 'b']);
  });
});
