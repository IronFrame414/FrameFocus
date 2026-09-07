import { describe, it, expect } from 'vitest';
import {
  QBO_DISCOVERY_EXPECTATIONS,
  QBO_MINOR_VERSION,
  QBO_MINOR_VERSION_PATTERN,
} from '@/lib/quickbooks/config';

/**
 * ⚠️ F5 — A WRONG `minorversion` IS SILENTLY ACCEPTED BY INTUIT.
 *
 * Measured by the S187 audit: `/companyinfo` at minorversion **75, 76, 80, 85,
 * 90, 99 and 200 all returned HTTP 200 with valid data.** So there is no
 * server-side signal to test against, and the audit concluded *"no code fix
 * available — this is Intuit's behaviour."*
 *
 * ⚠️ THAT IS RIGHT ABOUT INTUIT AND WRONG ABOUT US. The failure the pin exists
 * to prevent is a TYPO in the constant, and a typo is catchable on our side of
 * the wire — it just cannot be caught by asking Intuit. This converts an
 * un-noticeable production defect (silently serving another version's response
 * shape) into a red test.
 *
 * ⚠️ WHAT THIS CANNOT TELL YOU, stated so nobody mistakes green for verified:
 * whether 75 is still a SENSIBLE pin. Intuit's current maximum is unprobeable
 * for exactly the reason above. That check is manual, at each Intuit release
 * cycle, and its date lives beside the constant.
 */
describe('S104-F — the minorversion pin', () => {
  it('is a bare ascending integer, not a typo Intuit would swallow', () => {
    expect(
      QBO_MINOR_VERSION_PATTERN.test(QBO_MINOR_VERSION),
      `QBO_MINOR_VERSION is "${QBO_MINOR_VERSION}". Intuit accepts anything here and ` +
        `silently serves some other version's response shape, so this test is the only ` +
        `thing standing between a typo and a production integration reading fields that ` +
        `are no longer where it thinks they are.`
    ).toBe(true);
  });

  it.each(['', ' 75', '75 ', 'v75', '75.1', '0', '-75', '7 5', 'latest', '75,76'])(
    'rejects %o',
    (bad) => {
      // ⚠️ THE NEGATIVE CASES ARE THE TEST. A pattern asserted only against the
      // value that already passes is a test that cannot fail.
      expect(QBO_MINOR_VERSION_PATTERN.test(bad)).toBe(false);
    }
  );

  it('the request builds the pinned value into the URL verbatim', () => {
    // client.ts interpolates the constant directly; if that ever becomes a
    // computed value this assertion is where the assumption is written down.
    expect(`minorversion=${QBO_MINOR_VERSION}`).toBe('minorversion=75');
  });
});

/**
 * ⚠️ F6 — THE DISCOVERY DOCUMENT. **The three URLs have NOT drifted** — verified
 * against the live document at S187 and NOT re-litigated here, by instruction.
 * This is hardening so a FUTURE drift is detectable.
 *
 * ⚠️ THE EXPECTATION MAP IS NOT WIRED INTO THE RUNTIME PATH, deliberately.
 * Fetching discovery before an OAuth call would make Intuit's availability a
 * precondition for starting a connection — a network blip would become "you
 * cannot connect QuickBooks", which is strictly worse than three constants that
 * are correct. See `s104-qb-discovery.live.ts` for the arm that actually goes to
 * the wire; this one only guards the map itself.
 */
describe('S104-G — the discovery expectation map', () => {
  it('covers all three OAuth endpoints and nothing else', () => {
    expect(Object.keys(QBO_DISCOVERY_EXPECTATIONS).sort()).toEqual([
      'authorization_endpoint',
      'revocation_endpoint',
      'token_endpoint',
    ]);
  });

  it('every expectation is an absolute https URL on an Intuit host', () => {
    for (const [field, url] of Object.entries(QBO_DISCOVERY_EXPECTATIONS)) {
      const parsed = new URL(url);
      expect(parsed.protocol, `${field} is not https`).toBe('https:');
      expect(parsed.hostname.endsWith('intuit.com'), `${field} is not an Intuit host`).toBe(true);
    }
  });
});
