import { describe, it, expect } from 'vitest';
import { QBO_DISCOVERY_EXPECTATIONS, QBO_DISCOVERY_URL } from '@/lib/quickbooks/config';

/**
 * ⚠️ F6 — the hardening half: ask Intuit's discovery document whether our three
 * hardcoded OAuth endpoints still match it.
 *
 * ⚠️ THEY MATCHED AT S187 AND THAT IS NOT RE-LITIGATED. This test exists so a
 * FUTURE drift is a red build instead of a silent `invalid_grant` on a day
 * nobody changed anything. Josh's questionnaire answer — that the app does not
 * consume the discovery document at runtime — stays accurate: this is a test,
 * not a dependency.
 *
 * ⚠️ A NETWORK FAILURE MUST NOT READ AS AGREEMENT. If the document cannot be
 * fetched the test FAILS rather than skipping, because "we could not check" and
 * "we checked and it was fine" are the two things this whole session keeps
 * finding collapsed into one another.
 */
describe('S104 — the OAuth endpoints still match Intuit’s discovery document', () => {
  it('fetches the document and every constant agrees', async () => {
    const response = await fetch(QBO_DISCOVERY_URL, { headers: { Accept: 'application/json' } });
    expect(response.status, `discovery document unreachable at ${QBO_DISCOVERY_URL}`).toBe(200);

    const doc = (await response.json()) as Record<string, unknown>;

    // Guard the parse before trusting the comparison: a document that parsed to
    // an empty object would make every `toBe` below vacuously... fail, actually,
    // but with a message that blames the wrong thing.
    expect(
      Object.keys(doc).length,
      'the discovery document parsed to almost nothing — check the URL, not the constants'
    ).toBeGreaterThan(3);

    for (const [field, expected] of Object.entries(QBO_DISCOVERY_EXPECTATIONS)) {
      expect(
        doc[field],
        `Intuit's discovery document now says ${field} = ${String(doc[field])}, but ` +
          `lib/quickbooks/config.ts hardcodes ${expected}. This is the drift F6 was ` +
          `written to catch — update the constant, do not weaken this test.`
      ).toBe(expected);
    }
  });
});
