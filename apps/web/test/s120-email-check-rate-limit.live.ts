/**
 * S120 1-B — TECH_DEBT #176: `email_has_account` is rate-limited per caller.
 *
 * Migration 20262111000000. Unattended default (S120 ASK-1 A): a RATE LIMIT —
 * the function still answers the same question platform-wide (the invite flow
 * depends on it), but only 30 times per caller per rolling hour.
 *
 * ⚠️ The ledger is per caller, so this harness clears the caller's ledger rows
 * with the service role before and after — otherwise it would spend the Owner
 * identity's budget for an hour and break every other harness (and CI's invite
 * e2e) that asks the question.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => h.client,
  getRequestUser: async () => (await (h.client as SupabaseClient).auth.getUser()).data.user ?? null,
}));

const OWNER = 'josh+test50@worthprop.com';
const ADMIN = 'josh+qa-admin@worthprop.com';
const LIMIT = 30;

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let ownerUserId = '';
let adminUserId = '';
let companyId = '';

async function userIdOf(email: string): Promise<{ user: string; company: string }> {
  const { data } = await admin
    .from('profiles')
    .select('user_id, company_id')
    .eq('email', email)
    .single();
  return {
    user: (data as { user_id: string }).user_id,
    company: (data as { company_id: string }).company_id,
  };
}

/** Service-role count of a caller's ledger rows (the table may not exist pre-fix). */
async function ledger(userId: string): Promise<number | null> {
  const { count, error } = await admin
    .from('email_account_checks' as never)
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId);
  return error ? null : (count ?? 0);
}

async function clearLedger(): Promise<void> {
  for (const u of [ownerUserId, adminUserId])
    await admin
      .from('email_account_checks' as never)
      .delete()
      .eq('created_by', u);
}

beforeAll(async () => {
  assertRebuildTest();
  const o = await userIdOf(OWNER);
  const a = await userIdOf(ADMIN);
  ownerUserId = o.user;
  adminUserId = a.user;
  companyId = o.company;
  if (a.company !== companyId) throw new Error('admin is not in the owner’s company');
  await clearLedger();
  [ownerC, adminC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN),
  ])) as SupabaseClient[];
}, 240_000);

afterAll(async () => {
  // A route probe that was NOT refused (pre-fix, or under sabotage) writes an
  // invitation and its email log — remove both.
  await admin.from('email_logs').delete().like('recipient_email', 'josh+s120-rl-%');
  await admin.from('invitations').delete().like('email', 'josh+s120-rl-%');
  await clearLedger();
  expect(await ledger(ownerUserId), 'owner ledger survived teardown').toBe(0);
}, 120_000);

describe('#176 — 30 answered checks per caller per rolling hour', () => {
  const answers: Array<boolean | null> = [];
  let refusal: { code?: string; message?: string } | null = null;

  it(`the first ${LIMIT} calls are answered, with the same answer as before`, async () => {
    for (let i = 0; i < LIMIT; i++) {
      const { data, error } = await ownerC.rpc('email_has_account', { p_email: OWNER });
      answers.push(error ? null : (data as boolean));
    }
    console.log(
      `[S120R] answered ${answers.filter((x) => x === true).length}/${LIMIT} (all true = own address has an account)`
    );
    expect(answers.every((x) => x === true)).toBe(true);
  }, 120_000);

  it(`call ${LIMIT + 1} is REFUSED with 54000 (program_limit_exceeded)`, async () => {
    const { data, error } = await ownerC.rpc('email_has_account', { p_email: OWNER });
    refusal = error ? { code: error.code, message: error.message } : null;
    console.log(`[S120R] call ${LIMIT + 1}: data=${String(data)} error=${error?.code ?? 'none'}`);
    expect(error?.code).toBe('54000');
    expect(data).toBeNull();
  });

  it('the refused call is NOT counted: the ledger holds exactly 30 (service role)', async () => {
    const n = await ledger(ownerUserId);
    console.log(`[S120R] owner ledger rows: ${n}`);
    expect(n).toBe(LIMIT);
    expect(refusal).not.toBeNull();
  });

  it('the limit is PER CALLER: the Admin of the same company is still answered', async () => {
    const { data, error } = await adminC.rpc('email_has_account', { p_email: OWNER });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('a session cannot RESET its window: DELETE of its own ledger rows removes nothing (service-role count)', async () => {
    await ownerC
      .from('email_account_checks' as never)
      .delete()
      .eq('created_by', ownerUserId);
    expect(await ledger(ownerUserId)).toBe(LIMIT);
  });

  it('a session cannot FILL another caller’s window: INSERT is refused (no returning; service-role count)', async () => {
    const before = await ledger(adminUserId);
    const { error } = await ownerC
      .from('email_account_checks' as never)
      .insert({ company_id: companyId, created_by: adminUserId } as never);
    const after = await ledger(adminUserId);
    console.log(
      `[S120R] foreign INSERT: error=${error?.code ?? 'none'} admin ledger ${before} -> ${after}`
    );
    expect(after).toBe(before);
    expect(error).not.toBeNull();
  });

  it('POST /api/invites (real route, in-process) while limited → 429 with its own message; NO invitation written', async () => {
    h.client = ownerC;
    const probe = `josh+s120-rl-${Date.now()}@worthprop.com`;
    const { POST } = (await import('@/app/api/invites/route')) as unknown as {
      POST: (req: NextRequest) => Promise<Response>;
    };
    const res = await POST(
      new NextRequest('http://localhost/api/invites', {
        method: 'POST',
        body: JSON.stringify({ email: probe, role: 'crew_member' }),
        headers: { 'content-type': 'application/json' },
      })
    );
    const body = (await res.json()) as { error?: string; code?: string };
    const { count } = await admin
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('email', probe);
    console.log(`[S120R] route while limited: ${res.status} ${body.code} invitations=${count}`);
    expect(res.status).toBe(429);
    expect(body.code).toBe('rate_limited');
    expect(count ?? 0).toBe(0);
  });

  it('after the window is cleared (service role), the Owner is answered again — the answer itself never changed', async () => {
    await clearLedger();
    const yes = await ownerC.rpc('email_has_account', { p_email: OWNER });
    const no = await ownerC.rpc('email_has_account', {
      p_email: `josh+s120-nobody-${Date.now()}@worthprop.com`,
    });
    expect(yes.error).toBeNull();
    expect(yes.data).toBe(true);
    expect(no.error).toBeNull();
    expect(no.data).toBe(false);
  });
});
