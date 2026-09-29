import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock('@/lib/notify/notify', () => ({ notify: vi.fn(async () => ({ written: 0 })) }));

import {
  ANON_EXECUTE_ALLOWLIST,
  compareAnonExposure,
  runSchemaDrift,
  type AnonExposureRow,
} from '@/lib/services/schema-drift';
import baseline from '@/lib/schema-fingerprint-baseline.json';

// S112 — the anon EXECUTE guard in the schema-drift cron. The live proof is
// s112-anon-execute-guard.live.ts; this pins the comparison and the wiring.

const row = (signature: string, extra: Partial<AnonExposureRow> = {}): AnonExposureRow => ({
  signature,
  owner: 'postgres',
  security_definer: true,
  extension: null,
  ...extra,
});
const ALLOWED = ANON_EXECUTE_ALLOWLIST.map((s) => row(s));

/** A fake admin client: each RPC name answers from the map. */
function fakeAdmin(rpcs: Record<string, { data: unknown; error: { message: string } | null }>) {
  return {
    rpc: vi.fn(
      async (name: string) => rpcs[name] ?? { data: null, error: { message: 'no such rpc' } }
    ),
  } as never;
}
const cleanPrint = { data: baseline, error: null };

describe('S112 anon guard — compareAnonExposure', () => {
  it('the allowlist is exactly the three measured logged-out functions', () => {
    expect(ANON_EXECUTE_ALLOWLIST).toHaveLength(3);
    expect(ANON_EXECUTE_ALLOWLIST.map((s) => s.split('(')[0]).sort()).toEqual([
      'get_invitation_by_token',
      'get_invitation_status',
      'submit_sub_bid_reply',
    ]);
  });

  it('the three allowlisted signatures report nothing', () => {
    expect(compareAnonExposure(ALLOWED)).toEqual([]);
  });

  it('CONTROL: any other function fires, named with owner and SECURITY DEFINER', () => {
    const v = compareAnonExposure([
      ...ALLOWED,
      row('allocate_invoice_number(p_company_id uuid)', { owner: 'supabase_admin' }),
    ]);
    expect(v).toEqual([
      'allocate_invoice_number(p_company_id uuid) [owner supabase_admin, SECURITY DEFINER]',
    ]);
  });

  it('CONTROL: an overload of an allowlisted NAME still fires (signatures, not names)', () => {
    expect(compareAnonExposure([row('submit_sub_bid_reply(p_token text)')])).toHaveLength(1);
  });

  it('an extension function is flagged and says which extension', () => {
    const v = compareAnonExposure([
      row('vector_dims(vector)', { security_definer: false, extension: 'vector' }),
    ]);
    expect(v).toEqual(['vector_dims(vector) [owner postgres, extension vector]']);
  });
});

describe('S112 anon guard — wired into runSchemaDrift', () => {
  it('clean: allowlist only + matching fingerprint → ok, 3 counted', async () => {
    const out = await runSchemaDrift(
      fakeAdmin({
        anon_execute_exposure: { data: ALLOWED, error: null },
        schema_fingerprint: cleanPrint,
      })
    );
    expect(out.anonExecutable).toBe(3);
    expect(out.anonViolations).toEqual([]);
    expect(out.drift).toEqual([]);
    expect(out.ok).toBe(true);
  });

  it('CONTROL: a violation fails the run even when the fingerprint matches', async () => {
    const out = await runSchemaDrift(
      fakeAdmin({
        anon_execute_exposure: { data: [...ALLOWED, row('seed_default_tags(uuid)')], error: null },
        schema_fingerprint: cleanPrint,
      })
    );
    expect(out.ok).toBe(false);
    expect(out.drift).toEqual([]);
    expect(out.anonViolations).toHaveLength(1);
  });

  it('a violation is still reported when the fingerprint RPC fails', async () => {
    const out = await runSchemaDrift(
      fakeAdmin({
        anon_execute_exposure: { data: [row('x()')], error: null },
        schema_fingerprint: { data: null, error: { message: 'boom' } },
      })
    );
    expect(out.ok).toBe(false);
    expect(out.anonViolations).toHaveLength(1);
    expect(out.errors.join()).toContain('schema_fingerprint() failed');
  });

  it('a missing guard RPC is an ERROR, never a silent pass', async () => {
    const out = await runSchemaDrift(fakeAdmin({ schema_fingerprint: cleanPrint }));
    expect(out.ok).toBe(false);
    expect(out.errors.join()).toContain('anon_execute_exposure() failed');
  });
});
