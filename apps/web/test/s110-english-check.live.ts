import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// S110 H [RULED Josh, Q14 → A + C, never B] — the REAL proposal send route,
// the REAL model, on rebuild-test.
//
//   W  an estimate whose NAME is Spanish (FILL-H.9's live case: a site visit's
//      crew-typed title becomes the proposal title and email subject) →
//      409 NON_ENGLISH naming that field, and NOTHING is minted: no signing
//      session, no email log
//   O  the same send with language_override → it proceeds, and the email log
//      row RECORDS the override (the flagged field and who overrode it)
//   E  CONTROL — an English name sends without a warning (so W's 409 is the
//      language, not something else about the fixture)
//
// Outside production the email itself is gated (EMAIL_SEND_ENABLED/VERCEL_ENV),
// so a proceeding send ends 502 AFTER logging — which is where the override is
// recorded. The document is never changed by the check.

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { POST } from '@/app/api/proposals/send/route';

const OWNER = 'josh+test50@worthprop.com';
const MARK = `S110EC-${Date.now() % 100000}`;
let companyId = '';
let ownerProfileId = '';
let contactId = '';
const est = { es: '', en: '' };

const send = (estimateId: string, override = false) =>
  POST(
    new Request('http://x/api/proposals/send', {
      method: 'POST',
      body: JSON.stringify({
        estimate_id: estimateId,
        subject: 'Your proposal',
        body: 'Please review the attached proposal.',
        ...(override ? { language_override: true } : {}),
      }),
    }) as never
  );

async function logsFor(estimateId: string) {
  const { data } = await admin
    .from('email_logs')
    .select('metadata, status')
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: true });
  return (data ?? []) as Array<{
    metadata: {
      language_check?: { checked: boolean; flagged: string[]; overridden_by: string | null };
    };
    status: string;
  }>;
}
async function sessionsFor(estimateId: string) {
  const { count } = await admin
    .from('signing_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('estimate_id', estimateId);
  return count ?? 0;
}

async function sweep() {
  const { data: ests } = await admin.from('estimates').select('id').like('name', `%${'S110EC-'}%`);
  const ids = (ests ?? []).map((e) => e.id);
  if (ids.length) {
    await admin.from('email_logs').delete().in('estimate_id', ids);
    await admin.from('signing_sessions').delete().in('estimate_id', ids);
    await admin.from('estimate_events').delete().in('estimate_id', ids);
    await admin.from('estimates').delete().in('id', ids);
  }
  await admin.from('contacts').delete().like('first_name', 'S110EC-%');
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  state.client = await sessionFor(OWNER);
  const { data: u } = await state.client.auth.getUser();
  const { data: p } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', u.user!.id)
    .single();
  companyId = p!.company_id as string;
  ownerProfileId = p!.id as string;
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: MARK,
      last_name: 'Client',
      email: `${MARK.toLowerCase()}@example.com`,
      contact_type: 'client',
    })
    .select('id')
    .single();
  if (cErr) throw new Error(cErr.message);
  contactId = c!.id;
  for (const [key, name, seq] of [
    ['es', `Remodelación completa del baño principal y cambio de azulejo — ${MARK}`, 1],
    ['en', `Primary bathroom remodel and tile replacement — ${MARK}`, 2],
  ] as const) {
    const { data, error } = await admin
      .from('estimates')
      .insert({
        company_id: companyId,
        contact_id: contactId,
        name,
        estimate_number: `${MARK}-${seq}`,
        status: 'draft',
        created_by: u.user!.id,
        updated_by: u.user!.id,
        created_by_role: 'owner',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    est[key] = data!.id;
  }
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S110 H, Q14 — the proposal send warns on non-English, and records an override', () => {
  it('W — a Spanish estimate name → 409 NON_ENGLISH naming it; nothing minted, nothing logged', async () => {
    const res = await send(est.es);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe('NON_ENGLISH');
    expect(body.fields).toContain('Estimate name (the proposal title)');
    expect(await sessionsFor(est.es), 'a signing link was minted before the check').toBe(0);
    expect(await logsFor(est.es)).toHaveLength(0);
    const { data: e } = await admin
      .from('estimates')
      .select('status, name')
      .eq('id', est.es)
      .single();
    expect(e!.status).toBe('draft');
    expect(e!.name).toMatch(/^Remodelación/); // the check never rewrites a word
  }, 120_000);

  it('O — the same send with language_override proceeds, and the override is RECORDED on the log', async () => {
    const res = await send(est.es, true);
    expect(res.status, 'blocked again despite the override').not.toBe(409);
    const logs = await logsFor(est.es);
    expect(logs.length).toBeGreaterThan(0);
    const lc = logs[logs.length - 1].metadata.language_check!;
    expect(lc.checked).toBe(true);
    expect(lc.flagged).toContain('Estimate name (the proposal title)');
    expect(lc.overridden_by).toBe(ownerProfileId);
  }, 120_000);

  it('E — CONTROL: an English name is not warned; its log records a clean check', async () => {
    const res = await send(est.en);
    expect(res.status).not.toBe(409);
    const logs = await logsFor(est.en);
    const lc = logs[logs.length - 1].metadata.language_check!;
    expect(lc.checked).toBe(true);
    expect(lc.flagged).toEqual([]);
    expect(lc.overridden_by).toBeNull();
  }, 120_000);
});
