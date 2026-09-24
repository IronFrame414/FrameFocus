import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// S110 H — /api/translate, LIVE: the real route, the real model (gpt-4o-mini —
// a few hundred tokens, well under a cent), the real cache, on rebuild-test.
//
//   S  a crew member's Spanish note → English for an English reader, with a
//      cost row (success) and a cache row
//   C  the SAME note again → answered from the cache: NO new cost row
//   E  an English note for an English reader → translated null (show original)
//   X  a CLIENT is refused 403 before anything is spent (ruling 5)
//
// The note carries a run token so each run exercises a real model call.

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { POST } from '@/app/api/translate/route';

const CREW = 'josh+crew@worthprop.com';
const CLIENT = 'josh+qa-client@worthprop.com';
const RUN = Date.now() % 100000;
const SPANISH = `El azulejo del baño está roto en la esquina, habitación ${RUN}.`;
const ENGLISH = `The bathroom tile is cracked in the corner, room ${RUN}.`;
let companyId = '';
let crewC: SupabaseClient;

const post = (texts: string[], target = 'en') =>
  POST(new Request('http://x/api/translate', { method: 'POST', body: JSON.stringify({ texts, target }) }));

async function costRows(): Promise<number> {
  const { count } = await admin
    .from('ai_translation_logs')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  return count ?? 0;
}

beforeAll(async () => {
  assertRebuildTest();
  crewC = await sessionFor(CREW);
  const { data: u } = await crewC.auth.getUser();
  const { data: p } = await admin.from('profiles').select('company_id').eq('user_id', u.user!.id).single();
  companyId = p!.company_id as string;
}, 60_000);

describe('S110 H — /api/translate, live', () => {
  it('S — Spanish → English for the reader; a success cost row and a cache row', async () => {
    state.client = crewC;
    const before = await costRows();
    const res = await post([SPANISH]);
    expect(res.status).toBe(200);
    const { results } = (await res.json()) as { results: Array<{ sourceLang: string; translated: string | null }> };
    expect(results).toHaveLength(1);
    expect(results[0].sourceLang).toBe('es');
    expect(results[0].translated, 'no translation came back').toBeTruthy();
    expect(results[0].translated).toMatch(new RegExp(String(RUN))); // numbers kept exactly
    expect(results[0].translated!.toLowerCase()).toMatch(/tile/);
    expect(await costRows()).toBe(before + 1);
    const { data: log } = await admin
      .from('ai_translation_logs')
      .select('success, model, text_count, estimated_cost_usd')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    expect(log!.success).toBe(true);
    expect(log!.text_count).toBe(1);
    expect(Number(log!.estimated_cost_usd)).toBeGreaterThan(0);
    expect(Number(log!.estimated_cost_usd)).toBeLessThan(0.01);
  }, 60_000);

  it('C — the same note again comes from the cache: no model call, no new cost row', async () => {
    state.client = crewC;
    const before = await costRows();
    const res = await post([SPANISH]);
    const { results } = (await res.json()) as { results: Array<{ translated: string | null }> };
    expect(results[0].translated).toBeTruthy();
    expect(await costRows()).toBe(before);
  }, 60_000);

  it('E — English for an English reader → translated null (the original is shown)', async () => {
    state.client = crewC;
    const res = await post([ENGLISH]);
    const { results } = (await res.json()) as { results: Array<{ sourceLang: string; translated: string | null }> };
    expect(results[0].sourceLang).toBe('en');
    expect(results[0].translated).toBeNull();
  }, 60_000);

  it('X — a CLIENT is refused before anything is spent', async () => {
    state.client = await sessionFor(CLIENT);
    const before = await costRows();
    const res = await post([SPANISH]);
    expect(res.status).toBe(403);
    expect(await costRows()).toBe(before);
  }, 60_000);

  it('bad input is refused (400) — too many texts, empty text, unknown target', async () => {
    state.client = crewC;
    expect((await post(Array.from({ length: 51 }, () => 'x'))).status).toBe(400);
    expect((await post(['   '])).status).toBe(400);
    expect((await post(['hola'], 'fr')).status).toBe(400);
  });
});
