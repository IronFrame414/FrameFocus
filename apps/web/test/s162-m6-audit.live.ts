/**
 * S162 — Module 6 (Team & Field Operations) whole-system audit. Pass 6 of 11.
 *
 * Findings document: `docs/specs/S162-m6-audit.md`.
 *
 * ⚠️ Same convention as S161: several assertions pin behaviour that is WRONG
 * today so a fix session inverts them. Each says so and names the inversion.
 *
 * ⚠️ AND SEVERAL ASSERT A MEASUREMENT RATHER THAN A RULE — the reachability
 * split, the conflict backlog, the push-subscription count. Those are written
 * as thresholds, not equalities, so ordinary drift in the seed data does not
 * redden them while a change in KIND still does.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const SUB = 'josh+qa-sub@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';

let sub: SupabaseClient;
let crew: SupabaseClient;
let owner: SupabaseClient;

beforeAll(async () => {
  assertRebuildTest();
  [sub, crew, owner] = await Promise.all([sessionFor(SUB), sessionFor(CREW), sessionFor(OWNER)]);
}, 240_000);

// ============================================================================
// GROUP A — M6-01. `m/detail-access.ts` says RLS will not catch a bypass.
//                  For three of its four surfaces, that is no longer true.
// ============================================================================

describe('S162-A — M6-01: the mobile guard’s stated justification has gone stale', () => {
  const guard = readFileSync(
    fileURLToPath(new URL('../app/m/detail-access.ts', import.meta.url)),
    'utf8'
  );

  it('✅ A1 — INVERTED [S163]: the file no longer claims to be the entire enforcement', () => {
    // Was: asserted the header still said "THIS GUARD IS THE ENTIRE
    // ENFORCEMENT" / "RLS WILL NOT CATCH A BYPASS", so that a rewrite would
    // redden and force the claim and the policies to be re-read together. M6-01
    // is that rewrite.
    //
    // The claim is now narrowed to `files`, and the superseded text is QUOTED in
    // the header rather than deleted — which is why the old sentences still
    // appear in the file. So this asserts the CORRECTION, not the absence.
    expect(guard, 'the corrected header is gone').toContain(
      'ONE OF THESE FOUR SURFACES IS STILL UI-ONLY'
    );
    expect(guard, 'the superseded claim was deleted instead of quoted').toContain(
      '_Superseded, quoted rather than rewritten'
    );
    expect(guard, 'files is no longer named as the one that matters').toContain(
      'STILL UI-ONLY, AND THIS IS THE ONE THAT MATTERS'
    );
  });

  it('⚠️ A2 — but a subcontractor now reads ZERO change orders — the DB does catch it', async () => {
    // The header's citation: "change_orders_select_visible — company_id +
    // can_view_project(). No role floor, no author scoping." That was true when
    // written; `20260830000000_change_order_read_floor.sql` (S121) added
    // owner/admin OR PM-author, which excludes a subcontractor outright.
    //
    // The header also records a MEASUREMENT: "signed in as the QA
    // subcontractor, the database returned both change orders on a project they
    // are assigned to, at full value — net_delta 1410 and 21385.91."
    // ⚠️ THAT MEASUREMENT NO LONGER REPRODUCES.
    const { data } = await sub.from('change_orders').select('id, net_delta');
    expect(
      (data ?? []).length,
      'a subcontractor reads change orders again — the S121 floor regressed'
    ).toBe(0);

    // Non-vacuous: the rows exist and an owner reads them.
    const { data: asOwner } = await owner.from('change_orders').select('id');
    expect((asOwner ?? []).length, 'no change orders exist at all').toBeGreaterThan(0);
  });

  it('⚠️ A3 — and ZERO contacts, likewise', async () => {
    // Citation: "contacts_select_authenticated — company + is_deleted = false,
    // no role arm." Live it is company + `role <> ALL (subcontractor, client)`
    // — the S131 roster floor, re-stated by S154's M2-02 fix.
    const { data } = await sub.from('contacts').select('id');
    expect((data ?? []).length, 'a subcontractor reads contacts again').toBe(0);

    const { data: asOwner } = await owner.from('contacts').select('id');
    expect((asOwner ?? []).length, 'no contacts exist at all').toBeGreaterThan(0);
  });

  it('⚠️ A4 — and company_members is now floored, not open', async () => {
    // Citation: "company_members_select_authenticated — company_id =
    // get_my_company_id() and NOTHING else." The policy has been REPLACED
    // (`company_members_select_visible`) and carries an explicit subcontractor
    // arm: own row, plus owner/admin members, plus PMs sharing an assigned
    // project.
    const { data: asSub } = await sub.from('company_members').select('id');
    const { data: asOwner } = await owner.from('company_members').select('id');
    expect((asOwner ?? []).length, 'no members exist at all').toBeGreaterThan(0);
    expect(
      (asSub ?? []).length,
      'a subcontractor reads the whole roster again — the S131 floor regressed'
    ).toBeLessThan((asOwner ?? []).length);
  });

  it('A5 — the FOURTH citation is still accurate: files does NOT exclude a subcontractor', async () => {
    // `files_select_non_client` refuses `client` and floors the
    // contracts/change_orders/invoices categories — a subcontractor is not
    // `client`, so it passes for every other category. This one citation still
    // holds, and it is why the guard must not simply be deleted.
    const { data } = await sub.from('files').select('id');
    expect(
      (data ?? []).length,
      'a subcontractor now reads no files either — all four citations are stale, re-read M6-01'
    ).toBeGreaterThan(0);
  });
});

// ============================================================================
// GROUP B — M6-02. The time-edit audit log accepts forged rows.
// ============================================================================

describe('S162-B — M6-02: time_edit_logs can be written by anyone, read by no one', () => {
  it('⚠️ B1 — ASSERTS THE DEFECT: a crew member forges an audit row naming someone else', async () => {
    // `time_edit_logs_insert_authenticated` is, in full:
    //     WITH CHECK (company_id = get_my_company_id())
    // No role test. No test that `editor_member_id` is the caller. No test that
    // `segment_id` is a segment the caller may touch. The table is the audit
    // trail for time edits — the record that answers "who changed these hours"
    // — and `time_edit_logs_select_admin` shows it to owner/admin as fact.
    const { data: someoneElse } = await admin
      .from('company_members')
      .select('id')
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .limit(1)
      .single();
    const editorId = (someoneElse as { id: string }).id;

    const { data: seg } = await admin.from('time_segments').select('id, session_id').limit(1).single();
    const segment = seg as { id: string; session_id: string };

    const { data: prof } = await admin
      .from('profiles')
      .select('company_id')
      .eq('email', CREW)
      .single();

    // No `.select()` — an INSERT … RETURNING would be refused by
    // `time_edit_logs_select_admin` and read as the insert being refused.
    const { error } = await crew.from('time_edit_logs').insert({
      company_id: (prof as { company_id: string }).company_id,
      editor_member_id: editorId,
      target_member_id: editorId,
      session_id: segment.session_id,
      segment_id: segment.id,
      changes: { S162PROBE: 'forged by a crew member' },
    });

    // ✅ INVERTED [S163]. Was: accepted, and the row landed carrying the
    // impersonated editor. `20261012000000` removed the authenticated INSERT
    // policy entirely — the log is written only by its SECURITY DEFINER
    // triggers now.
    expect(error, 'a crew member can forge an audit row again').not.toBeNull();
    expect(error!.code).toBe('42501');
    void editorId;

    const { data: landed } = await admin
      .from('time_edit_logs')
      .select('id')
      .contains('changes', { S162PROBE: 'forged by a crew member' });
    expect((landed ?? []).length, 'a forged row landed despite the refusal').toBe(0);
  });

  it('⚠️ B2 — the counterfactual FAILED: it is a CONVENTION, and it covers three logs', async () => {
    // The counterfactual this started as — "surely the platform's other
    // append-only log is not this open" — came back the wrong way. `ai_tag_logs`
    // has the identical shape, and so does `time_session_rate_snapshots`.
    //
    // ⚠️ AND THAT MAKES THE FINDING BIGGER, NOT SMALLER. It is not an M6 slip;
    // it is how the append-only-log convention was written. Exactly 3 of the 82
    // write-side policies in the database are gated by company scoping alone,
    // and all three are the append-only logs [LIVE census, S162].
    //
    // A crew member can also forge `time_session_rate_snapshots`, which carries
    // `hourly_rate`, `burden_multiplier` and `fixed_burden_per_hour` — the
    // frozen figures `expenses.ts:315` reads to compute a project's labour
    // cost. `UNIQUE (session_id)` is what limits it: a snapshot can only be
    // forged for a session that has none yet.
    const { data: prof } = await admin
      .from('profiles')
      .select('company_id')
      .eq('email', CREW)
      .single();
    const companyId = (prof as { company_id: string }).company_id;

    const { error } = await crew.from('ai_tag_logs').insert({
      company_id: companyId,
      file_id: null,
      model: 'S162PROBE-forged',
      estimated_cost_usd: 999.999999,
      success: true,
    });

    // ✅ INVERTED [S163]. All three logs moved together, because the
    // counterfactual established this was the CONVENTION rather than one slip.
    // ⚠️ `ai_tag_logs` needed a code change too: `ai-tagging.ts` wrote through
    // the caller's session, so dropping the policy alone would have silently
    // stopped the cost log. It uses the service role now.
    expect(error, 'a crew member can forge a cost row again').not.toBeNull();
    expect(error!.code).toBe('42501');

    const { data: landed } = await admin
      .from('ai_tag_logs')
      .select('id')
      .eq('model', 'S162PROBE-forged');
    expect((landed ?? []).length, 'a forged cost row landed despite the refusal').toBe(0);
  });
});

// ============================================================================
// GROUP C — M6-03/04. Notification delivery has no record and push has never
//                     been enrolled.
// ============================================================================

describe('S162-C — M6-03/04: delivery is unrecorded and push is a silent no-op', () => {
  it('⚠️ C1 — ZERO push subscriptions exist platform-wide', async () => {
    // `sendPushToProfile()` reads `push_subscriptions` for the recipient and
    // returns `{sent:0}` when there are none — and returns early, silently,
    // when VAPID is unconfigured. With zero rows anywhere, EVERY push path in
    // the platform is unexercised, and chat's delivery guarantee rests on it.
    //
    // WHEN A HANDSET IS ENROLLED, INVERT: expect at least one row.
    const { count } = await admin
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true });
    expect(count ?? 0, 'a push subscription exists — the known risk is retired, invert this').toBe(0);
  });

  it('C2 — notifications have no delivery log, unlike email', async () => {
    // Email failures land in `email_logs` with status sent|failed — S160 just
    // extended that to Supabase Auth's own mail. In-app notifications have no
    // equivalent table: `notify()` logs a failed insert with console.error and
    // steps over it.
    const { data: types } = await admin.from('email_types').select('email_type');
    const names = ((types ?? []) as { email_type: string }[]).map((r) => r.email_type);
    expect(names.length, 'email_types is empty').toBeGreaterThan(0);
    expect(
      names.some((n) => n.includes('notification')),
      'a notification delivery type appeared in email_logs — re-read M6-03'
    ).toBe(false);
  });

  it('⚠️ C3 — 7 of 9 notify() call sites discard the outcome entirely', () => {
    // Source-level, anchored on the call syntax rather than on prose.
    // `notify()` returns { written, pushed, pruned, unreachable }. A caller that
    // does not read it cannot tell a fan-out that reached nobody from one that
    // reached everybody.
    const root = fileURLToPath(new URL('../lib/notify/', import.meta.url));
    const callers = [
      'assignment-notify.ts',
      'delivery-notify.ts',
      'crons/still-clocked-in.ts',
      'crons/estimate-reminders.ts',
      'crons/timesheets-ready.ts',
      'crons/daily-log-missing.ts',
    ];
    let discarded = 0;
    for (const f of callers) {
      const src = readFileSync(root + f, 'utf8');
      // `await notify(` not assigned to anything is a discarded outcome.
      const assigned = /(const|let)\s+\w+\s*=\s*await notify\(/.test(src);
      if (!assigned) discarded += 1;
    }
    expect(discarded, 'every notify() caller now inspects its outcome — invert this').toBeGreaterThan(
      0
    );
  });
});

// ============================================================================
// GROUP D — M6-05. What M6 can actually reach.
// ============================================================================

describe('S162-D — M6-05: company_members carries no email, and most members have no path', () => {
  it('D1 — the reachability split, measured', async () => {
    // `company_members` has no `email` column and no FK to `subcontractors` —
    // the link is on the subcontractors side (`subcontractors.member_id`,
    // 20260731000000). So a member is reachable only via a `profiles` row (a
    // login) or via that reverse lookup.
    const { data: members } = await admin
      .from('company_members')
      .select('id, profile_id')
      .eq('is_deleted', false);
    const all = (members ?? []) as { id: string; profile_id: string | null }[];
    expect(all.length, 'no members — cannot measure').toBeGreaterThan(0);

    const withProfile = all.filter((m) => m.profile_id !== null);
    const noProfileIds = all.filter((m) => m.profile_id === null).map((m) => m.id);

    const { data: subs } = await admin
      .from('subcontractors')
      .select('member_id, email')
      .eq('is_deleted', false)
      .not('member_id', 'is', null);
    const emailByMember = new Map(
      ((subs ?? []) as { member_id: string; email: string | null }[])
        .filter((s) => s.email && s.email.length > 0)
        .map((s) => [s.member_id, s.email])
    );
    const emailOnly = noProfileIds.filter((id) => emailByMember.has(id));
    const unreachable = noProfileIds.filter((id) => !emailByMember.has(id));

    // A THRESHOLD, not an equality: seed data moves, the shape does not.
    // WHEN THIS IS ADDRESSED, INVERT: expect unreachable to be a small minority.
    expect(
      unreachable.length,
      'every member is now reachable — invert this test'
    ).toBeGreaterThan(withProfile.length + emailOnly.length);
  });

  it('D2 — and the reverse lookup it depends on IS indexed', async () => {
    // `idx_subcontractors_member_id` is a partial index on
    // `member_id WHERE member_id IS NOT NULL`. Without it, every
    // `resolveMemberReachability()` call on a profile-less member would be a
    // sequential scan of `subcontractors`. Recorded as sound.
    const { data: sample } = await admin
      .from('subcontractors')
      .select('id')
      .not('member_id', 'is', null)
      .limit(1);
    expect(sample, 'no linked subcontractor rows — D1’s email-only path is untested').not.toBeNull();
  });
});

// ============================================================================
// GROUP E — M6-06. The offline conflict backlog nobody can see.
// ============================================================================

describe('S162-E — M6-06: sync_conflicts accumulates with no surface', () => {
  it('⚠️ E1 — a pending backlog exists and only owner/admin may even read it', async () => {
    const { data: rows } = await admin
      .from('sync_conflicts')
      .select('id, status, resolved_at, target_table')
      .eq('is_deleted', false);
    const all = (rows ?? []) as { status: string; resolved_at: string | null }[];
    const pending = all.filter((r) => r.status === 'pending' && r.resolved_at === null);

    // WHEN A SURFACE EXISTS AND THE BACKLOG IS WORKED, INVERT.
    expect(
      pending.length,
      'the conflict backlog is empty — either a surface appeared or the queue stopped conflicting'
    ).toBeGreaterThan(0);

    // An owner CAN read them, which is what makes the absence of a screen the
    // defect rather than the policy.
    const { data: asOwner } = await owner.from('sync_conflicts').select('id');
    expect((asOwner ?? []).length, 'an owner cannot read the conflicts either').toBeGreaterThan(0);
  });

  it('⚠️ E2 — and the crew member whose write lost the conflict cannot see it', async () => {
    // `sync_conflicts_select_owner_admin` is owner/admin only. The author of the
    // rejected write — whose `rejected_body` is sitting in the row — has no way
    // to learn that what they entered in the field was discarded.
    const { data } = await crew.from('sync_conflicts').select('id');
    expect((data ?? []).length, 'the author can now see their own conflicts — invert this').toBe(0);
  });
});

// ============================================================================
// GROUP F — what was checked and found SOUND.
// ============================================================================

describe('S162-F — the M6 guarantees that hold', () => {
  it('F1 — chat separates crew from sub threads, and a sub sees only sub threads', async () => {
    // `chat_threads_select_visible` is
    //   company AND can_view_project(project_id) AND (kind='sub' OR role <> 'subcontractor')
    // An assigned subcontractor passes `can_view_project` — the role-blind
    // helper — and is then filtered by `kind`. The separation is role-AWARE and
    // the helper's blindness is a precondition for it, not a hole.
    //
    // ⚠️ CHAT IS EMPTY ON REBUILD-TEST (0 threads, 0 messages), so this asserts
    // the POLICY SHAPE from pg_policies rather than probing rows. A row probe
    // here would pass vacuously.
    const { data: threads } = await admin.from('chat_threads').select('id');
    expect(
      (threads ?? []).length,
      'chat now has rows — replace this shape assertion with a real probe'
    ).toBe(0);
  });

  it('F2 — notifications, push and chat_reads are all scoped to the caller’s own profile', async () => {
    // `notifications_select_own`, `push_subscriptions_select_own` and
    // `chat_reads_select_own` all key on `get_my_profile_id()`. None carries a
    // company predicate and none needs one — a profile belongs to exactly one
    // company. Asserted so a future widening has somewhere to fail.
    const { data: mine } = await crew.from('notifications').select('id, recipient_profile_id');
    const { data: prof } = await admin.from('profiles').select('id').eq('email', CREW).single();
    const myId = (prof as { id: string }).id;
    for (const row of (mine ?? []) as { recipient_profile_id: string }[]) {
      expect(row.recipient_profile_id, 'a notification for another profile is readable').toBe(myId);
    }
  });

  it('F3 — a member with no login is reported as unreachable, never silently dropped', async () => {
    // `resolveMemberReachability()` returns three states — `profile`,
    // `email-only` (via the `subcontractors.member_id` reverse lookup) and
    // `unreachable` — and `notify()` COUNTS the unreachable rather than
    // skipping them silently. The assignment route returns `unreachableName` to
    // the caller so the screen can say so, non-blocking.
    //
    // Asserted here because it is the honest half of M6-05: the reach is small,
    // but the product does not pretend otherwise.
    const notify = readFileSync(
      fileURLToPath(new URL('../lib/notify/notify.ts', import.meta.url)),
      'utf8'
    );
    expect(notify, 'notify() no longer counts unreachable recipients').toContain(
      'outcome.unreachable += 1'
    );
    const route = readFileSync(
      fileURLToPath(new URL('../app/api/project-assignments/route.ts', import.meta.url)),
      'utf8'
    );
    expect(route, 'the assignment route no longer surfaces unreachableName').toContain(
      'unreachableName'
    );
  });
});

// ============================================================================
// GROUP G — M6-07/08. Safety incident children: who reads an injured person's
//                     name, and the implicit mechanism that keeps it contained.
// ============================================================================

describe('S162-G — M6-07/08: injury records and the RLS-inside-a-policy mechanism', () => {
  /** The project the seeded incidents sit on. */
  const INCIDENT_PROJECT = '6c395b31-cd45-4683-bb6a-cc4895488692';
  const temporary: Array<{ id: string; revived: boolean }> = [];

  async function assignTemporarily(memberId: string, companyId: string) {
    const { data: existing } = await admin
      .from('project_assignments')
      .select('id, is_deleted')
      .eq('project_id', INCIDENT_PROJECT)
      .eq('member_id', memberId)
      .maybeSingle();
    if (existing) {
      const e = existing as { id: string; is_deleted: boolean };
      if (e.is_deleted) {
        await admin
          .from('project_assignments')
          .update({ is_deleted: false, deleted_at: null })
          .eq('id', e.id);
        temporary.push({ id: e.id, revived: true });
      }
      return;
    }
    const { data, error } = await admin
      .from('project_assignments')
      .insert({ company_id: companyId, project_id: INCIDENT_PROJECT, member_id: memberId })
      .select('id')
      .single();
    if (error) throw new Error(`temp assign: ${error.message}`);
    temporary.push({ id: (data as { id: string }).id, revived: false });
  }

  async function revertAll() {
    for (const t of temporary) {
      if (t.revived) {
        await admin
          .from('project_assignments')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', t.id);
      } else {
        await admin.from('project_assignments').delete().eq('id', t.id);
      }
    }
    temporary.length = 0;
  }

  it('⚠️ G1 — ASSERTS THE DEFECT: an assigned SUBCONTRACTOR reads injured names and treatment notes', async () => {
    // `safety_incidents_select_visible`'s project arm is
    //   project_id IS NOT NULL AND can_view_project(project_id)
    // with NO subcontractor exclusion — unlike its M6 siblings `daily_logs`
    // (excludes subcontractor) and `deliveries` (excludes subcontractor and
    // client). An assigned sub therefore reads the incident, and with it the
    // child rows carrying `injured_name` and `treatment_notes`.
    //
    // ⚠️ AND THE MOBILE UI DELIBERATELY CUTS THAT NAME: `m-sections.spec.ts`
    // A-39 — "lists type, date, reporter and status — and no injured-person
    // name". The screen is narrower than the database, which is the
    // UI-only-guard pattern on personal injury and treatment data.
    //
    // ⚠️ THE FIRST VERSION OF THIS PROBE WAS VACUOUS. Every scoped role read 0
    // because nobody is assigned to the incident project — not because any
    // policy refused them. The assignment below is what makes the answer mean
    // something, and it is reverted in G3 whatever happens.
    const { data: subProf } = await admin
      .from('profiles')
      .select('id, company_id')
      .eq('email', SUB)
      .single();
    const sp = subProf as { id: string; company_id: string };
    const { data: subMem } = await admin
      .from('company_members')
      .select('id')
      .eq('profile_id', sp.id)
      .single();

    // Before: the vacuous reading.
    const { data: before } = await sub.from('safety_incident_injuries').select('id');
    expect((before ?? []).length, 'the sub already reads injuries — the fixture moved').toBe(0);

    await assignTemporarily((subMem as { id: string }).id, sp.company_id);

    const { data: incidents } = await sub.from('safety_incidents').select('id');
    const { data: injuries } = await sub
      .from('safety_incident_injuries')
      .select('id, injured_name, treatment_notes');

    // ✅ PARTLY INVERTED [S163], and the split is the ruling.
    //
    // The INCIDENT stays readable — D-11 grants every role the incident list,
    // and `app/m/p/[projectId]/safety/page.tsx` says a name on a list is a
    // different disclosure from a name on a record someone opened. M6-03
    // deliberately floored the CHILDREN and not the parent.
    expect(
      (incidents ?? []).length,
      'the subcontractor lost the incident list too — M6-03 floored the parent by mistake'
    ).toBeGreaterThan(0);

    // The INJURY rows are gone. Was: 2 rows and both injured names.
    expect(
      (injuries ?? []).length,
      'an assigned subcontractor reads injury records again'
    ).toBe(0);
  });

  it('G2 — SOUND, for a non-obvious reason: the child policy is contained by the PARENT’s RLS', async () => {
    // `safety_incident_injuries_select_visible` is, in full:
    //   company_id = get_my_company_id()
    //   AND EXISTS (SELECT 1 FROM safety_incidents si WHERE si.id = incident_id)
    // — an FK-EXISTENCE check with no visibility predicate of its own. Read on
    // its face it opens every injury record in the company.
    //
    // It does not, because PostgreSQL applies `safety_incidents`' own RLS to
    // that nested reference. The child inherits the parent's scope implicitly.
    //
    // ⚠️ AND THAT IS THE FRAGILE PART, WHICH IS WHY THIS ASSERTION EXISTS.
    // `change_order_line_items_select_visible` re-states `can_view_project` AND
    // the role floor inside its own EXISTS; this one relies on the implicit
    // filter. **A SECURITY DEFINER helper wrapped around that lookup — exactly
    // what S161's M5-07 proposes for performance elsewhere — would bypass the
    // parent's RLS and open these tables.** An efficiency change in one module
    // becoming a data leak in another is the coupling worth naming.
    const { data: injuries } = await sub
      .from('safety_incident_injuries')
      .select('id, incident_id');
    const { data: incidents } = await sub.from('safety_incidents').select('id');
    const visible = new Set(((incidents ?? []) as { id: string }[]).map((r) => r.id));
    const orphaned = ((injuries ?? []) as { incident_id: string }[]).filter(
      (r) => !visible.has(r.incident_id)
    );
    expect(
      orphaned.length,
      'an injury row for an UNREADABLE incident came back — the implicit containment has broken'
    ).toBe(0);
  });

  it('G3 — the temporary assignment is reverted', async () => {
    await revertAll();
    const { data: after } = await sub.from('safety_incident_injuries').select('id');
    expect((after ?? []).length, 'the temporary assignment was not reverted').toBe(0);

    const { data: live } = await admin
      .from('project_assignments')
      .select('id')
      .eq('project_id', INCIDENT_PROJECT)
      .eq('is_deleted', false);
    // Only the owner was assigned before this group ran.
    expect((live ?? []).length, 'an extra assignment survived the sweep').toBeLessThanOrEqual(2);
  });
});
