/**
 * S121 Part 8 — "no PE" is counted from LIVE members, and the controls return
 * the moment a PE exists. Proved against rebuild-test's one real PE
 * (josh+qa-pe@worthprop.com), through the SAME read the page uses
 * (getEstimatePeAccess), as the Owner.
 *
 *   1 live PE                 → executives 1 → shown
 *   the PE's member row gone  → executives 0 → hidden   (restored, read back)
 *   the PE's profile deleted  → executives 0 → hidden   (restored, read back)
 *
 * ⚠️ Temporarily soft-deletes the PE identity — the rows are restored in
 * finally blocks and read back. Rebuild-test only (assertRebuildTest).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

let owner: SupabaseClient;
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => owner }));
import { getEstimatePeAccess } from '@/lib/services/estimate-assignments';
import { showPeControls } from '@/lib/estimates/pe-visibility';

let peProfile = '';
let peMember = '';
let estimateId = '';

beforeAll(async () => {
  assertRebuildTest();
  owner = await sessionFor('josh+test50@worthprop.com');
  const { data: p } = await admin.from('profiles').select('id, company_id').eq('email', 'josh+qa-pe@worthprop.com').single();
  peProfile = (p as { id: string }).id;
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', peProfile).single();
  peMember = (m as { id: string }).id;
  // Any estimate of the company with NO live PE assignment.
  const { data: ests } = await admin
    .from('estimates')
    .select('id')
    .eq('company_id', (p as { company_id: string }).company_id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(50);
  for (const e of (ests ?? []) as { id: string }[]) {
    const { count } = await admin
      .from('estimate_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('estimate_id', e.id)
      .eq('is_deleted', false);
    if (count === 0) {
      estimateId = e.id;
      break;
    }
  }
  expect(estimateId, 'an unassigned estimate exists').not.toBe('');
}, 120_000);

afterAll(async () => {
  // Belt and braces: the identity is live again, whatever happened.
  await admin.from('company_members').update({ is_deleted: false, deleted_at: null }).eq('id', peMember);
  await admin.from('profiles').update({ is_deleted: false }).eq('id', peProfile);
});

describe('Part 8 — shown with a live PE, hidden without one', () => {
  it('1 live PE → the picker is SHOWN', async () => {
    const a = await getEstimatePeAccess(estimateId);
    expect(a.executives.map((x) => x.memberId)).toContain(peMember);
    expect(showPeControls(a)).toBe(true);
  });

  it('the PE’s MEMBER row soft-deleted → 0 live PEs → HIDDEN; restored → SHOWN again', async () => {
    await admin.from('company_members').update({ is_deleted: true }).eq('id', peMember);
    try {
      const a = await getEstimatePeAccess(estimateId);
      expect(a.executives).toHaveLength(0);
      expect(showPeControls(a)).toBe(false);
    } finally {
      await admin.from('company_members').update({ is_deleted: false, deleted_at: null }).eq('id', peMember);
    }
    const { data } = await admin.from('company_members').select('is_deleted').eq('id', peMember).single();
    expect((data as { is_deleted: boolean }).is_deleted, 'restored').toBe(false);
    expect(showPeControls(await getEstimatePeAccess(estimateId))).toBe(true);
  });

  it('the PE’s PROFILE soft-deleted → HIDDEN; restored → SHOWN again', async () => {
    await admin.from('profiles').update({ is_deleted: true }).eq('id', peProfile);
    try {
      const a = await getEstimatePeAccess(estimateId);
      expect(a.executives).toHaveLength(0);
      expect(showPeControls(a)).toBe(false);
    } finally {
      await admin.from('profiles').update({ is_deleted: false }).eq('id', peProfile);
    }
    const { data } = await admin.from('profiles').select('is_deleted').eq('id', peProfile).single();
    expect((data as { is_deleted: boolean }).is_deleted, 'restored').toBe(false);
    expect(showPeControls(await getEstimatePeAccess(estimateId))).toBe(true);
  });
});
