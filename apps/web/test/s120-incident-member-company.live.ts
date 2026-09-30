/**
 * S120 1-D — TECH_DEBT #178: an incident's injured party and witnesses must be
 * members of the incident's own company.
 *
 * Migration 20262113000000. Probed through BOTH `create_safety_incident`
 * overloads, as the crew reporter, and by a direct child-row INSERT; every
 * outcome judged by the SERVICE ROLE (rows naming the foreign member).
 * Positive control: the same calls naming a member of the reporter's OWN
 * company still land.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S120I';
const REPORTER = 'josh+crew@worthprop.com';
const COLLEAGUE = 'josh+qa-foreman@worthprop.com';

let crew: SupabaseClient;
let companyA = '';
let projectA = '';
let ownMember = '';
let foreignMember = '';

async function sweep(): Promise<void> {
  const { data } = await admin
    .from('safety_incidents')
    .select('id')
    .like('description', `${MARKER}%`);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) {
    await admin.from('safety_incident_injuries').delete().in('incident_id', ids);
    await admin.from('safety_incident_witnesses').delete().in('incident_id', ids);
    await admin.from('safety_incidents').delete().in('id', ids);
  }
}

/** Service role: child rows of MARKER incidents naming `memberId`. */
async function named(
  table: 'safety_incident_injuries' | 'safety_incident_witnesses',
  memberId: string
) {
  const { data } = await admin
    .from('safety_incidents')
    .select('id')
    .like('description', `${MARKER}%`);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (!ids.length) return 0;
  const { count } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in('incident_id', ids)
    .eq('member_id', memberId);
  return count ?? 0;
}

function report7(tag: string, injured: string | null, witness: string | null) {
  return crew.rpc('create_safety_incident', {
    p_project_id: projectA,
    p_incident_date: new Date().toISOString().slice(0, 10),
    p_incident_type: injured ? 'injury' : 'near_miss',
    p_description: `${MARKER} ${tag}`,
    p_prevention_notes: null,
    p_injuries: injured ? [{ member_id: injured, treatment_sought: false }] : [],
    p_witnesses: witness ? [{ member_id: witness }] : [],
  });
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: p } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('email', COLLEAGUE)
    .single();
  companyA = (p as { company_id: string }).company_id;
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (p as { id: string }).id)
    .eq('is_deleted', false)
    .single();
  ownMember = (m as { id: string }).id;
  const { data: fm } = await admin
    .from('company_members')
    .select('id, company_id')
    .neq('company_id', companyA)
    .order('id')
    .limit(1)
    .single();
  foreignMember = (fm as { id: string }).id;
  crew = await sessionFor(REPORTER);
  const { data: vp } = await crew
    .from('projects')
    .select('id')
    .eq('company_id', companyA)
    .order('id')
    .limit(1)
    .single();
  projectA = (vp as { id: string }).id;
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('safety_incidents')
    .select('id', { count: 'exact', head: true })
    .like('description', `${MARKER}%`);
  expect(count ?? 0, 'S120I incidents survived teardown').toBe(0);
}, 120_000);

describe('#178 — the live 7-arg path (SECURITY INVOKER), as the crew reporter', () => {
  it('an INJURED PARTY from another company is refused (service-role count 0)', async () => {
    const { error } = await report7('foreign-injured', foreignMember, null);
    const n = await named('safety_incident_injuries', foreignMember);
    console.log(`[S120I] 7-arg foreign injured: error=${error?.code ?? 'none'} rows=${n}`);
    expect(n).toBe(0);
    expect(error).not.toBeNull();
  });

  it('a WITNESS from another company is refused (service-role count 0)', async () => {
    const { error } = await report7('foreign-witness', null, foreignMember);
    const n = await named('safety_incident_witnesses', foreignMember);
    console.log(`[S120I] 7-arg foreign witness: error=${error?.code ?? 'none'} rows=${n}`);
    expect(n).toBe(0);
    expect(error).not.toBeNull();
  });

  it('POSITIVE CONTROL: a colleague of the SAME company as injured party and witness → both land', async () => {
    const { error } = await report7('own', ownMember, ownMember);
    const i = await named('safety_incident_injuries', ownMember);
    const w = await named('safety_incident_witnesses', ownMember);
    console.log(
      `[S120I] 7-arg own member: error=${error?.message ?? 'none'} injuries=${i} witnesses=${w}`
    );
    expect(error).toBeNull();
    expect(i).toBe(1);
    expect(w).toBe(1);
  });
});

