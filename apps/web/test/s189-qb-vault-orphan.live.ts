import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { admin, assertRebuildTest } from './live-session';
import { forgetTokenBlob, getTokenBlob, putTokenBlob } from '@/lib/quickbooks/tokens';
import type { QboTokenBlob } from '@/lib/quickbooks/tokens';

// ============================================================================
// S189 — a disconnect whose Vault delete fails must not strand the tenant.
//
// Migration: 20261490000000_qb_vault_orphan_recovery.sql (M-P)
// Finding:   S188 §4a, raised by this session and fixed here.
//
// ⚠️ THE DEFECT. `/api/quickbooks/disconnect` deletes the Vault secret and then
// nulls `companies.qb_token_secret_id`. The delete is best-effort and the
// column is nulled regardless, because a tenant must always be able to
// disconnect. So a delete that fails leaves the secret alive with nothing
// pointing at it — and `vault.secrets` has a UNIQUE index on `name`, while
// this connector's names are deterministic (`qb_tokens_<company_id>`).
//
// Every later reconnect then called `create_secret` with that same name, got
// 23505, and returned `qb_error=vault_failed`. **Permanently.** Retrying is the
// one thing that cannot work, because the collision is deterministic.
//
// ----------------------------------------------------------------------------
// ⚠️ HOW THE FAILURE IS FORCED, AND WHY THIS SHAPE
// ----------------------------------------------------------------------------
// The DELETE is stubbed at the RPC boundary — and ONLY the delete. Everything
// else in these cases is real: the real `qb_vault_scrub` runs against the real
// Vault, the real `forgetTokenBlob` takes its real error branch, and the
// resulting orphan is a real row. What is simulated is one thing, the thing
// that cannot be provoked on demand.
//
// The alternative — seeding a row that LOOKS like an orphan — would have
// proved the recovery works on a fixture of my own construction while skipping
// the code that produces the state in the first place. That is the shape S188
// spent a session removing from this suite.
//
// ⚠️ NOTHING HERE TOUCHES A REAL TENANT. `qb_vault_put` uses the company id for
// NOTHING but the secret's name — no lookup, no foreign key — so a scratch uuid
// exercises the identical path and cannot collide with, overwrite, or adopt any
// company's live token. (s148-Q4 learned this the hard way at S188: pointed at
// a real company, that probe collided with a genuine stored credential, and had
// the name index not been unique it would have OVERWRITTEN it.)
// ============================================================================

/** A scratch tenant id. Never a real company — see the header. */
const SCRATCH = randomUUID();

/**
 * Case 6 needs a REAL company row, because the guard it tests reads
 * `companies.qb_token_secret_id`. Ridgeline is the disconnected QA tenant and
 * holds no secret of its own; its pointer is snapshotted and restored.
 */
const OTHER_COMPANY = 'f079a1f4-12db-4bc8-ae95-2d647d688260';

/** The id every case works with, so `afterAll` can always reach it. */
let liveSecretId: string | null = null;

function blob(marker: string): QboTokenBlob {
  return {
    access_token: `S189-at-${marker}`,
    refresh_token: `S189-rt-${marker}`,
    access_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    refresh_issued_at: new Date().toISOString(),
  } as QboTokenBlob;
}

/**
 * The service-role client with ONE verb broken: `qb_vault_forget` always
 * errors. Every other RPC — `qb_vault_scrub` included — passes straight
 * through to the real database.
 */
function adminWithFailingDelete(): SupabaseClient {
  return new Proxy(admin, {
    get(target, prop, receiver) {
      if (prop !== 'rpc') return Reflect.get(target, prop, receiver);
      return (fn: string, args: Record<string, unknown>) => {
        if (fn === 'qb_vault_forget') {
          return Promise.resolve({
            data: null,
            error: { message: 'simulated Vault delete failure (S189)' },
          });
        }
        return target.rpc(fn as never, args as never);
      };
    },
  }) as SupabaseClient;
}

