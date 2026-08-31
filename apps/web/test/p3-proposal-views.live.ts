/**
 * P3 — PROPOSAL VIEW TRACKING: the proposal_views floor (blocking-items,
 * 2026-08-29). Spec: docs/specs/proposal-view-tracking-spec.md.
 *
 * The SELECT policy is CONTAINMENT on the estimate's own floor — Owner/Admin
 * plus the AUTHORING PM — and there are NO write policies at all (the signing
 * surface writes via service role). Every zero below is anchored by an admin
 * read of the same rows, so nothing here passes on an empty table.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts p3-proposal-views
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'P3VIEWS';

let owner: SupabaseClient;
let pm: SupabaseClient;
let foreman: SupabaseClient;
let crew: SupabaseClient;
let clientC: SupabaseClient;

let companyId: string;
let ownerEstimateId: string; // authored by the OWNER — invisible activity for the PM
let pmEstimateId: string; // authored by the PM — their own activity

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

beforeAll(async () => {
  assertRebuildTest();
  [owner, pm, foreman, crew, clientC] = await Promise.all([
    sessionFor('josh+test50@worthprop.com'),
    sessionFor('josh+pm@worthprop.com'),
    sessionFor('josh+qa-foreman@worthprop.com'),
    sessionFor('josh+crew@worthprop.com'),
    sessionFor('josh+qa-client@worthprop.com'),
  ]);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = company!.id;

  const { data: contact } = await admin
    .from('contacts').select('id').eq('company_id', companyId)
    // Any company contact will do — an existence pick, nothing downstream
    // depends on WHICH contact carries the fixture estimates.
    .limit(1).single();

  // Estimates are created AS the authenticated users, not the service role —
  // company_id/created_by land through the column defaults, and created_by is
  // what the containment arm keys on for the PM.
  const { data: oe, error: oeErr } = await owner
    .from('estimates')
    .insert({ name: `${MARKER} owner-authored`, contact_id: contact!.id, status: 'draft' })
    .select('id').single();
  must('owner estimate', oeErr);
  ownerEstimateId = oe!.id;

  const { data: pe, error: peErr } = await pm
    .from('estimates')
    .insert({ name: `${MARKER} pm-authored`, contact_id: contact!.id, status: 'draft' })
    .select('id').single();
  must('pm estimate', peErr);
  pmEstimateId = pe!.id;

  // Seed views the way production writes them: service role, one row per
  // open. Two human opens + one scanner on the owner's estimate; one human
  // open on the PM's.
  must('seed views', (await admin.from('proposal_views').insert([
    { company_id: companyId, estimate_id: ownerEstimateId, user_agent: 'Mozilla/5.0 (iPhone) Safari/605.1.15' },
    { company_id: companyId, estimate_id: ownerEstimateId, user_agent: 'Mozilla/5.0 (Macintosh) Chrome/128.0' },
    { company_id: companyId, estimate_id: ownerEstimateId, user_agent: 'Mozilla/5.0 (compatible; GoogleImageProxy)' },
    { company_id: companyId, estimate_id: pmEstimateId, user_agent: 'Mozilla/5.0 (Windows NT 10.0) Edg/128.0' },
  ])).error);
});

afterAll(async () => {
  // proposal_views cascades with its estimates.
  for (const id of [ownerEstimateId, pmEstimateId]) {
    if (id) await admin.from('estimates').delete().eq('id', id);
  }
});

describe('P3 — who reads proposal activity', () => {
  it('anchor — the seeded rows exist (admin)', async () => {
    const { count } = await admin
      .from('proposal_views').select('*', { count: 'exact', head: true })
      .in('estimate_id', [ownerEstimateId, pmEstimateId]);
    expect(count).toBe(4);
  });

  it('an Owner reads every estimate\'s activity', async () => {
    const { data, error } = await owner
      .from('proposal_views').select('id')
      .in('estimate_id', [ownerEstimateId, pmEstimateId]);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(4);
  });

  it('the authoring PM reads their own estimate\'s activity', async () => {
    const { data, error } = await pm
      .from('proposal_views').select('id').eq('estimate_id', pmEstimateId);
    expect(error).toBeNull();
    expect((data ?? []).length, 'the column renders empty for the person who sent it').toBe(1);
  });

  it('a PM reads NOTHING on an estimate they did not author', async () => {
    // The containment arm inherits estimates_select_authenticated, which
    // floors a PM to created_by = auth.uid().
    const { data, error } = await pm
      .from('proposal_views').select('id').eq('estimate_id', ownerEstimateId);
    expect(error).toBeNull();
    expect(data ?? [], 'a PM read another author\'s proposal activity').toHaveLength(0);
  });

  it('foreman, crew and client read nothing — anchored by the admin count above', async () => {
    for (const [label, c] of [
      ['foreman', foreman],
      ['crew', crew],
      ['client', clientC],
    ] as const) {
      const { data, error } = await c
        .from('proposal_views').select('id')
        .in('estimate_id', [ownerEstimateId, pmEstimateId]);
      expect(error, `${label}: unexpected error`).toBeNull();
      expect(data ?? [], `${label} read proposal activity`).toHaveLength(0);
    }
  });
});

describe('P3 — nobody writes from the browser', () => {
  it('an authenticated Owner INSERT is refused — there is no INSERT policy', async () => {
    const { error } = await owner.from('proposal_views').insert({
      company_id: companyId, estimate_id: ownerEstimateId, user_agent: 'forged',
    });
    expect(error, 'an Owner inserted a view row from the browser').not.toBeNull();
  });

  it('prune_proposal_views() is not callable by an authenticated user', async () => {
    const { error } = await owner.rpc('prune_proposal_views');
    expect(error, 'an authenticated user ran the prune').not.toBeNull();
  });

  it('the service role CAN prune, and a fresh table prunes nothing', async () => {
    const { data, error } = await admin.rpc('prune_proposal_views');
    expect(error).toBeNull();
    // Six-month clock on VOIDED estimates only — nothing seeded here
    // qualifies, and the count proves the function ran rather than erroring.
    expect(typeof data).toBe('number');
  });
});
