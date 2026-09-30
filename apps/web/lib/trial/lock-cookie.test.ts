/**
 * S120 3-B — the "not locked" cookie can only ever SKIP a check; it can never
 * lock anyone, and it cannot be forged, moved to another user, or stretched.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCK_OK_TTL_S, resetLockKeyForTests, signLockOk, verifyLockOk } from './lock-cookie';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = 1_800_000_000;
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 's120-unit-secret';
  resetLockKeyForTests();
});
afterEach(() => {
  if (saved === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  resetLockKeyForTests();
});

describe('S120 3-B — lock-ok cookie', () => {
  it('a value minted for a user verifies for THAT user, inside the TTL', async () => {
    const v = await signLockOk(ME, NOW);
    expect(v).not.toBeNull();
    expect(await verifyLockOk(v!, ME, NOW)).toBe(true);
    expect(await verifyLockOk(v!, ME, NOW + LOCK_OK_TTL_S - 1)).toBe(true);
  });

  it('⚠️ it does NOT verify for another user (cannot be carried to another login)', async () => {
    const v = await signLockOk(ME, NOW);
    expect(await verifyLockOk(v!, OTHER, NOW)).toBe(false);
    const moved = v!.replace(ME, OTHER);
    expect(await verifyLockOk(moved, OTHER, NOW)).toBe(false);
  });

  it(`⚠️ it expires at ${LOCK_OK_TTL_S}s — the window a newly locked tenant can still work`, async () => {
    const v = await signLockOk(ME, NOW);
    expect(await verifyLockOk(v!, ME, NOW + LOCK_OK_TTL_S)).toBe(false);
  });

  it('⚠️ a forged LONGER expiry fails (the expiry is inside the MAC, and capped)', async () => {
    const v = await signLockOk(ME, NOW);
    const [uid, , sig] = v!.split('.');
    expect(await verifyLockOk(`${uid}.${NOW + 86_400}.${sig}`, ME, NOW)).toBe(false);
    expect(await verifyLockOk(`${uid}.${NOW + 5}.${sig}`, ME, NOW)).toBe(false);
  });

  it('a value signed with another secret does not verify', async () => {
    const v = await signLockOk(ME, NOW);
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'a-different-secret';
    resetLockKeyForTests();
    expect(await verifyLockOk(v!, ME, NOW)).toBe(false);
  });

  it('garbage, empty and absent values verify false — the RPC then runs as before', async () => {
    for (const bad of [
      undefined,
      '',
      'x',
      `${ME}.nope.sig`,
      `${ME}.${NOW + 10}`,
      '...',
      `${ME}.${NOW + 10}.%%%`,
    ]) {
      expect(await verifyLockOk(bad, ME, NOW)).toBe(false);
    }
  });

  it('⚠️ with NO secret the cache is simply off: nothing minted, nothing verifies', async () => {
    const v = await signLockOk(ME, NOW);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetLockKeyForTests();
    expect(await signLockOk(ME, NOW)).toBeNull();
    expect(await verifyLockOk(v!, ME, NOW)).toBe(false);
  });
});
