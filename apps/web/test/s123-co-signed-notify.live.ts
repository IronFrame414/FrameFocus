import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest } from './live-session';
import { notifyCoSignedInApp } from '@/lib/services/co-signing-service';
import {
  getManagerNotifyRecipients,
  getProjectPmNotifyRecipients,
  profileForUserId,
} from '@/lib/notify/recipients';

// ============================================================================
// NOTIFICATIONS SLICE 4 — §3e, the Estimate/CO-signed split. THE R7 CASE.
// Spec: docs/specs/notifications-architecture.md §3e, ND-8, R7. No migration.
// ============================================================================
//
// ---------------------------------------------------------------------------
// WHAT MAKES THIS TRACE DIFFERENT FROM SLICE 3'S
// ---------------------------------------------------------------------------
// An incident carries no money, so every recipient legitimately got identical
// bytes and R7 was satisfied trivially. A signed CO does carry money, and §3e
// splits it three ways:
//
//   Owner / Admin      title WITH the amount, linked
//   the CO's author    title WITH the amount, linked
//   other project PMs  title WITHOUT the amount, and NO LINK
//
// So this is the first place the same notify() call must produce DIFFERENT
// STORED ROWS. Every assertion below is about the difference, because a build
// that renders once and reuses the result passes every "the Owner sees the
// amount" test ever written and leaks the figure to the PM.
//
// ---------------------------------------------------------------------------
// THE FIXTURE IS BUILT AND TORN DOWN HERE
// ---------------------------------------------------------------------------
// A signed CO with a known net_delta, a known author and a PM assigned to its
// project does not exist in the seed data, and asserting a redaction rule
// against whatever happens to be in the database is how a test ends up passing
// because the figure was null all along.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_EMAIL = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';

type Profile = { id: string; user_id: string; email: string; role: string; company_id: string };
const byEmail = new Map<string, Profile>();
const pid = (email: string) => byEmail.get(email)!.id;

let companyId: string;
let projectId: string;
let coId: string;
let pmMemberId: string;

const madeNotifications: string[] = [];
const madeAssignments: string[] = [];
let madeCo = false;

const NET_DELTA = 4200;

async function rows() {
  const { data, error } = await admin
    .from('notifications')
    .select('id, recipient_profile_id, title, link_key, link_params, type')
    .eq('source_id', coId);
  if (error) throw new Error(`rows: ${error.message}`);
  for (const r of data ?? []) if (!madeNotifications.includes(r.id)) madeNotifications.push(r.id);
  return data ?? [];
}

const rowFor = (all: Awaited<ReturnType<typeof rows>>, email: string) =>
  all.find((r) => r.recipient_profile_id === pid(email));

beforeAll(async () => {
  assertRebuildTest();

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, user_id, email, role, company_id')
    .in('email', [OWNER, ADMIN_EMAIL, PM, FOREMAN])
    .eq('is_deleted', false);
  for (const p of (profiles ?? []) as Profile[]) byEmail.set(p.email, p);
  companyId = byEmail.get(OWNER)!.company_id;

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .limit(1)
    .single();
  projectId = project!.id;

  // The PM must be ASSIGNED to the project, or the "other project PMs" audience
  // is empty and the no-amount branch is never exercised — the test would pass
  // by having nobody to leak to.
  const { data: pmMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', pid(PM))
    .maybeSingle();
  pmMemberId = pmMember!.id;

  const { data: existing } = await admin
    .from('project_assignments')
    .select('id')
    .eq('project_id', projectId)
    .eq('member_id', pmMemberId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (!existing) {
    const { data: created, error } = await admin
      .from('project_assignments')
      .insert({ company_id: companyId, project_id: projectId, member_id: pmMemberId })
      .select('id')
      .single();
    if (error) throw new Error(`fixture project_assignment: ${error.message}`);
    madeAssignments.push(created!.id);
  }

  // The CO is AUTHORED BY THE PM on purpose. §3e's author audience only means
  // something when the author is somebody the manager rule would not already
  // have included — an Owner-authored CO makes the author branch invisible.
  const { data: co, error: coError } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId,
      project_id: projectId,
      co_number: 'CO-S123-TEST',
      title: 'Harness CO — s123-co-signed-notify.live.ts',
      status: 'signed',
      net_delta: NET_DELTA,
      // TWO author columns exist and they are not interchangeable.
      // `author_member_id` is NOT NULL and is the member-keyed attribution;
      // `created_by` is the USER id, and it is the one the S121 read floor
      // tests (`change_orders_select_visible` … `get_my_role() =
      // 'project_manager' AND created_by = auth.uid()`). §3e's author audience
      // has to key on the same column the floor does, or the notification and
      // the permission disagree about who the author is.
      author_member_id: pmMemberId,
      created_by: byEmail.get(PM)!.user_id,
    })
    .select('id')
    .single();
  if (coError) throw new Error(`fixture change_order: ${coError.message}`);
  coId = co!.id;
  madeCo = true;
});

