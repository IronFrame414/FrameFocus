import { describe, it, expect, afterEach } from 'vitest';
import { admin, assertRebuildTest } from './live-session';
import { assertSandbox, SANDBOX_COMPANY_ID, SANDBOX_REALM } from './qb-sandbox-gate';

// ============================================================================
// S124 — the sandbox gate, proved in both directions.
//
// Case 1 is the EARLY check Josh asked for: is rebuild-test's sandbox
// connection still alive (last used 2026-09-09)? If it is not, Part 3 cannot be
// proved anywhere, because stop rule 3 forbids real books.
//
// Cases 2 and 3 are the controls that MUST fire: a gate that cannot refuse is a
// probe that cannot fail. Both refuse BEFORE any network call.
// ============================================================================

const savedEnv = process.env.QBO_ENVIRONMENT;
afterEach(() => {
  if (savedEnv === undefined) delete process.env.QBO_ENVIRONMENT;
  else process.env.QBO_ENVIRONMENT = savedEnv;
});

describe('S124 sandbox gate', () => {
  it('passes on rebuild-test Sabal Point: sandbox host 200 "Sandbox Company…", production host refuses', async () => {
    assertRebuildTest();
    const proof = await assertSandbox(admin, SANDBOX_COMPANY_ID);
    console.log(
      `[s124-gate] realm ${proof.conn.realmId} company '${proof.companyName}' ` +
        `sandbox ${proof.sandboxStatus} production ${proof.productionStatus}`
    );
    expect(proof.conn.realmId).toBe(SANDBOX_REALM);
    expect(proof.sandboxStatus).toBe(200);
    expect(proof.productionStatus).not.toBe(200);
  });

  it('REFUSES when the environment says production (no network call)', async () => {
    process.env.QBO_ENVIRONMENT = 'production';
    await expect(assertSandbox(admin, SANDBOX_COMPANY_ID)).rejects.toThrow(
      "[qb-sandbox-gate] REFUSED: qboEnvironment() is 'production', not 'sandbox'."
    );
  });

  it('REFUSES a company whose realm is not the sandbox realm', async () => {
    // A random uuid: no such company, so the read itself refuses. That is the
    // only realm-mismatch fixture available without writing a company row.
    await expect(assertSandbox(admin, '00000000-0000-4000-8000-000000000124')).rejects.toThrow(
      '[qb-sandbox-gate] REFUSED: company 00000000-0000-4000-8000-000000000124 not readable'
    );
  });
});