describe('S189 — an orphaned Vault secret can neither lock a tenant out nor keep a credential', () => {
  beforeAll(() => {
    assertRebuildTest();
  });

  afterAll(async () => {
    // Whatever state a case left, the secret goes. Uses the RPC directly rather
    // than `forgetTokenBlob` so a failure in the code under test cannot leave
    // debris behind.
    if (liveSecretId) await admin.rpc('qb_vault_forget', { p_secret_id: liveSecretId });
  });

  it('1 — the ORDINARY cycle is unchanged: store, read back, delete, gone', async () => {
    const id = await putTokenBlob(admin, SCRATCH, blob('normal'), null);
    liveSecretId = id;

    const back = await getTokenBlob(admin, id);
    expect(back?.access_token).toBe('S189-at-normal');

    await forgetTokenBlob(admin, id);

    // ⚠️ GONE MEANS GONE. `qb_vault_get` returns null for an id with no row, so
    // this distinguishes "deleted" from "scrubbed but still there".
    expect(await getTokenBlob(admin, id)).toBeNull();
    liveSecretId = null;
  });

  it('2 — a reconnect after a CLEAN disconnect still creates fresh', async () => {
    const id = await putTokenBlob(admin, SCRATCH, blob('again'), null);
    liveSecretId = id;
    expect((await getTokenBlob(admin, id))?.refresh_token).toBe('S189-rt-again');
    await forgetTokenBlob(admin, id);
    expect(await getTokenBlob(admin, id)).toBeNull();
    liveSecretId = null;
  });

  it('3 — ⚠️ WHEN THE DELETE FAILS, THE ROW SURVIVES BUT THE CREDENTIAL DOES NOT', async () => {
    const id = await putTokenBlob(admin, SCRATCH, blob('doomed'), null);
    liveSecretId = id;

    // The disconnect route calls this and treats a throw as non-fatal.
    await expect(forgetTokenBlob(adminWithFailingDelete(), id)).rejects.toThrow(
      /Vault delete failed/
    );

    // The row is still there — that is the orphan, faithfully produced.
    const survivor = await admin.rpc('qb_vault_get', { p_secret_id: id });
    expect(survivor.data, 'the delete was supposed to fail, so the row must remain').not.toBeNull();

    // ⚠️ AND THIS IS THE PROPERTY THAT MATTERS. The scrub ran in its OWN
    // statement and committed before the delete was attempted, so what
    // survived holds a tombstone rather than a working refresh token. Had the
    // two shared a transaction, the failed DELETE would have rolled the scrub
    // back and this would read `S189-rt-doomed`.
    expect(survivor.data).toBe('{"scrubbed":true}');
    expect(survivor.data as string).not.toContain('S189-rt-doomed');
    expect(survivor.data as string).not.toContain('S189-at-doomed');
  });

  it('4 — ⚠️ AND THE TENANT CAN STILL RECONNECT — no 23505, the orphan is ADOPTED', async () => {
    // Exactly what `/api/quickbooks/callback` does after a disconnect: the
    // company row's pointer is gone, so it passes null and asks for a secret.
    // Before M-P this raised
    //   duplicate key value violates unique constraint "secrets_name_idx"
    // and the Owner saw `qb_error=vault_failed`, forever.
    const orphanId = liveSecretId!;
    const adopted = await putTokenBlob(admin, SCRATCH, blob('reconnected'), null);

    // ⚠️ THE SAME ROW, NOT A SECOND ONE. If this had created rather than
    // adopted, the id would differ — and it could not have, because the name
    // is taken. Equality here is what proves adoption rather than luck.
    expect(adopted, 'a new secret was created — the orphan was not adopted').toBe(orphanId);

    const back = await getTokenBlob(admin, adopted);
    expect(back?.refresh_token, 'the adopted secret still holds the tombstone').toBe(
      'S189-rt-reconnected'
    );
    expect(back?.access_token).toBe('S189-at-reconnected');
  });

  it('6 — ⚠️ A SECRET A COMPANY STILL POINTS AT IS REFUSED, NOT ADOPTED', async () => {
    // ⚠️ THIS CASE EXISTS BECAUSE THE FIRST VERSION OF M-P DESTROYED A LIVE
    // CREDENTIAL. Adoption without this guard is indistinguishable from
    // "overwrite whatever is under that name", and `s149-E` — which called
    // `qb_vault_put` with no secret id against the genuinely connected fixture
    // company — promptly did exactly that, then deleted the row in its own
    // cleanup. Before M-P the 23505 had been an accidental guardrail.
    //
    // An orphan is DEFINED by nothing pointing at it. A referenced secret is a
    // working connection, and the two must not share a code path.
    const { data: co } = await admin
      .from('companies').select('id, qb_token_secret_id')
      .eq('id', OTHER_COMPANY).single();
    const priorPointer = (co as { qb_token_secret_id: string | null }).qb_token_secret_id;

    const secretId = await putTokenBlob(admin, OTHER_COMPANY, blob('referenced'), null);
    try {
      // Point the company at it — now it is in use, not abandoned.
      const { error: pointError } = await admin
        .from('companies').update({ qb_token_secret_id: secretId }).eq('id', OTHER_COMPANY);
      expect(pointError, 'could not point the company at its secret').toBeNull();

      // The same call the orphan path makes. It must NOT succeed here.
      await expect(
        putTokenBlob(admin, OTHER_COMPANY, blob('clobber'), null)
      ).rejects.toThrow(/still points at this secret|in use, not/i);

      // ⚠️ AND THE CREDENTIAL IS UNTOUCHED — a refusal that still overwrote
      // would be worse than no refusal, because it would look safe.
      const back = await getTokenBlob(admin, secretId);
      expect(back?.refresh_token).toBe('S189-rt-referenced');
    } finally {
      await admin
        .from('companies').update({ qb_token_secret_id: priorPointer }).eq('id', OTHER_COMPANY);
      await admin.rpc('qb_vault_forget', { p_secret_id: secretId });
    }
  });

  it('5 — the recovered connection disconnects cleanly, leaving nothing behind', async () => {
    // The end of the story: having been adopted, the secret is an ordinary
    // live credential again and the ordinary path removes it.
    await forgetTokenBlob(admin, liveSecretId!);
    expect(await getTokenBlob(admin, liveSecretId!)).toBeNull();
    liveSecretId = null;
  });
});