describe('#178 — a direct child-row write cannot name a foreign member either', () => {
  it('INSERT a witness row naming a foreign member on one’s own incident → refused (no returning; count 0)', async () => {
    const { data: inc } = await admin
      .from('safety_incidents')
      .select('id')
      .eq('description', `${MARKER} own`)
      .single();
    const { error } = await crew
      .from('safety_incident_witnesses')
      .insert({ incident_id: (inc as { id: string }).id, member_id: foreignMember } as never);
    const n = await named('safety_incident_witnesses', foreignMember);
    console.log(`[S120I] direct foreign witness INSERT: error=${error?.code ?? 'none'} rows=${n}`);
    expect(n).toBe(0);
    expect(error).not.toBeNull();
  });
});

describe('#178 / #1-s180u — the dead 6-arg SECURITY DEFINER overload is not reachable', () => {
  it('calling it with a foreign injured party writes nothing (service-role count 0) and is refused', async () => {
    const { error } = await crew.rpc('create_safety_incident', {
      p_project_id: projectA,
      p_incident_date: new Date().toISOString().slice(0, 10),
      p_incident_type: 'injury',
      p_description: `${MARKER} six-arg`,
      p_injuries: [{ member_id: foreignMember, treatment_sought: false }],
      p_witnesses: [],
    });
    // Scoped to THIS call's incident — a pooled count over every marker
    // incident went red under sabotage for rows the 7-arg tests wrote.
    const { data: six } = await admin
      .from('safety_incidents')
      .select('id')
      .eq('description', `${MARKER} six-arg`);
    const sixIds = ((six ?? []) as Array<{ id: string }>).map((r) => r.id);
    const incidents = sixIds.length;
    const { count: injured } = sixIds.length
      ? await admin
          .from('safety_incident_injuries')
          .select('id', { count: 'exact', head: true })
          .in('incident_id', sixIds)
          .eq('member_id', foreignMember)
      : { count: 0 };
    const n = injured ?? 0;
    console.log(
      `[S120I] 6-arg: error=${error?.code ?? 'none'} incidents=${incidents} foreign injuries=${n}`
    );
    expect(n).toBe(0);
    expect(incidents ?? 0).toBe(0);
    expect(error).not.toBeNull();
  });

  // The call above is also stopped by the member trigger, so on its own it
  // cannot prove the REVOKE. This one names no member at all: only the revoke
  // can refuse it.
  // ⚠️ INVERTED IN PLACE [S121 7-A — the 6-arg overload is DROPPED
  // (20262121000000), completing #1-s180u]. _Superseded:_ "even a harmless call
  // (no parties) is refused: EXECUTE is revoked (0 incidents)" asserting
  // error.code '42501' (permission denied). The function no longer EXISTS, so
  // PostgREST finds no function matching these six named arguments: PGRST202.
  // Still 0 incidents.
  it('even a harmless call (no parties) is refused: the 6-arg overload no longer exists (0 incidents)', async () => {
    const { error } = await crew.rpc('create_safety_incident', {
      p_project_id: projectA,
      p_incident_date: new Date().toISOString().slice(0, 10),
      p_incident_type: 'near_miss',
      p_description: `${MARKER} six-arg-harmless`,
      p_injuries: [],
      p_witnesses: [],
    });
    const { count } = await admin
      .from('safety_incidents')
      .select('id', { count: 'exact', head: true })
      .eq('description', `${MARKER} six-arg-harmless`);
    console.log(`[S120I] 6-arg harmless: error=${error?.code ?? 'none'} incidents=${count}`);
    expect(count ?? 0).toBe(0);
    expect(error?.code).toBe('PGRST202');
  });
});
