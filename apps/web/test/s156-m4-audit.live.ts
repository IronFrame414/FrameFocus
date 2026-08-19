/**
 * S156 — Module 4 (Sales & Estimating) audit probes. Pass 4 of 11.
 *
 * ⚠️ ASSERTS DEFECTS THAT ARE STILL OPEN, each naming what a fix looks like so
 * it is INVERTED rather than deleted when Josh rules.
 *
 * ⚠️ `signing_sessions` holds ZERO rows on rebuild-test, so every probe against
 * it would pass vacuously. This file CREATES its own sessions and sweeps them.
 *
 * No application code, service or schema is changed by this pass.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { getActiveSessionByToken } from '@/lib/services/signing-service';
import { updateEstimate } from '@/lib/services/estimates-client';

const MARKER = 'S156M4';
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

let owner: SupabaseClient;
let crew: SupabaseClient;
let companyId: string;
let estimateId: string;
/** The one estimate in `draft` — the only status `updateEstimate()` will write. */
let draftEstimateId = '';

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function sweep(): Promise<void> {
  const r = await admin.from('signing_sessions').delete().like('recipient_name', `${MARKER}%`);
  if (r.error) throw new Error(`sweep sessions: ${r.error.message}`);
}

/** A pending session on the fixture estimate, expiring in `days`. */
async function makeSession(days: number, status = 'pending'): Promise<{ id: string; token: string }> {
  const token = crypto.randomUUID();
  const { data, error } = await admin
    .from('signing_sessions')
    .insert({
      company_id: companyId, estimate_id: estimateId, token, status,
      recipient_email: `${MARKER.toLowerCase()}@example.invalid`,
      recipient_name: `${MARKER} Signer`,
      expires_at: new Date(Date.now() + days * 86400000).toISOString(),
    })
    .select('id').single();
  must('session', error);
  return { id: data!.id, token };
}

beforeAll(async () => {
  assertRebuildTest();
  [owner, crew] = await Promise.all([sessionFor(OWNER), sessionFor(CREW)]);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  // ORDERED — heap order is the class this repo has hit five times.
  const { data: est } = await admin
    .from('estimates').select('id').eq('is_deleted', false)
    .order('created_at', { ascending: true }).order('id', { ascending: true })
    .limit(1).maybeSingle();
  if (!est) throw new Error('No estimate on rebuild-test — seed one before running this harness.');
  estimateId = est.id;

  const { data: draft } = await admin
    .from('estimates').select('id').eq('is_deleted', false).eq('status', 'draft')
    .order('created_at', { ascending: true }).order('id', { ascending: true })
    .limit(1).maybeSingle();
  draftEstimateId = draft?.id ?? '';

  await sweep();
}, 240_000);

afterAll(async () => { await sweep(); }, 240_000);

// ============================================================================
// M4-01 — the §3.2 defect S150 fixed in `send` is still live in `resend`.
// ============================================================================

