import { describe, it, expect, vi } from 'vitest';
import {
  KNOWN_REFS,
  REQUIRED_PROJECT_REF,
  describeRef,
  refFromKey,
  refFromUrl,
  verifyLiveTarget,
  type Probe,
} from './live-guard';

/**
 * The production guard, branch by branch.
 *
 * ⚠️ THIS FILE IS THE REASON THE GUARD CAN BE TRUSTED. The live harnesses it
 * protects cannot run in CI — they need real credentials, by design — so the
 * guard's own behaviour would otherwise be verified by nothing at all. Here the
 * network is injected, so every arm including "the key IS production" is
 * executed on every push, offline, with no credential in sight.
 *
 * The one thing a test cannot establish is that the REAL probe reaches the real
 * project. That is proven by sabotage against the live endpoint and recorded in
 * the session report; `httpProbe` is deliberately the only untested line.
 */

const PROD_REF = 'jwkcknyuyvcwcdeskrmz';

/** A legacy Supabase key is a JWT whose payload carries a `ref` claim. */
function legacyKeyFor(ref: string, role = 'service_role'): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ref, role })}.sig-not-verified-here`;
}

/**
 * ⚠️ ASSEMBLED AT RUNTIME, NOT WRITTEN AS A LITERAL. A modern Supabase secret
 * key is `sb_secret_` plus 31 opaque characters, and a literal of that shape —
 * even an obviously fake all-zeroes one — trips GitHub's push protection and
 * blocks the whole branch. Found the hard way on the first push of this file.
 * Do not "fix" that by allowlisting the secret; keep the shape out of the source.
 */
const OPAQUE = ['sb', 'secret', 'z'.repeat(31)].join('_');
const REBUILD_URL = `https://${REQUIRED_PROJECT_REF}.supabase.co`;

/** A probe that must never be called; calling it fails the test. */
const forbiddenProbe: Probe = async (ref) => {
  throw new Error(`probe must not have been called, but was called for ${ref}`);
};

/** Accepts the given refs with 200, rejects everything else with 401. */
const probeAccepting = (...accept: string[]) =>
  vi.fn<Probe>(async (ref) => ({ status: accept.includes(ref) ? 200 : 401 }));

const ok = { url: REBUILD_URL, anon: legacyKeyFor(REQUIRED_PROJECT_REF, 'anon') };

describe('refFromUrl', () => {
  it('extracts the project ref from a Supabase URL', () => {
    expect(refFromUrl(REBUILD_URL)).toBe(REQUIRED_PROJECT_REF);
    expect(refFromUrl(`https://${PROD_REF}.supabase.co/`)).toBe(PROD_REF);
  });

  it('returns null for a non-Supabase host, rather than a wrong ref', () => {
    expect(refFromUrl('https://example.com')).toBeNull();
    expect(refFromUrl('http://localhost:54321')).toBeNull();
    expect(refFromUrl(undefined)).toBeNull();
    expect(refFromUrl('not a url')).toBeNull();
  });

  // ⚠️ The old guard used `URL_.includes(REF)`, which this would have fooled.
  it('is not fooled by the required ref appearing elsewhere in the URL', () => {
    expect(refFromUrl(`https://${PROD_REF}.supabase.co/x/${REQUIRED_PROJECT_REF}`)).toBe(PROD_REF);
  });
});

describe('refFromKey', () => {
  it('decodes the ref claim from a legacy JWT key', () => {
    expect(refFromKey(legacyKeyFor(PROD_REF))).toBe(PROD_REF);
    expect(refFromKey(legacyKeyFor(REQUIRED_PROJECT_REF, 'anon'))).toBe(REQUIRED_PROJECT_REF);
  });

  // Null means "undecidable offline", NOT "fine" — the caller must probe.
  it('returns null for an opaque sb_secret_ key, which encodes nothing', () => {
    expect(refFromKey(OPAQUE)).toBeNull();
    expect(refFromKey('sb_publishable_abc')).toBeNull();
    expect(refFromKey(undefined)).toBeNull();
    expect(refFromKey('eyJ-not-a-jwt')).toBeNull();
  });
});

