import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ANON, URL_, admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S112 — the public ANON key may execute exactly the functions a logged-out
// page calls, and nothing else. rebuild-test only.
// ============================================================================
// RULED [Josh, S112]: "revoke anon EXECUTE on everything except an explicit
// ALLOWLIST ... Prove each allowlisted function is reached by a logged-out
// path." And: "prove as anon that allocate_invoice_number succeeds today and
// fails after. Row counts."
//
// Measured before the lockdown (catalog, rebuild-test): 280 of 321 functions
// in `public` executable by anon, 89 of them SECURITY DEFINER and callable
// through the API. allocate_invoice_number, as anon inside a rolled-back
// transaction, allocated INV-0002 for another company.
//
// THE ALLOWLIST — every anon-key RPC on a logged-out path, from
//   git grep -nE "\.rpc\(" origin/main -- apps/web   (289 call sites, 78 names)
// traced through every route/page reachable without a session:
//   submit_sub_bid_reply     app/bid/[token]/bid-reply-client.tsx:87 (browser)
//   get_invitation_status    app/invite/accept/accept-invite.tsx:110 (browser)
//   get_invitation_by_token  app/invite/accept/accept-invite.tsx:116 (browser)
// Every other logged-out surface reads through the service-role client
// (bid page, proposal and CO signing, unsubscribe, resubscribe) or the Auth
// API (sign-in, sign-up, password reset, auth callbacks).
//
// All calls go through the REAL PostgREST path with the anon key — never SQL
// `SET ROLE`, which proves the grant but not the API.
// ============================================================================

const OTHER_CO_OWNER = 'josh+qa-b-owner@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';
let anon: SupabaseClient;
let otherCompanyId = '';
let seqBefore = 0;

const PERMISSION = /permission denied|42501/i;

async function seq() {
  const { data } = await admin.from('companies').select('invoice_number_sequence').eq('id', otherCompanyId).single();
  return (data as { invoice_number_sequence: number }).invoice_number_sequence;
}

beforeAll(async () => {
  assertRebuildTest();
  anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data } = await admin.from('profiles').select('company_id').eq('email', OTHER_CO_OWNER).eq('is_deleted', false).single();
  otherCompanyId = (data as { company_id: string }).company_id;
  seqBefore = await seq();
});

afterAll(async () => {
  // If the negative run allocated a number, put the sequence back exactly.
  if (otherCompanyId && (await seq()) !== seqBefore) {
    await admin.from('companies').update({ invoice_number_sequence: seqBefore }).eq('id', otherCompanyId);
  }
});

describe('1. the privileged functions refuse the anon key', () => {
  it('allocate_invoice_number — REFUSED, and the other company\'s sequence does not move', async () => {
    const { data, error } = await anon.rpc('allocate_invoice_number', { p_company_id: otherCompanyId });
    const after = await seq();
    console.log(`[S112 anon allocate] data=${JSON.stringify(data)} error=${error?.code ?? '-'} ${error?.message ?? ''} | sequence ${seqBefore} -> ${after}`);
    expect(after, 'anon moved another company\'s invoice sequence').toBe(seqBefore);
    expect(error?.message ?? '').toMatch(PERMISSION);
  });

  for (const [fn, args] of [
    ['apply_change_order_budget', { p_change_order_id: '00000000-0000-0000-0000-000000000000' }],
    ['sync_po_commitment', { p_po_id: '00000000-0000-0000-0000-000000000000' }],
    ['seed_default_tags', { p_company_id: '00000000-0000-0000-0000-000000000000' }],
    ['get_sub_bid_request', { p_token: 'x' }],
  ] as const) {
    it(`${fn} — refused for PERMISSION, not by its own logic`, async () => {
      const { error } = await anon.rpc(fn, args as Record<string, unknown>);
      console.log(`[S112 anon ${fn}] ${error?.code ?? '-'} ${error?.message ?? 'NO ERROR'}`);
      expect(error?.message ?? '').toMatch(PERMISSION);
    });
  }

  it('test_invite_lookup — gone', async () => {
    const { error } = await anon.rpc('test_invite_lookup', { p_token: '00000000-0000-0000-0000-000000000000' });
    expect(error?.code).toBe('PGRST202');
  });
});

describe('2. CONTROL — the three allowlisted functions still answer the anon key', () => {
  it('get_invitation_status — no permission error', async () => {
    const { error } = await anon.rpc('get_invitation_status', { invite_token: '00000000-0000-0000-0000-000000000000' });
    expect(error?.message ?? '').not.toMatch(PERMISSION);
  });
  it('get_invitation_by_token — no permission error', async () => {
    const { error } = await anon.rpc('get_invitation_by_token', { invite_token: '00000000-0000-0000-0000-000000000000' });
    expect(error?.message ?? '').not.toMatch(PERMISSION);
  });
  it('submit_sub_bid_reply — reaches its OWN check ("not valid"), not a permission error', async () => {
    const { error } = await anon.rpc('submit_sub_bid_reply', {
      p_token: 'no-such-token',
      p_bid_amount: 1,
      p_labor_amount: null,
      p_material_amount: null,
      p_scope_coverage_percent: null,
      p_exclusions: null,
      p_holds_until: null,
    });
    console.log(`[S112 anon submit_sub_bid_reply] ${error?.message}`);
    expect(error?.message ?? '').toMatch(/not valid/i);
  });
});

describe('3. CONTROL — nothing changes for signed-in users or the auth service', () => {
  it('a signed-in owner still executes an ordinary function (can_view_project)', async () => {
    const owner = await sessionFor(OWNER);
    const { error } = await owner.rpc('can_view_project', { p_project_id: '00000000-0000-0000-0000-000000000000' });
    expect(error, error?.message).toBeNull();
  });

  it('signup still works: creating an auth user fires the auth.users triggers as supabase_auth_admin', async () => {
    const email = `s112-lockdown-${Date.now()}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: 'S112-lockdown-pass!9', email_confirm: true });
    console.log(`[S112 signup trigger] ${error ? `ERROR ${error.message}` : 'created'}`);
    expect(error, error?.message).toBeNull();
    if (data.user) await admin.auth.admin.deleteUser(data.user.id);
  });

  it('a public company logo still downloads with no credentials', async () => {
    const { data } = await admin.storage.from('company-logos').list('', { limit: 5 });
    const folder = (data ?? []).find((o) => !o.name.includes('.'));
    if (!folder) return; // no logo on rebuild-test — nothing to fetch (stated in the report)
    const { data: inner } = await admin.storage.from('company-logos').list(folder.name, { limit: 1 });
    const name = (inner ?? [])[0]?.name;
    if (!name) return;
    const url = admin.storage.from('company-logos').getPublicUrl(`${folder.name}/${name}`).data.publicUrl;
    const res = await fetch(url);
    console.log(`[S112 public logo] ${res.status}`);
    expect(res.status).toBe(200);
  });
});
