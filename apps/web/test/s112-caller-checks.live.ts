import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S112 — MIGRATION 2: the privileged functions check who is calling.
// rebuild-test only.
// ============================================================================
// RULED [Josh, S112]: "Migration 2, separately: the caller checks inside each
// privileged function. Defence in depth, and a different kind of risk."
//
// Migration 1 shut the anon key out. This is about SIGNED-IN users of ANOTHER
// company: before migration 2, any authenticated user could call these with
// someone else's ids. Measured as the real sessions of two companies' owners:
//   A = josh+test50 (Sabal Point)   B = josh+qa-b-owner (Ridgeline)
//
// Written and run BEFORE 20261880000000 (red), then after (green).
// ============================================================================

const OWNER_A = 'josh+test50@worthprop.com';
const OWNER_B = 'josh+qa-b-owner@worthprop.com';
const PERMISSION = /permission denied|42501/i;

let a: SupabaseClient;
let b: SupabaseClient;
let companyA = '';
let companyB = '';
let seqA = 0;
let seqB = 0;
let memberA = '';
let sessionA = '';
let draftCoA: { id: string; co_number: string } | null = null;

async function seq(company: string) {
  const { data } = await admin.from('companies').select('invoice_number_sequence').eq('id', company).single();
  return (data as { invoice_number_sequence: number }).invoice_number_sequence;
}

beforeAll(async () => {
  assertRebuildTest();
  a = await sessionFor(OWNER_A);
  b = await sessionFor(OWNER_B);
  for (const [email, set] of [
    [OWNER_A, (v: string) => (companyA = v)],
    [OWNER_B, (v: string) => (companyB = v)],
  ] as const) {
    const { data } = await admin.from('profiles').select('company_id').eq('email', email).eq('is_deleted', false).single();
    set((data as { company_id: string }).company_id);
  }
  seqA = await seq(companyA);
  seqB = await seq(companyB);
  // Ordered, stable picks — any member/session/draft CO of company A will do.
  const { data: m } = await admin.from('company_members').select('id').eq('company_id', companyA).eq('is_deleted', false).order('created_at').order('id').limit(1).single();
  memberA = (m as { id: string }).id;
  const { data: s } = await admin.from('time_clock_sessions').select('id').eq('company_id', companyA).order('created_at').order('id').limit(1).single();
  sessionA = (s as { id: string }).id;
  const { data: co } = await admin
    .from('change_orders')
    .select('id, co_number')
    .eq('company_id', companyA)
    .eq('is_deleted', false)
    .neq('status', 'signed')
    .order('created_at')
    .order('id')
    .limit(1)
    .maybeSingle();
  draftCoA = co as typeof draftCoA;
});

afterAll(async () => {
  // Put both invoice sequences back exactly, whatever the runs allocated.
  if (companyA && (await seq(companyA)) !== seqA) await admin.from('companies').update({ invoice_number_sequence: seqA }).eq('id', companyA);
  if (companyB && (await seq(companyB)) !== seqB) await admin.from('companies').update({ invoice_number_sequence: seqB }).eq('id', companyB);
});

describe('1. internal-only functions are no longer an API for signed-in users', () => {
  it('owner A calls allocate_invoice_number for COMPANY B — refused, B\'s sequence does not move', async () => {
    const { data, error } = await a.rpc('allocate_invoice_number', { p_company_id: companyB });
    const after = await seq(companyB);
    console.log(`[S112 caller allocate A->B] data=${JSON.stringify(data)} error=${error?.message ?? '-'} | B sequence ${seqB} -> ${after}`);
    expect(after).toBe(seqB);
    expect(error?.message ?? '').toMatch(PERMISSION);
  });

  for (const [fn, args] of [
    ['sync_po_commitment', { p_po_id: '00000000-0000-0000-0000-000000000000' }],
    ['recompute_budget_item', { p_budget_item_id: '00000000-0000-0000-0000-000000000000' }],
    ['seed_file_categories', { p_company_id: '00000000-0000-0000-0000-000000000000' }],
    ['revert_invoice_settlement', { p_invoice_id: '00000000-0000-0000-0000-000000000000' }],
  ] as const) {
    it(`${fn} — refused for permission, not by its own logic`, async () => {
      const { error } = await a.rpc(fn, args as Record<string, unknown>);
      console.log(`[S112 caller ${fn}] ${error?.message ?? 'NO ERROR'}`);
      expect(error?.message ?? '').toMatch(PERMISSION);
    });
  }

  it('CONTROL: the legitimate path still allocates — next_invoice_number for your OWN company', async () => {
    const { data, error } = await a.rpc('next_invoice_number');
    console.log(`[S112 caller next_invoice_number A] ${JSON.stringify(data)} ${error?.message ?? ''}`);
    expect(error, error?.message).toBeNull();
    expect(String(data)).toMatch(/-\d+/);
  });
});

describe('2. policy helpers answer only about your own company', () => {
  it('member_profile_role: owner B asks about a COMPANY A member → null', async () => {
    const { data, error } = await b.rpc('member_profile_role', { p_member_id: memberA });
    console.log(`[S112 caller member_profile_role B->A] ${JSON.stringify(data)} ${error?.message ?? ''}`);
    expect(error, error?.message).toBeNull();
    expect(data).toBeNull();
  });
  it('member_profile_role CONTROL: owner A asks about its own member → a role', async () => {
    const { data } = await a.rpc('member_profile_role', { p_member_id: memberA });
    expect(typeof data).toBe('string');
  });
  it('time_session_member: owner B asks about a COMPANY A session → null', async () => {
    const { data, error } = await b.rpc('time_session_member', { p_session_id: sessionA });
    console.log(`[S112 caller time_session_member B->A] ${JSON.stringify(data)} ${error?.message ?? ''}`);
    expect(error, error?.message).toBeNull();
    expect(data).toBeNull();
  });
  it('time_session_member CONTROL: owner A asks about its own session → a member id', async () => {
    const { data } = await a.rpc('time_session_member', { p_session_id: sessionA });
    expect(typeof data).toBe('string');
  });
});

describe('3. apply_change_order_budget does not describe another company\'s change order', () => {
  it('owner B, company A\'s unsigned CO → "not found", never its number or status', async () => {
    if (!draftCoA) throw new Error('fixture: company A has no unsigned change order');
    const { error } = await b.rpc('apply_change_order_budget', { p_change_order_id: draftCoA.id });
    console.log(`[S112 caller apply_co_budget B->A] ${error?.message}`);
    expect(error?.message ?? '').not.toContain(draftCoA.co_number);
    expect(error?.message ?? '').toMatch(/not found/i);
  });
  it('CONTROL: the service role (the signing flow) still reaches it', async () => {
    if (!draftCoA) throw new Error('fixture');
    const { error } = await admin.rpc('apply_change_order_budget', { p_change_order_id: draftCoA.id });
    // Its own rule answers (the CO is not signed) — not a permission refusal.
    expect(error?.message ?? '').toMatch(/not signed/i);
  });
});
