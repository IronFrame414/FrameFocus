/**
 * S122 Part 7 — THE CRITICAL-PATH-OFF REGRESSION CONTROL, written BEFORE any
 * client read path is touched [Josh, 2026-10-01, report R2.10].
 *
 * `client_schedule()` (20261019000000, M9 R14) already serves a linked client
 * task-level titles, dates and status on ANY project, Critical Path on or off.
 * Any field added to its shape would reach every client on every project the
 * moment it lands — stop rule 8 through the back door, invisible to a test that
 * only looks at a Critical Path project.
 *
 * So: a linked client on a project with Critical Path OFF sees EXACTLY what
 * they see today. The shape is stated CLOSED (equal, not "does not contain" —
 * S164 ARM 8b's `not.toContain` would pass an added field), and the values
 * equal the service role's own projection of the same rows. The unlinked
 * client (same company, contact_id NULL) reads nothing.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';
/** S164's fixture: reached by the linked client through `project_contacts`. */
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
/** client_schedule's shape TODAY (20261019000000:232-240), sorted. */
const TODAY_KEYS = ['due_date', 'id', 'phase_name', 'project_id', 'start_date', 'status', 'title'];

let linked: SupabaseClient;
let control: SupabaseClient;

type Row = Record<string, unknown>;

async function schedule(c: SupabaseClient): Promise<Row[]> {
  const { data, error } = await c.rpc('client_schedule', { p_project_id: PROJECT });
  if (error) throw new Error(`client_schedule: ${error.message}`);
  return (data ?? []) as Row[];
}

/** The service role's own projection of the same rows, in the function's order. */
async function expected(): Promise<Row[]> {
  const { data: ts, error } = await admin
    .from('tasks')
    .select('id, project_id, phase_id, title, start_date, due_date, status')
    .eq('project_id', PROJECT)
    .eq('is_deleted', false);
  if (error) throw new Error(`tasks: ${error.message}`);
  const { data: ph } = await admin.from('phases').select('id, name').eq('project_id', PROJECT).eq('is_deleted', false);
  const phase = new Map(((ph ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const rows = ((ts ?? []) as { id: string; project_id: string; phase_id: string | null; title: string; start_date: string | null; due_date: string | null; status: string }[]).map(
    (t) => ({
      id: t.id,
      project_id: t.project_id,
      phase_name: t.phase_id ? (phase.get(t.phase_id) ?? null) : null,
      title: t.title,
      start_date: t.start_date,
      due_date: t.due_date,
      status: t.status,
    })
  );
  // ORDER BY start_date NULLS LAST, due_date NULLS LAST, title
  const cmp = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);
  return rows.sort((a, b) => cmp(a.start_date, b.start_date) || cmp(a.due_date, b.due_date) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
}

beforeAll(async () => {
  assertRebuildTest();
  [linked, control] = await Promise.all([sessionFor(LINKED), sessionFor(CONTROL)]);
  const { data: lp } = await admin.from('profiles').select('contact_id, role').eq('email', LINKED).single();
  if (!(lp as { contact_id: string | null }).contact_id) throw new Error(`${LINKED} is unlinked — run the seed; every assertion here would be vacuous.`);
  const { data: cp } = await admin.from('profiles').select('contact_id, role, company_id').eq('email', CONTROL).single();
  const c = cp as { contact_id: string | null; role: string; company_id: string };
  if (c.contact_id !== null || c.role !== 'client') throw new Error(`${CONTROL} must be an UNLINKED client (contact_id NULL, role client).`);
  const { data: pr } = await admin.from('projects').select('company_id').eq('id', PROJECT).single();
  if ((pr as { company_id: string }).company_id !== c.company_id) throw new Error('the control must be in the SAME company as the project (only the link check may refuse it).');
}, 120_000);

describe('client_schedule on a Critical-Path-OFF project is EXACTLY what it was', () => {
  it('the fixture is Critical Path OFF (a CP-on fixture would make this control vacuous)', async () => {
    const { data } = await admin
      .from('project_schedule_settings')
      .select('critical_path_enabled')
      .eq('project_id', PROJECT)
      .eq('is_deleted', false);
    const on = ((data ?? []) as { critical_path_enabled: boolean }[]).some((r) => r.critical_path_enabled);
    expect(on, 'Critical Path must be OFF on the fixture').toBe(false);
  });

  it('LINKED: rows exist, and every row has EXACTLY today\'s keys — nothing added, nothing removed', async () => {
    const rows = await schedule(linked);
    expect(rows.length, 'a shape test on zero rows proves nothing').toBeGreaterThan(0);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(TODAY_KEYS);
  });

  it('LINKED: the VALUES equal the service role\'s projection of the same rows, in the same order', async () => {
    const want = await expected();
    expect(want.length).toBeGreaterThan(0);
    expect(await schedule(linked)).toEqual(want);
  });

  it('CONTROL — the UNLINKED client in the same company reads 0 rows', async () => {
    expect(await schedule(control)).toHaveLength(0);
  });
});