afterAll(async () => {
  if (madeNotifications.length) {
    await admin.from('notifications').delete().in('id', madeNotifications);
  }
  if (madeCo) await admin.from('change_orders').delete().eq('id', coId);
  if (madeAssignments.length) {
    await admin.from('project_assignments').delete().in('id', madeAssignments);
  }
});

describe('the recipient resolvers', () => {
  it('managers are Owner and Admin, as profile-keyed recipients', async () => {
    const managers = await getManagerNotifyRecipients(admin, companyId);
    expect(new Set(managers.map((m) => m.role))).toEqual(new Set(['owner', 'admin']));
    expect(managers.every((m) => Boolean(m.profileId))).toBe(true);
    expect(managers.map((m) => m.profileId)).toContain(pid(OWNER));
  });

  it('project PMs come back for the assigned project, and only PMs', async () => {
    const pms = await getProjectPmNotifyRecipients(admin, projectId);
    expect(pms.map((p) => p.profileId)).toContain(pid(PM));
    expect(pms.every((p) => p.role === 'project_manager')).toBe(true);
    // The foreman may or may not be assigned; either way they are not a PM and
    // must not appear.
    expect(pms.map((p) => p.profileId)).not.toContain(pid(FOREMAN));
  });

  it('created_by is a USER id and resolves through to a PROFILE', async () => {
    // The hop that, done wrong, compares a user id against a profile id — always
    // false, and it silently demotes the author into the no-amount audience.
    const author = await profileForUserId(admin, byEmail.get(PM)!.user_id);
    expect(author?.profileId).toBe(pid(PM));
    expect(author?.profileId).not.toBe(byEmail.get(PM)!.user_id);
    expect(await profileForUserId(admin, null)).toBeNull();
  });
});

describe('§3e — one call, three audiences, different stored bytes', () => {
  beforeAll(async () => {
    await notifyCoSignedInApp(admin, { changeOrderId: coId, signerName: 'Ruiz' });
  });

  it('Owner and Admin get the amount, and a link', async () => {
    const all = await rows();
    for (const email of [OWNER, ADMIN_EMAIL]) {
      const row = rowFor(all, email);
      expect(row, `${email} must have a row`).toBeDefined();
      expect(row!.title).toContain('$4,200');
      expect(row!.link_key).toBe('co');
      expect(row!.link_params).toMatchObject({ id: coId, projectId });
    }
  });

  it('THE AUTHOR gets the amount even though they are only a PM', async () => {
    // A PM cannot see other people's COs — but they can see their OWN, which is
    // exactly what the S121 floor says. Dropping the author branch would redact
    // the figure from the person who typed it in.
    const row = rowFor(await rows(), PM);
    expect(row).toBeDefined();
    expect(row!.title).toContain('$4,200');
    expect(row!.link_key).toBe('co');
  });

  it('ND-8 — a NON-AUTHOR PM gets no amount and NO LINK', async () => {
    // Re-authored to the Owner so the PM stops being the author and becomes the
    // third audience. Same CO, same recipients, different branch.
    //
    // `author_member_id` is deliberately LEFT pointing at the PM. The row now
    // disagrees with itself about who wrote it, which is the point: the floor
    // keys on `created_by`, so §3e must too. A build that read the member column
    // would keep giving this PM the amount and pass every other test here.
    await admin
      .from('change_orders')
      .update({ created_by: byEmail.get(OWNER)!.user_id })
      .eq('id', coId);
    await admin.from('notifications').delete().eq('source_id', coId);

    await notifyCoSignedInApp(admin, { changeOrderId: coId, signerName: 'Ruiz' });
    const all = await rows();

    const pmRow = rowFor(all, PM);
    expect(pmRow, 'the assigned PM must still be notified').toBeDefined();
    // THE LEAK THIS FILE EXISTS FOR. The figure must not be in the stored row at
    // all — not hidden at render time, not nulled in the payload. Not written.
    expect(pmRow!.title).not.toContain('4,200');
    expect(pmRow!.title).not.toContain('$');
    // A link would resolve to a row the floor forbids them to SELECT — a 404
    // dressed as a notification. §10.1 renders a null link as a non-button.
    expect(pmRow!.link_key).toBeNull();

    // Paired positive: the Owner still gets both, so the redaction removed the
    // figure from one audience rather than from everybody.
    const ownerRow = rowFor(all, OWNER);
    expect(ownerRow!.title).toContain('$4,200');
    expect(ownerRow!.link_key).toBe('co');
  });

  it('the two audiences really are different rows from ONE call', async () => {
    const all = await rows();
    const titles = new Set(all.map((r) => r.title));
    // Two distinct renderings, produced per recipient. A render() called once
    // and reused would give a set of size 1 here and leak in whichever
    // direction it happened to render.
    expect(titles.size).toBe(2);
    expect(all.every((r) => r.type === 'signed')).toBe(true);
  });

  it('foreman and crew receive nothing for a signed CO', async () => {
    const all = await rows();
    expect(rowFor(all, FOREMAN)).toBeUndefined();
  });
});
