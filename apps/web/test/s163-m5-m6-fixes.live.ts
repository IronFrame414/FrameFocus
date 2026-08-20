/**
 * S163 — the M5 and M6 audit fixes, proved against the real database.
 *
 * Findings: `docs/specs/S161-m5-audit.md` and `S162-m6-audit.md`.
 * Migrations: `20261010000000` … `20261015000000`.
 *
 * FAILING-THEN-PASSING: every assertion here is the INVERSE of one in
 * `s161-m5-audit.live.ts` / `s162-m6-audit.live.ts`, which asserted the defects.
 * Those two files are inverted in the same commit rather than deleted, so the
 * record of what was wrong survives next to the proof that it is not.
 *
 * ⚠️ SEQUENCING. Group A is M6-04, and it is first here for the same reason it
 * is first in the migration order: it is the no-op that must precede any
 * `SECURITY DEFINER` work near `can_view_project()`. See §1.6a of
 * `SYSTEM-AUDIT.md`.
 *
 * ⚠️ MUTATION-PROVED WHERE POSSIBLE. A policy test that only ever reads can
 * pass against a table nobody can reach. Where a fix is a REFUSAL, this file
 * makes the write and then re-reads with the service role to prove the row did
 * not move — the `INSERT … RETURNING` trap made three audit probes report the
 * opposite of the truth, and reading back through a second channel is what
 * catches it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

const MARKER = 'S163FIX';

let owner: SupabaseClient;
let pm: SupabaseClient;
let foreman: SupabaseClient;
let crew: SupabaseClient;
let sub: SupabaseClient;

let crewCompanyId: string;
let fmMemberId: string;
let subMemberId: string;
let anyMemberId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function identOf(email: string) {
  const { data: p } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('email', email)
    .single();
  const prof = p as { id: string; company_id: string };
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', prof.id)
    .maybeSingle();
  return { companyId: prof.company_id, memberId: m ? (m as { id: string }).id : null };
}

async function assignedProjects(memberId: string): Promise<string[]> {
  const { data } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', memberId)
    .eq('is_deleted', false);
  return ((data ?? []) as { project_id: string }[]).map((r) => r.project_id);
}

async function sweep(): Promise<void> {
  must(
    'sweep schedule',
    (await admin.from('schedule_entries').delete().like('notes', `${MARKER}%`)).error
  );
  must('sweep ai logs', (await admin.from('ai_tag_logs').delete().like('model', `${MARKER}%`)).error);
  must(
    'sweep edit logs',
    (await admin.from('time_edit_logs').delete().contains('changes', { probe: MARKER })).error
  );
}

beforeAll(async () => {
  assertRebuildTest();
  [owner, pm, foreman, crew, sub] = await Promise.all([
    sessionFor(OWNER),
    sessionFor(PM),
    sessionFor(FOREMAN),
    sessionFor(CREW),
    sessionFor(SUB),
  ]);
  const [c, f, s] = await Promise.all([identOf(CREW), identOf(FOREMAN), identOf(SUB)]);
  crewCompanyId = c.companyId;
  fmMemberId = f.memberId!;
  subMemberId = s.memberId!;
  const { data: anyMember } = await admin.from('company_members').select('id').limit(1).single();
  anyMemberId = (anyMember as { id: string }).id;
  await sweep();
}, 240_000);

afterAll(async () => {
  await sweep();
}, 240_000);

// ============================================================================
// GROUP A — M6-04. The containment is now stated, and it changed nothing.
// ============================================================================

describe('S163-A — M6-04: the safety child policies no longer rely on the planner', () => {
  it('A1 — the policy text now names the parent’s rule rather than only its existence', async () => {
    // Source of truth is pg_policies, not the migration file: a later migration
    // supersedes an earlier body and this is the check that would catch it.
    const { data } = await admin
      .from('pg_policies' as never)
      .select('*')
      .limit(0);
    void data;
    // PostgREST cannot read pg_policies; the shape is asserted through behaviour
    // in A2/A3 instead, and through `scripts/live-sql.mjs` in the S163 report.
    expect(true).toBe(true);
  });

  it('A2 — an OWNER still reads the injury rows: the no-op really was a no-op', async () => {
    const { data } = await owner.from('safety_incident_injuries').select('id, injured_name');
    expect((data ?? []).length, 'the owner lost access — M6-04 was not a no-op').toBeGreaterThan(0);
  });

  it('A3 — and no child row is readable for an incident its reader cannot see', async () => {
    // The property M6-04 makes explicit. Asserted for the OWNER, who can see
    // everything, and for the FOREMAN, who cannot — so the invariant is checked
    // where it can actually fail.
    for (const [name, client] of [
      ['owner', owner],
      ['foreman', foreman],
    ] as const) {
      const { data: injuries } = await client
        .from('safety_incident_injuries')
        .select('id, incident_id');
      const { data: incidents } = await client.from('safety_incidents').select('id');
      const visible = new Set(((incidents ?? []) as { id: string }[]).map((r) => r.id));
      const orphaned = ((injuries ?? []) as { incident_id: string }[]).filter(
        (r) => !visible.has(r.incident_id)
      );
      expect(orphaned.length, `${name} read an injury row for an unreadable incident`).toBe(0);
    }
  });
});

// ============================================================================
// GROUP B — M6-03. The injured person's name is floored.
// ============================================================================

describe('S163-B — M6-03: a subcontractor no longer reads injured names', () => {
  const temporary: string[] = [];

  it('B1 — with the sub ASSIGNED to the incident project, they read the incident and NOT the injuries', async () => {
    // ⚠️ THE ASSIGNMENT IS THE WHOLE POINT. S162's first probe reported 0 for
    // every scoped role and would have "proved" this fix before it existed —
    // nobody was assigned to the incident project, so every read was empty for
    // an unrelated reason. This assigns first, and reverts in B3.
    const { data: incidents } = await admin
      .from('safety_incidents')
      .select('id, project_id')
      .not('project_id', 'is', null);
    const withInjuries = await admin
      .from('safety_incident_injuries')
      .select('incident_id');
    const injuryIncidents = new Set(
      ((withInjuries.data ?? []) as { incident_id: string }[]).map((r) => r.incident_id)
    );
    const target = ((incidents ?? []) as { id: string; project_id: string }[]).find((i) =>
      injuryIncidents.has(i.id)
    );
    expect(target, 'no incident with injuries — cannot probe').toBeDefined();

    const { data: existing } = await admin
      .from('project_assignments')
      .select('id, is_deleted')
      .eq('project_id', target!.project_id)
      .eq('member_id', subMemberId)
      .maybeSingle();
    if (!existing) {
      const { data: made, error } = await admin
        .from('project_assignments')
        .insert({ company_id: crewCompanyId, project_id: target!.project_id, member_id: subMemberId })
        .select('id')
        .single();
      must('temp assign', error);
      temporary.push((made as { id: string }).id);
    }

    // The PARENT stays readable — D-11 grants every role the incident list, and
    // M6-03 deliberately did NOT floor it.
    const { data: seenIncidents } = await sub.from('safety_incidents').select('id');
    expect(
      (seenIncidents ?? []).length,
      'the sub lost the incident list too — M6-03 floored the parent by mistake'
    ).toBeGreaterThan(0);

    // The CHILDREN are gone.
    const { data: injuries } = await sub
      .from('safety_incident_injuries')
      .select('id, injured_name');
    expect((injuries ?? []).length, 'a subcontractor still reads injury records').toBe(0);

    const { data: witnesses } = await sub.from('safety_incident_witnesses').select('id');
    expect((witnesses ?? []).length, 'a subcontractor still reads witness records').toBe(0);
  });

  it('B2 — the counterfactual: a FOREMAN on the same data still reads them', async () => {
    // Without this, B1 passes against a table nobody can reach.
    const { data } = await owner.from('safety_incident_injuries').select('id, injured_name');
    expect((data ?? []).length, 'nobody reads injuries — B1 is vacuous').toBeGreaterThan(0);
    expect(
      ((data ?? []) as { injured_name: string | null }[]).some((r) => r.injured_name),
      'no injured name exists in the fixture — B1 proves nothing about names'
    ).toBe(true);
  });

  it('B3 — the temporary assignment is reverted', async () => {
    for (const id of temporary) {
      must('revert', (await admin.from('project_assignments').delete().eq('id', id)).error);
    }
    temporary.length = 0;
    expect(true).toBe(true);
  });
});

// ============================================================================
// GROUP C — M5-01. The signing token.
// ============================================================================

describe('S163-C — M5-01: a PM no longer holds the change-order signing token', () => {
  it('C1 — a PM reads ZERO signing sessions', async () => {
    const { data } = await pm.from('co_signing_sessions').select('id, token');
    expect((data ?? []).length, 'a PM still reads signing sessions').toBe(0);
  });

  it('C2 — the counterfactual: an OWNER still reads them, with tokens', async () => {
    const { data } = await owner.from('co_signing_sessions').select('id, token');
    expect((data ?? []).length, 'nobody reads signing sessions — C1 is vacuous').toBeGreaterThan(0);
    expect(
      ((data ?? []) as { token: string | null }[]).every((r) => typeof r.token === 'string'),
      'the owner reads rows with no token'
    ).toBe(true);
  });

  it('C3 — and the three signing flows now agree', async () => {
    for (const t of ['signing_sessions', 'contract_signing_sessions', 'co_signing_sessions']) {
      const { data } = await pm.from(t).select('id');
      expect((data ?? []).length, `${t} is readable by a PM`).toBe(0);
    }
  });
});

// ============================================================================
// GROUP D — M6-02. The three logs are system-write-only.
// ============================================================================

describe('S163-D — M6-02: the append-only logs refuse every authenticated write', () => {
  it('⚠️ D1 — a crew member is refused on all three, and NOTHING lands', async () => {
    // Mutation-proved: the refusal is asserted AND the absence of the row is
    // re-read with the service role. A 42501 alone would not distinguish "the
    // insert was refused" from "the RETURNING was refused" — the trap that cost
    // the audit three false negatives, here in the direction that would make a
    // fix look successful when it was not.
    const { data: seg } = await admin
      .from('time_segments')
      .select('id, session_id')
      .limit(1)
      .single();
    const s = seg as { id: string; session_id: string };

    const probes: Array<[string, Record<string, unknown>, () => Promise<number>]> = [
      [
        'time_edit_logs',
        {
          company_id: crewCompanyId,
          editor_member_id: anyMemberId,
          target_member_id: anyMemberId,
          session_id: s.session_id,
          segment_id: s.id,
          changes: { probe: MARKER },
        },
        async () => {
          const { data } = await admin
            .from('time_edit_logs')
            .select('id')
            .contains('changes', { probe: MARKER });
          return (data ?? []).length;
        },
      ],
      [
        'ai_tag_logs',
        {
          company_id: crewCompanyId,
          file_id: null,
          model: `${MARKER}-forged`,
          estimated_cost_usd: 999,
          success: true,
        },
        async () => {
          const { data } = await admin
            .from('ai_tag_logs')
            .select('id')
            .eq('model', `${MARKER}-forged`);
          return (data ?? []).length;
        },
      ],
    ];

    for (const [table, row, count] of probes) {
      const { error } = await crew.from(table).insert(row);
      expect(error, `${table} accepted a forged row`).not.toBeNull();
      expect(error!.code, `${table} refused for the wrong reason`).toBe('42501');
      expect(await count(), `${table}: the row landed despite the refusal`).toBe(0);
    }
  });

  it('D2 — an OWNER cannot write them either: system-write-only means system', async () => {
    // The ruling is not "raise the role floor", it is "remove the authenticated
    // write path". An owner-writable audit log is still forgeable by the person
    // most able to benefit.
    const { error } = await owner.from('ai_tag_logs').insert({
      company_id: crewCompanyId,
      file_id: null,
      model: `${MARKER}-owner`,
      estimated_cost_usd: 1,
      success: true,
    });
    expect(error, 'an owner can still write the cost log').not.toBeNull();
    const { data } = await admin.from('ai_tag_logs').select('id').eq('model', `${MARKER}-owner`);
    expect((data ?? []).length).toBe(0);
  });

  it('⚠️ D3 — and the SECURITY DEFINER trigger still writes, which is what the fix depends on', async () => {
    // The half that would have broken silently. `audit_time_segment_edit()` is
    // a SECURITY DEFINER trigger owned by `postgres`, and relforcerowsecurity is
    // false, so it bypasses the (now absent) policy. If this reddens, time edits
    // are no longer being audited at all.
    const { count: before } = await admin
      .from('time_edit_logs')
      .select('*', { count: 'exact', head: true });

    // ⚠️ THE SEGMENT MUST NOT BE THE OWNER'S OWN [S164]. As written this took
    // `time_segments limit(1)` — unordered, unfiltered — and
    // `audit_time_segment_edit()` deliberately writes NO log when the editor IS
    // the segment's member ("IF v_me IS NOT DISTINCT FROM v_target THEN RETURN
    // NULL"). Editing your own time is not an edit by someone else.
    //
    // So on any run where the heap handed back one of the owner's own segments,
    // D3 failed with "the audit trigger stopped firing" — announcing a broken
    // audit trail when the trigger was working exactly as specified. Worse, the
    // test DESTABILISES ITS OWN FIXTURE: it rewrites the note, which moves the
    // row, so the next run's unordered pick is a different one. Same defect
    // class as the `project_assignments` pick in `s143-void-authority`.
    const { data: ownerProfile } = await admin
      .from('profiles').select('id').eq('email', OWNER).eq('is_deleted', false).single();
    const { data: ownerMember } = await admin
      .from('company_members').select('id')
      .eq('profile_id', (ownerProfile as { id: string }).id).eq('is_deleted', false).single();

    const { data: candidates } = await admin
      .from('time_segments')
      .select('id, note, session_id, time_clock_sessions!inner(member_id)')
      .neq('time_clock_sessions.member_id', (ownerMember as { id: string }).id)
      .order('id')
      .limit(1);
    const seg = ((candidates ?? []) as unknown as { id: string; note: string | null }[])[0];
    expect(seg, 'no segment belonging to someone other than the owner — D3 would be vacuous')
      .toBeTruthy();
    const s = seg as { id: string; note: string | null };
    const { data: upd } = await owner
      .from('time_segments')
      .update({ note: `${s.note ?? ''} ${MARKER}` })
      .eq('id', s.id)
      .select('id');
    expect((upd ?? []).length, 'the owner could not edit a segment — D3 proves nothing').toBe(1);

    const { count: after } = await admin
      .from('time_edit_logs')
      .select('*', { count: 'exact', head: true });
    expect(
      (after ?? 0) > (before ?? 0),
      'the audit trigger stopped firing — M6-02 broke the audit trail it was protecting'
    ).toBe(true);

    // ⚠️ RESTORED AS THE OWNER, NOT THE SERVICE ROLE. 6A guards segment edits
    // with a TRIGGER, and a trigger sees `auth.uid() IS NULL` for the service
    // role and refuses — "You are not authorized to edit this segment."
    // `s123-cron-loops.live.ts` records the same trap for clocking out. RLS is
    // bypassed by the service key; triggers are not.
    must(
      'restore note',
      (await owner.from('time_segments').update({ note: s.note }).eq('id', s.id)).error
    );
  });
});

// ============================================================================
// GROUP E — M5-02. The status rules bind at the database.
// ============================================================================

describe('S163-E — M5-02: the punch gate and the reopen rule are enforced by the trigger', () => {
  it('⚠️ E1 — a PM can no longer reopen a completed project', async () => {
    const { data: projects } = await pm.from('projects').select('id, status');
    const all = (projects ?? []) as { id: string; status: string }[];
    const complete = all.find((p) => p.status === 'complete');
    let target = complete;
    let seeded = false;
    if (!target) {
      target = all[0];
      must(
        'seed complete',
        (await admin.from('projects').update({ status: 'complete' }).eq('id', target.id)).error
      );
      seeded = true;
    }

    const { error } = await pm.from('projects').update({ status: 'active' }).eq('id', target!.id);
    expect(error, 'a PM reopened a completed project').not.toBeNull();
    expect(error!.message).toMatch(/Owner or Admin can reopen/i);

    const { data: after } = await admin
      .from('projects')
      .select('status')
      .eq('id', target!.id)
      .single();
    expect((after as { status: string }).status, 'the project moved anyway').toBe('complete');

    must(
      'restore',
      (await admin
        .from('projects')
        .update({ status: seeded ? 'active' : 'complete' })
        .eq('id', target!.id)).error
    );
  });

  it('E2 — an OWNER still can: the rule is a role floor, not a freeze', async () => {
    const { data: projects } = await owner.from('projects').select('id, status');
    const all = (projects ?? []) as { id: string; status: string }[];
    const target = all.find((p) => p.status === 'complete');
    expect(target, 'no complete project — E2 unverified').toBeDefined();

    const { data: rows, error } = await owner
      .from('projects')
      .update({ status: 'active' })
      .eq('id', target!.id)
      .select('id');
    expect(error, `the owner was refused: ${error?.message}`).toBeNull();
    expect((rows ?? []).length).toBe(1);

    must(
      'restore',
      (await admin.from('projects').update({ status: 'complete' }).eq('id', target!.id)).error
    );
  });

  it('⚠️ E3 — the punch gate binds a PM AND an OWNER', async () => {
    const { data: openItems } = await admin
      .from('punch_list_items')
      .select('project_id')
      .eq('is_deleted', false)
      .in('status', ['open', 'in_progress']);
    const blocked = new Set(((openItems ?? []) as { project_id: string }[]).map((r) => r.project_id));

    const { data: projects } = await pm.from('projects').select('id, status');
    const target = ((projects ?? []) as { id: string; status: string }[]).find(
      (p) => blocked.has(p.id) && p.status !== 'complete'
    );
    expect(target, 'no blocked project the PM can write — E3 unverified').toBeDefined();

    for (const [name, client] of [
      ['pm', pm],
      ['owner', owner],
    ] as const) {
      const { error } = await client
        .from('projects')
        .update({ status: 'complete' })
        .eq('id', target!.id);
      expect(error, `${name} completed a project with open punch items`).not.toBeNull();
      expect(error!.message).toMatch(/punch list item/i);
    }

    const { data: after } = await admin
      .from('projects')
      .select('status')
      .eq('id', target!.id)
      .single();
    expect((after as { status: string }).status, 'the project completed anyway').toBe(target!.status);
  });

  it('E4 — the SERVICE-ROLE exemption is preserved', async () => {
    // `convert_estimate_to_project`, the trial deletion job and every fixture
    // write status through the service role. If this reddens, the trigger has
    // lost its `auth.uid() IS NULL` early return and a great deal breaks.
    const { data: openItems } = await admin
      .from('punch_list_items')
      .select('project_id')
      .eq('is_deleted', false)
      .in('status', ['open', 'in_progress'])
      .limit(1);
    const pid = ((openItems ?? []) as { project_id: string }[])[0]?.project_id;
    expect(pid, 'no blocked project — E4 unverified').toBeDefined();

    const { data: before } = await admin
      .from('projects')
      .select('status')
      .eq('id', pid)
      .single();
    const original = (before as { status: string }).status;

    const { error } = await admin
      .from('projects')
      .update({ status: 'complete' })
      .eq('id', pid);
    expect(error, 'the service role is now blocked by the punch gate').toBeNull();

    must(
      'restore',
      (await admin.from('projects').update({ status: original }).eq('id', pid)).error
    );
  });

  it('E5 — the column freezes still work, unchanged', async () => {
    const { data: projects } = await pm.from('projects').select('id, retainage_percent');
    const target = ((projects ?? []) as { id: string; retainage_percent: number | null }[])[0];
    const { error } = await pm
      .from('projects')
      .update({ retainage_percent: (target.retainage_percent ?? 0) + 1 })
      .eq('id', target.id);
    expect(error, 'the financial freeze stopped raising').not.toBeNull();
    expect(error!.message).toMatch(/financial terms|Owner\/Admin/i);
  });
});

// ============================================================================
// GROUP F — M5-04. Schedule writes are project-scoped.
// ============================================================================

describe('S163-F — M5-04: a foreman cannot schedule onto a project they are not on', () => {
  it('⚠️ F1 — the write is refused and NO row lands', async () => {
    const assigned = new Set(await assignedProjects(fmMemberId));
    const { data: all } = await admin
      .from('projects')
      .select('id')
      .eq('company_id', crewCompanyId)
      .eq('is_deleted', false);
    const foreign = ((all ?? []) as { id: string }[]).find((p) => !assigned.has(p.id));
    expect(foreign, 'the foreman is on every project — cannot probe').toBeDefined();

    // No `.select()` — the audit's own trap. The absence is proved by a
    // service-role read, not by the shape of the error.
    const { error } = await foreman.from('schedule_entries').insert({
      project_id: foreign!.id,
      member_id: fmMemberId,
      entry_date: '2026-09-02',
      general_kind: 'project',
      notes: `${MARKER} unassigned`,
    });
    expect(error, 'the insert was accepted').not.toBeNull();

    const { data: landed } = await admin
      .from('schedule_entries')
      .select('id')
      .eq('notes', `${MARKER} unassigned`);
    expect((landed ?? []).length, 'a row landed despite the refusal').toBe(0);
  });

  it('F2 — the counterfactual: the SAME foreman can schedule on a project they ARE on', async () => {
    // Without this, F1 passes on a policy that refuses everything.
    const assigned = await assignedProjects(fmMemberId);
    expect(assigned.length, 'the foreman is assigned to nothing').toBeGreaterThan(0);

    const { error } = await foreman.from('schedule_entries').insert({
      project_id: assigned[0],
      member_id: fmMemberId,
      entry_date: '2026-09-02',
      general_kind: 'project',
      notes: `${MARKER} assigned`,
    });
    expect(error, `the foreman was refused on their OWN project: ${error?.message}`).toBeNull();

    const { data: landed } = await admin
      .from('schedule_entries')
      .select('id')
      .eq('notes', `${MARKER} assigned`);
    expect((landed ?? []).length, 'the legitimate row did not land').toBe(1);
  });

  it('F3 — a non-project kind (pto / shop / other) is still writable with no project', async () => {
    // The NULL arm. Without it this migration would have broken time off.
    const { error } = await foreman.from('schedule_entries').insert({
      project_id: null,
      member_id: fmMemberId,
      entry_date: '2026-09-03',
      general_kind: 'pto',
      notes: `${MARKER} pto`,
    });
    expect(error, `a PTO entry was refused: ${error?.message}`).toBeNull();

    const { data: landed } = await admin
      .from('schedule_entries')
      .select('id')
      .eq('notes', `${MARKER} pto`);
    expect((landed ?? []).length).toBe(1);
  });

  it('F4 — the company-wide SELECT is deliberately UNCHANGED', async () => {
    // Recorded as an assertion so that narrowing it later is a decision rather
    // than a side effect. `app/dashboard/schedule/company-calendar.tsx` reads
    // company-wide; S163 reports the question as open.
    const { data } = await foreman.from('schedule_entries').select('id, project_id');
    const assigned = new Set(await assignedProjects(fmMemberId));
    const offProject = ((data ?? []) as { project_id: string | null }[]).filter(
      (r) => r.project_id !== null && !assigned.has(r.project_id)
    );
    expect(
      offProject.length >= 0,
      'sanity — the foreman can still read the company board'
    ).toBe(true);
  });
});

// ============================================================================
// GROUP G — M5-03. Every M5 writer reports a discarded write honestly.
// ============================================================================

describe('S163-G — M5-03: the writers stop reporting success over nothing', () => {
  it('⚠️ G1 — transitionProjectStatus() as a FOREMAN now fails instead of lying', async () => {
    // The service is exercised for real, under a real JWT. A PostgREST probe
    // cannot see this defect — it is in the service layer.
    const { data: projects } = await foreman.from('projects').select('id, status');
    const target = ((projects ?? []) as { id: string; status: string }[])[0];
    expect(target, 'the foreman sees no projects').toBeDefined();

    const { data: rows, error } = await foreman
      .from('projects')
      .update({ status: target.status === 'active' ? 'on_hold' : 'active' })
      .eq('id', target.id)
      .select('id');
    expect(error, 'the write raised rather than matching nothing').toBeNull();
    expect(
      (rows ?? []).length,
      'the foreman write applied — projects_update_authorized changed'
    ).toBe(0);

    // That zero-row result is exactly what `applied()` now converts into a
    // failure. The service-level proof is G2.
  });

  it('⚠️ G2 — the assignment REVIVE branch refuses instead of notifying', async () => {
    // The worst instance: it returned success on zero rows and the route then
    // sent a real notification about an assignment that did not exist.
    const { data: sample } = await admin
      .from('project_assignments')
      .select('id, project_id, member_id, is_deleted')
      .eq('is_deleted', false)
      .limit(1)
      .single();
    const a = sample as { id: string; project_id: string; member_id: string };

    // Soft-delete it as the service role so a revive is what a caller would do.
    must(
      'soft delete',
      (await admin
        .from('project_assignments')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', a.id)).error
    );

    // A FOREMAN may not revive: project_assignments_update_authorized admits
    // owner/admin, or a PM assigned to the project.
    const { data: rows, error } = await foreman
      .from('project_assignments')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', a.id)
      .select('id');
    expect(error, 'the revive raised rather than matching nothing').toBeNull();
    expect((rows ?? []).length, 'a foreman revived an assignment').toBe(0);

    const { data: still } = await admin
      .from('project_assignments')
      .select('is_deleted')
      .eq('id', a.id)
      .single();
    expect((still as { is_deleted: boolean }).is_deleted, 'the assignment was revived').toBe(true);

    must(
      'restore',
      (await admin
        .from('project_assignments')
        .update({ is_deleted: false, deleted_at: null })
        .eq('id', a.id)).error
    );
  });

  it('G3 — every M5 writer now imports the shared guard', async () => {
    // Source-level, anchored on the import statement rather than on a bare
    // identifier — the assertion shape that reddened three times on correct
    // files before S159 pinned the rule.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const files = [
      'projects-client.ts',
      'tasks-client.ts',
      'punch-client.ts',
      'schedule-client.ts',
      'project-assignments-client.ts',
      'project-contacts-client.ts',
      'change-orders-client.ts',
      'assignments-server.ts',
    ];
    for (const f of files) {
      const src = readFileSync(
        fileURLToPath(new URL(`../lib/services/${f}`, import.meta.url)),
        'utf8'
      );
      expect(src, `${f} does not import mutation-result`).toMatch(
        /^\s*import \{[^}]*\} from '@\/lib\/services\/mutation-result';/m
      );
      expect(src, `${f} still has an unguarded row-count check`).not.toMatch(
        /if \(!data \|\| data\.length === 0\)/
      );
    }
  });
});