describe('verifyLiveTarget — presence', () => {
  it('names every missing variable individually', async () => {
    await expect(verifyLiveTarget({}, forbiddenProbe)).rejects.toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  it('names only the one that is missing', async () => {
    const err = await verifyLiveTarget({ ...ok, service: undefined }, forbiddenProbe).catch(
      (e: Error) => e.message
    );
    expect(err).toMatch(/Missing credentials: SUPABASE_SERVICE_ROLE_KEY\./);
    expect(err).not.toMatch(/NEXT_PUBLIC_SUPABASE_URL,/);
  });

  it('points at rebuild-test for the restore, never production', async () => {
    const err = await verifyLiveTarget({}, forbiddenProbe).catch((e: Error) => e.message);
    expect(err).toMatch(/REBUILD-TEST ONLY/);
    expect(err).not.toContain(PROD_REF);
  });
});

describe('verifyLiveTarget — the URL', () => {
  it('refuses a production URL and says so by name', async () => {
    const err = await verifyLiveTarget(
      { url: `https://${PROD_REF}.supabase.co`, anon: OPAQUE, service: OPAQUE },
      forbiddenProbe
    ).catch((e: Error) => e.message);
    expect(err).toMatch(/does not point at rebuild-test/);
    expect(err).toContain(PROD_REF);
    expect(err).toMatch(/Josh's real books/);
  });
});

describe('verifyLiveTarget — the KEY (the hole this fix closes)', () => {
  // ⚠️ THE CENTRAL CASE. This exact pairing passed the old guard.
  it('refuses a PRODUCTION legacy service key paired with a rebuild-test URL', async () => {
    const err = await verifyLiveTarget(
      { ...ok, service: legacyKeyFor(PROD_REF) },
      forbiddenProbe // and does it offline — the ref is in the key
    ).catch((e: Error) => e.message);
    expect(err).toMatch(/SUPABASE_SERVICE_ROLE_KEY BELONGS TO A DIFFERENT PROJECT/);
    expect(err).toContain(PROD_REF);
    expect(err).toMatch(/Josh's real books/);
  });

  it('refuses a production ANON key too', async () => {
    const err = await verifyLiveTarget(
      { url: REBUILD_URL, anon: legacyKeyFor(PROD_REF, 'anon'), service: OPAQUE },
      forbiddenProbe
    ).catch((e: Error) => e.message);
    expect(err).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY BELONGS TO A DIFFERENT PROJECT/);
    expect(err).toContain(PROD_REF);
  });

  it('accepts a rebuild-test legacy key without touching the network', async () => {
    const v = await verifyLiveTarget(
      { ...ok, service: legacyKeyFor(REQUIRED_PROJECT_REF) },
      forbiddenProbe
    );
    expect(v.ref).toBe(REQUIRED_PROJECT_REF);
    expect(v.how).toMatch(/decoded/);
  });
});

describe('verifyLiveTarget — opaque keys, which must be proven over the network', () => {
  it('accepts an opaque key that rebuild-test recognises', async () => {
    const probe = probeAccepting(REQUIRED_PROJECT_REF);
    const v = await verifyLiveTarget({ ...ok, service: OPAQUE }, probe);
    expect(v.ref).toBe(REQUIRED_PROJECT_REF);
    expect(v.how).toMatch(/authenticated read/);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(REQUIRED_PROJECT_REF, OPAQUE);
  });

  // ⚠️ THE MESSAGE THAT MATTERS. "not rebuild-test" leaves someone guessing,
  // and the guess that matters is whether they are holding a production key.
  it('names PRODUCTION when the opaque key turns out to be production\'s', async () => {
    const probe = probeAccepting(PROD_REF);
    const err = await verifyLiveTarget({ ...ok, service: OPAQUE }, probe).catch(
      (e: Error) => e.message
    );
    expect(err).toMatch(/IS A KEY FOR/);
    expect(err).toContain(PROD_REF);
    expect(err).toMatch(/PRODUCTION/);
    expect(err).toMatch(/Do NOT "fix" this by changing/);
    expect(probe).toHaveBeenCalledTimes(2); // asked rebuild-test, then named the other
  });

  it('says the key matches no known project when it is revoked or third-party', async () => {
    const probe = probeAccepting(); // nothing accepts it
    const err = await verifyLiveTarget({ ...ok, service: OPAQUE }, probe).catch(
      (e: Error) => e.message
    );
    expect(err).toMatch(/REJECTED by rebuild-test/);
    expect(err).toMatch(/none of the projects this repo knows by name/);
    expect(err).toMatch(/revoked or issued for a third project/);
  });

  it('fails CLOSED when the network is unreachable', async () => {
    const probe = vi.fn<Probe>(async () => ({ status: 0, transportError: 'getaddrinfo ENOTFOUND' }));
    const err = await verifyLiveTarget({ ...ok, service: OPAQUE }, probe).catch(
      (e: Error) => e.message
    );
    expect(err).toMatch(/Could not verify/);
    expect(err).toMatch(/fails CLOSED/);
    expect(err).toMatch(/ENOTFOUND/);
  });
});

describe('every failure is loud, and none of them leak the key', () => {
  const cases: [string, Parameters<typeof verifyLiveTarget>[0], Probe][] = [
    ['missing', {}, forbiddenProbe],
    ['wrong url', { url: `https://${PROD_REF}.supabase.co`, anon: OPAQUE, service: OPAQUE }, forbiddenProbe],
    ['prod legacy key', { ...ok, service: legacyKeyFor(PROD_REF) }, forbiddenProbe],
    ['prod opaque key', { ...ok, service: OPAQUE }, probeAccepting(PROD_REF)],
    ['unknown key', { ...ok, service: OPAQUE }, probeAccepting()],
  ];

  for (const [name, env, probe] of cases) {
    it(`${name}: throws, banners, and never prints the key`, async () => {
      const err = await verifyLiveTarget(env, probe).catch((e: Error) => e.message);
      expect(err).toMatch(/REFUSING TO RUN THE LIVE HARNESSES/);
      expect(err).toMatch(/bypasses RLS/);
      expect(err).toContain(REQUIRED_PROJECT_REF); // always says what it wanted
      // ⚠️ A guard that prints the credential it rejected has traded one
      // incident for another. Tokens are credentials even when they are wrong.
      expect(err).not.toContain(OPAQUE);
      expect(err).not.toContain(legacyKeyFor(PROD_REF));
    });
  }
});

describe('describeRef', () => {
  it('names both projects this repo knows', () => {
    expect(describeRef(REQUIRED_PROJECT_REF)).toMatch(/rebuild-test/);
    expect(describeRef(PROD_REF)).toMatch(/PRODUCTION/);
    expect(Object.keys(KNOWN_REFS)).toEqual([REQUIRED_PROJECT_REF, PROD_REF]);
  });

  it('is honest about a ref it does not know', () => {
    expect(describeRef('zzzzzzzzzzzzzzzzzzzz')).toMatch(/no name for/);
  });
});