describe('S156-F1 — a bare sendEmail after a session is minted', () => {
  it('F1a — `proposals/send` wraps sendEmail in try/catch; `proposals/resend` does NOT', async () => {
    // A SOURCE-SHAPE assertion, deliberately. The defect only fires when
    // RESEND_API_KEY is unset, which cannot be arranged against a running route
    // from here — so this pins the structural difference that IS the defect,
    // and F1b proves the mechanism separately.
    //
    // ⚠️ ASSERTS THE DEFECT. When resend is wrapped, invert the second half.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const read = (p: string) =>
      readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

    const send = read('../app/api/proposals/send/route.ts');
    const resend = read('../app/api/proposals/resend/route.ts');

    // `send` was fixed at S150: the call sits inside a try block.
    expect(
      /try \{[\s\S]{0,400}await sendEmail\(/.test(send),
      'proposals/send lost its try/catch — the S150 fix has regressed'
    ).toBe(true);

    // `resend` still calls it bare.
    expect(
      /try \{[\s\S]{0,400}await sendEmail\(/.test(resend),
      'proposals/resend now wraps sendEmail — M4-01 may be fixed; if so, invert this'
    ).toBe(false);

    // And it mints a session BEFORE sending, which is what makes it matter.
    const mintIdx = resend.indexOf('createSigningSession');
    const sendIdx = resend.indexOf('await sendEmail(');
    expect(mintIdx, 'resend no longer creates a session').toBeGreaterThan(-1);
    expect(
      mintIdx < sendIdx,
      'the session is no longer created before the send — re-scope M4-01'
    ).toBe(true);
  });

  it('F1b — a session created and never invalidated stays USABLE, which is the consequence', async () => {
    // The mechanism, proven against the database rather than inferred: a session
    // that was minted and whose send then threw is left `pending` and unexpired,
    // and `getActiveSessionByToken()` — the function every /sign route trusts —
    // hands it straight back.
    const s = await makeSession(14);

    const active = await getActiveSessionByToken(admin, s.token);
    expect(
      active,
      'a pending, unexpired session is not returned — re-scope M4-01'
    ).not.toBeNull();
    expect(active!.id).toBe(s.id);
  });

  it('F1c — and `resend` invalidates the PREVIOUS sessions before minting the new one', async () => {
    // Which makes the failure worse than "an email did not send": the client's
    // existing link is already dead by the time the throw happens, so the estimate
    // is left with no working link AND an undelivered live token.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const resend = readFileSync(
      fileURLToPath(new URL('../app/api/proposals/resend/route.ts', import.meta.url)), 'utf8');

    // ⚠️ MEASURE THE CALL ORDER, NOT THE IMPORT ORDER. The first version used a
    // bare indexOf and matched the import block (createSigningSession on line 16,
    // invalidateSessionsForEstimate on 17) — the reverse of the call order (103,
    // 106) — and reported the finding as re-scoped when it was not. Slice from
    // the handler body first.
    const body = resend.slice(resend.indexOf('export async function POST'));
    const invalidateIdx = body.indexOf('await invalidateSessionsForEstimate');
    const mintIdx = body.indexOf('await createSigningSession');
    expect(invalidateIdx, 'resend no longer invalidates').toBeGreaterThan(-1);
    expect(mintIdx, 'resend no longer mints').toBeGreaterThan(-1);
    expect(
      invalidateIdx < mintIdx,
      'the invalidate no longer precedes the mint — re-scope M4-01'
    ).toBe(true);
  });
});

// ============================================================================
// M4-02 — the compare-and-swap on signature completion is not row-counted.
// ============================================================================

describe('S156-F2 — the completion CAS can match zero rows and say nothing', () => {
  it('F2a — a CAS against a non-pending session affects 0 rows and returns NO error', async () => {
    // `completeSignature()` (signing-service.ts:209) ends
    // `.eq('id', session.id).eq('status', 'pending')` — a correct compare-and-swap,
    // and the ONE construct where a zero-row result is the expected losing
    // outcome. The code checks only `sessionError` and then proceeds to update the
    // estimate and notify managers as though it had won.
    //
    // This proves the database half: the losing CAS is silent.
    const s = await makeSession(14, 'completed');

    const { data, error } = await admin
      .from('signing_sessions')
      .update({ signer_name: `${MARKER} racer` })
      .eq('id', s.id)
      .eq('status', 'pending')
      .select('id');

    expect(error, 'a losing CAS now errors — F2 may be fixed').toBeNull();
    expect(data, 'the CAS matched a non-pending session — the predicate is wrong').toEqual([]);
  });

  it('F2b — and the winning CAS does affect a row, so F2a is not vacuous', async () => {
    const s = await makeSession(14);
    const { data, error } = await admin
      .from('signing_sessions')
      .update({ signer_name: `${MARKER} winner` })
      .eq('id', s.id)
      .eq('status', 'pending')
      .select('id');
    expect(error).toBeNull();
    expect(data, 'the CAS matched nothing even for a pending session').toHaveLength(1);
  });

  it('F2c — the source still does not read the CAS result', async () => {
    // ⚠️ ASSERTS THE DEFECT. When the CAS is row-counted, invert this.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(
      fileURLToPath(new URL('../lib/services/signing-service.ts', import.meta.url)), 'utf8');

    const casIdx = src.indexOf(".eq('status', 'pending')");
    expect(casIdx, 'the compare-and-swap is gone entirely').toBeGreaterThan(-1);
    const after = src.slice(casIdx, casIdx + 260);
    expect(
      /\.select\(/.test(after),
      'the CAS now selects its affected rows — M4-02 may be fixed; if so, invert this'
    ).toBe(false);
  });
});

// ============================================================================
// M4-03 — token validity is enforced in ONE function, and it is correct.
// ============================================================================

describe('S156-F3 — the token gate itself', () => {
  it('F3a — an EXPIRED pending session is refused', async () => {
    const s = await makeSession(-1);
    expect(await getActiveSessionByToken(admin, s.token), 'an expired session was accepted').toBeNull();
  });

  it('F3b — a non-pending session is refused', async () => {
    for (const status of ['completed', 'declined', 'invalidated']) {
      const s = await makeSession(14, status);
      expect(
        await getActiveSessionByToken(admin, s.token),
        `a ${status} session was accepted`
      ).toBeNull();
    }
  });

  it('F3c — an unknown token is refused', async () => {
    expect(await getActiveSessionByToken(admin, crypto.randomUUID())).toBeNull();
  });

  it('F3d — signing_sessions has ONE policy, SELECT for owner/admin: the token is the capability', async () => {
    // No INSERT/UPDATE/DELETE policy at all, so every write is service-role and
    // an authenticated non-manager cannot read a token. This is the signing-table
    // pattern and it is correct — recorded so a later pass does not "fix" the
    // missing policies.
    const s = await makeSession(14);
    const { data: asCrew } = await crew
      .from('signing_sessions').select('token').eq('id', s.id);
    expect(asCrew, 'a crew member can read signing tokens').toEqual([]);

    const { data: asOwner } = await owner
      .from('signing_sessions').select('token').eq('id', s.id);
    expect(asOwner, 'an Owner cannot read sessions — F3d is vacuous').toHaveLength(1);

    const { error: writeErr } = await crew
      .from('signing_sessions').update({ status: 'completed' }).eq('id', s.id).select('id');
    void writeErr; // zero rows either way; the point is the row count below.
    const { data: after } = await admin
      .from('signing_sessions').select('status').eq('id', s.id).single();
    expect(after!.status, 'a crew member changed a session status').toBe('pending');
  });
});

// ============================================================================
// M4-04 — M4's writers ARE guarded. They duplicate the check instead of
//         importing it. This is the counter-example to four modules' pattern.
// ============================================================================

describe('S156-F4 — the estimate writers refuse a discarded write', () => {
  it('F4a — updateEstimate() REFUSES for a caller RLS discards', async () => {
    // ⚠️ THIS TEST WAS WRITTEN TO ASSERT A DEFECT AND FOUND THE OPPOSITE, twice.
    //
    // First it probed a CONVERTED estimate and got `success: false` from the
    // service's own freeze check — nothing to do with RLS. Re-pointed at the one
    // DRAFT estimate, it still refused. The reason is that all six writers in
    // `estimates-client.ts` end `.select('id')` and read `data.length` — they
    // hand-roll the guard `mutation-result.ts` provides.
    //
    // M4 is the FIRST module audited whose writers are correct. Recorded as a
    // passing assertion rather than deleted, because it is now a regression guard
    // on the one module that got this right.
    if (!draftEstimateId) return;

    state.client = crew;
    const before = await admin
      .from('estimates').select('name').eq('id', draftEstimateId).single();

    const result = await updateEstimate(draftEstimateId, { name: `${MARKER}-overwritten` });
    expect(
      result.success,
      'updateEstimate reported success over a write it could not make — M4 has regressed to M1/M2/M3'
    ).toBe(false);

    const after = await admin
      .from('estimates').select('name').eq('id', draftEstimateId).single();
    expect(after.data!.name, 'crew actually renamed the estimate').toBe(before.data!.name);
  });

  it('F4b — and the same call SUCCEEDS for an Owner, so F4a is not vacuous', async () => {
    if (!draftEstimateId) return;
    state.client = owner;
    const before = await admin
      .from('estimates').select('name').eq('id', draftEstimateId).single();

    const result = await updateEstimate(draftEstimateId, { name: `${MARKER}-owner` });
    expect(result.success, `the Owner could not write either: ${result.error}`).toBe(true);

    must('restore', (await admin
      .from('estimates').update({ name: before.data!.name }).eq('id', draftEstimateId)).error);
  });

  it('F4c — every UPDATE-shaped writer in estimates-client.ts reads its row count', async () => {
    // The structural half. If a new writer is added without the check, this goes
    // red — which is the protection M1, M2 and M3 did not have.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const src = readFileSync(
      fileURLToPath(new URL('../lib/services/estimates-client.ts', import.meta.url)), 'utf8');

    const fns = [...src.matchAll(/export async function (\w+)/g)];
    const unguarded: string[] = [];
    for (let i = 0; i < fns.length; i++) {
      const seg = src.slice(fns[i].index!, fns[i + 1]?.index ?? src.length);
      if (!seg.includes('.update(')) continue;
      const after = seg.split('.update(')[1];
      const counted =
        after.includes(".select('id')") &&
        (after.includes('length === 0') || after.includes('!data') || after.includes('data.length'));
      if (!counted) unguarded.push(fns[i][1]);
    }
    expect(unguarded, 'an estimates writer no longer reads its affected row count').toEqual([]);
  });
});

// ============================================================================
// Verified SOUND.
// ============================================================================

describe('S156-V — M4 properties checked and found correct', () => {
  it('V1 — nothing reads the 7I toggle, so criterion 1 holds structurally', async () => {
    // ⚠️ THE FIRST VERSION OF THIS TEST ASSERTED A **DATA** FACT — that no estimate
    // has the toggle on — and went red: `EST-100` carries
    // `include_client_contract = true`, left behind by
    // `s150-e1-contract-decoupling.live.ts`, which sets it to exercise R16 and
    // does not reset it. That is fixture residue (filed as M4-05), NOT a product
    // defect, and it is the wrong thing to assert.
    //
    // 7I criterion 1 is a CODE fact: "toggle off ⇒ behaviour byte-identical",
    // which holds because `clientContractAppliesToEstimate()` — the only reader —
    // has ZERO callers under `app/`. That is what this now pins.
    const { readFileSync } = await import('node:fs');
    const { execSync } = await import('node:child_process');
    void readFileSync;
    const hits = execSync(
      "grep -rl 'clientContractAppliesToEstimate' apps/web/app apps/web/components 2>/dev/null || true",
      { cwd: '/workspaces/FrameFocus-work', encoding: 'utf8' }
    ).trim();
    expect(
      hits,
      'something under app/ now reads the 7I toggle — criterion 1 needs re-checking'
    ).toBe('');
  });

  it('V2 — the estimate freeze check refuses edits to a non-draft estimate', async () => {
    // Found while debugging F4a, and worth keeping: `updateEstimate()` pre-reads
    // `status` and refuses anything not `draft`. That is a real robustness
    // property — a sent or converted estimate cannot be edited underneath a
    // signature — and it is enforced in the service, ahead of RLS.
    state.client = owner;
    const { data: converted } = await admin
      .from('estimates').select('id, name').eq('status', 'converted').eq('is_deleted', false)
      .order('id', { ascending: true }).limit(1).maybeSingle();
    if (!converted) return;

    const result = await updateEstimate(converted.id, { name: `${MARKER}-should-not-apply` });
    expect(result.success, 'a converted estimate was editable').toBe(false);
    expect(result.error).toMatch(/frozen/i);

    const { data: after } = await admin
      .from('estimates').select('name').eq('id', converted.id).single();
    expect(after!.name).toBe(converted.name);
  });
});
