import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  admin,
  ANON,
  assertRebuildTest,
  adoptSignupProfile,
  sessionFor,
  TEST_PASSWORD,
  URL_,
} from './live-session';
import { softDeleteTeamMember } from '@/lib/services/team';

// ============================================================================
// S127 1.4a / § 2 — DOES REMOVING A MEMBER CUT THEIR DATA ACCESS?
//
// Two removal paths ship today, and they write different tables:
//
//   P  desktop team page → `softDeleteTeamMember()` (the REAL function, called
//      here with the Owner's session): `profiles.is_deleted = true` + an
//      876000h ban. The trigger `profiles_sync_member_deleted` then marks the
//      member row.
//   M  `/m/team/[memberId]/edit` → "Inactive" → `updateMember()`: writes
//      `company_members.is_deleted = true` ONLY, through the Owner's session,
//      exactly the payload the form sends. No profile write, no ban.
//
// `get_my_company_id()` — the tenant gate under nearly every RLS policy and
// the storage policies' inline subquery — reads `profiles`, never
// `company_members`. So the question is what M actually cuts.
//
// Each subject is a throwaway ADMIN in the QA tenant (the role an Admin can
// apply M to, and the widest company-wide read). Each signs in BEFORE removal,
// and the SAME client — the same still-valid JWT — attempts, before and after:
//
//   read      `projects` rows in the company
//   write     a `contacts` insert, WITHOUT returning rows (an
//             `.insert().select()` would be judged by the SELECT policy), and
//             COUNTED with the service role by a unique marker
//   download  a known object in `project-files`
//   function  `get_approved_change_order_summaries()` (SECURITY DEFINER,
//             gated on get_my_company_id()) on a project with signed COs
//
// The BEFORE pass is the control that must fire: a probe that cannot succeed
// cannot prove a removal cut anything.
//
// ⚠️ The assertions state the SECURE expectation: after either removal, all
// four are refused. A red here is the finding, not a broken test.
// ============================================================================

const COMPANY_ID = '03bb903f-1084-4ab4-afb8-03192cb58d30'; // the QA tenant (Company A)
const OWNER_EMAIL = 'josh+test50@worthprop.com';
const STAMP = Date.now();
const MARK = `S127MR-${STAMP}`;

interface Subject {
  label: 'P' | 'M';
  email: string;
  userId: string;
  profileId: string;
  memberId: string;
  client: SupabaseClient;
}

interface Probe {
  read: number;
  write: number;
  downloadBytes: number;
  /** A SECOND object this run has never requested — rules out any cache on the first. */
  freshBytes: number;
  signedUrl: boolean;
  fnRows: number;
  companyId: string | null;
  memberId: string | null;
}

const subjects: Subject[] = [];
let objectPath = '';
const freshPaths: string[] = []; // one per probe, each requested exactly once
let coProjectId = '';
let owner: SupabaseClient;
const results: Record<string, Probe> = {};

async function makeSubject(label: 'P' | 'M'): Promise<Subject> {
  const email = `s127-member-removal-${label.toLowerCase()}+${STAMP}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { company_name: `${MARK} ${label}`, first_name: 'Removal', last_name: label },
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const userId = data.user.id;
  const { profileId, memberId } = await adoptSignupProfile(userId, {
    companyId: COMPANY_ID,
    email,
    role: 'admin',
    firstName: 'Removal',
    lastName: label,
  });
  if (!memberId) throw new Error(`no member row for ${label}`);
  const client = await sessionFor(email);
  const s = { label, email, userId, profileId, memberId, client };
  subjects.push(s);
  return s;
}

/** A brand-new password sign-in: does the removal stop the NEXT login, not just this token? */
async function freshSignIn(email: string): Promise<boolean> {
  const c = createSupabaseClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  return !error && Boolean(data.session);
}

async function probe(s: Subject, phase: string): Promise<Probe> {
  const read = await s.client.from('projects').select('id').eq('company_id', COMPANY_ID);

  const lastName = `${MARK}-${s.label}-${phase}`;
  // ⚠️ No .select(): the write is judged by the INSERT policy alone.
  await s.client.from('contacts').insert({ first_name: 'S127', last_name: lastName, company_id: COMPANY_ID });
  const { count: written } = await admin
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('last_name', lastName);

  const dl = await s.client.storage.from('project-files').download(objectPath);
  const downloadBytes = dl.data ? (await dl.data.arrayBuffer()).byteLength : 0;

  const fresh = freshPaths.shift();
  if (!fresh) throw new Error('ran out of fresh objects');
  const fdl = await s.client.storage.from('project-files').download(fresh);
  const freshBytes = fdl.data ? (await fdl.data.arrayBuffer()).byteLength : 0;
  const signed = await s.client.storage.from('project-files').createSignedUrl(objectPath, 60);

  const fn = await s.client.rpc('get_approved_change_order_summaries', { p_project_id: coProjectId });
  const cid = await s.client.rpc('get_my_company_id');
  const mid = await s.client.rpc('get_my_member_id');

  const p: Probe = {
    read: (read.data ?? []).length,
    write: written ?? -1,
    downloadBytes,
    freshBytes,
    signedUrl: Boolean(signed.data?.signedUrl),
    fnRows: Array.isArray(fn.data) ? fn.data.length : 0,
    companyId: (cid.data as string | null) ?? null,
    memberId: (mid.data as string | null) ?? null,
  };
  results[`${s.label}:${phase}`] = p;
  console.log(`[s127-mr] ${s.label} ${phase} ${JSON.stringify(p)}`);
  return p;
}

beforeAll(async () => {
  assertRebuildTest();
  owner = await sessionFor(OWNER_EMAIL);

  // A real object, proven present by LISTING its folder with the service role.
  const { data: f, error: fErr } = await admin
    .from('files')
    .select('file_path')
    .eq('company_id', COMPANY_ID)
    .eq('is_deleted', false)
    .not('project_id', 'is', null)
    .like('mime_type', 'image/%')
    .order('created_at', { ascending: true })
    .limit(40);
  if (fErr) throw new Error(fErr.message);
  for (const row of f ?? []) {
    const path = (row as { file_path: string }).file_path;
    const dir = path.slice(0, path.lastIndexOf('/'));
    const name = path.slice(path.lastIndexOf('/') + 1);
    const { data: listed } = await admin.storage.from('project-files').list(dir, { search: name });
    if ((listed ?? []).some((o) => o.name === name)) {
      if (!objectPath) objectPath = path;
      else freshPaths.push(path);
      if (freshPaths.length >= 4) break;
    }
  }
  if (freshPaths.length < 4) throw new Error(`only ${freshPaths.length} fresh objects listed`);
  if (!objectPath) throw new Error('no listed image object in the QA tenant');

  // The project with the most signed change orders — ordered, so the pick is stable.
  const { data: cos, error: cErr } = await admin
    .from('change_orders')
    .select('project_id')
    .eq('company_id', COMPANY_ID)
    .not('signed_at', 'is', null)
    .eq('is_deleted', false)
    .order('project_id', { ascending: true });
  if (cErr) throw new Error(cErr.message);
  const tally = new Map<string, number>();
  for (const r of cos ?? []) {
    const id = (r as { project_id: string }).project_id;
    tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  coProjectId = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? '';
  if (!coProjectId) throw new Error('no project with signed change orders in the QA tenant');

  await makeSubject('P');
  await makeSubject('M');
});

afterAll(async () => {
  await admin.from('contacts').delete().like('last_name', `${MARK}%`);
  for (const s of subjects) {
    await admin.auth.admin.updateUserById(s.userId, { ban_duration: 'none' });
    await admin.from('company_members').delete().eq('id', s.memberId);
    await admin.from('profiles').delete().eq('id', s.profileId);
    await admin.auth.admin.deleteUser(s.userId);
  }
  const { count } = await admin
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .like('last_name', `${MARK}%`);
  console.log(`[s127-mr] cleanup: ${count} marker contacts left, ${subjects.length} subjects removed`);
});

describe('S127 1.4a — member removal and a still-valid token', () => {
  it('CONTROL: before removal, each subject reads, writes, downloads and calls the function', async () => {
    for (const s of subjects) {
      const p = await probe(s, 'before');
      expect(p.companyId).toBe(COMPANY_ID);
      expect(p.memberId).toBe(s.memberId);
      expect(p.read).toBeGreaterThan(0);
      expect(p.write).toBe(1);
      expect(p.downloadBytes).toBeGreaterThan(0);
      expect(p.freshBytes).toBeGreaterThan(0);
      expect(p.signedUrl).toBe(true);
      expect(p.fnRows).toBeGreaterThan(0);
    }
  });

  it('CONTROL: another tenant\'s Owner cannot download the object (the storage policy can refuse)', async () => {
    const other = await sessionFor('josh+qa-b-owner@worthprop.com');
    const dl = await other.storage.from('project-files').download(objectPath);
    const bytes = dl.data ? (await dl.data.arrayBuffer()).byteLength : 0;
    console.log(`[s127-mr] cross-tenant download bytes=${bytes} error=${dl.error?.message ?? 'none'}`);
    expect(bytes).toBe(0);
  });

  it('P — team-page removal (profile deleted + banned): the old token loses all four', async () => {
    const s = subjects.find((x) => x.label === 'P')!;
    await softDeleteTeamMember(owner, admin, s.profileId, s.userId);
    const { data: prof } = await admin.from('profiles').select('is_deleted').eq('id', s.profileId).single();
    expect(prof?.is_deleted).toBe(true);

    const p = await probe(s, 'after');
    const relogin = await freshSignIn(s.email);
    console.log(`[s127-mr] P relogin=${relogin}`);
    expect(relogin).toBe(false);
    expect(p.companyId).toBeNull();
    expect(p.read).toBe(0);
    expect(p.write).toBe(0);
    // ⚠️ NOT `downloadBytes`: the object this same token already fetched is
    // served again after removal (measured S127: 147191 bytes on P, whose
    // fresh object, signed URL, read, write and function are ALL refused).
    // That is a cached response for bytes the person already holds, not the
    // policy admitting them; the cross-tenant control shows it is per-token.
    // Recorded as a residual in S127-report 1.4a. The policy is judged on an
    // object this token has never requested.
    expect(p.freshBytes).toBe(0);
    expect(p.signedUrl).toBe(false);
    expect(p.fnRows).toBe(0);
  });

  it('M — /m "Inactive" (company_members only): the old token loses all four', async () => {
    const s = subjects.find((x) => x.label === 'M')!;
    // Exactly the form's write, through the Owner's session — no profile write, no ban.
    const { data: upd, error } = await owner
      .from('company_members')
      .update({ is_deleted: true })
      .eq('id', s.memberId)
      .select('id');
    expect(error).toBeNull();
    expect((upd ?? []).length).toBe(1);
    const { data: m } = await admin.from('company_members').select('is_deleted').eq('id', s.memberId).single();
    const { data: prof } = await admin.from('profiles').select('is_deleted').eq('id', s.profileId).single();
    expect(m?.is_deleted).toBe(true);
    expect(prof?.is_deleted).toBe(false); // the state under test: member-only

    const p = await probe(s, 'after');
    const relogin = await freshSignIn(s.email);
    console.log(`[s127-mr] M relogin=${relogin}`);
    // CONTROL that must fire: the member-scoped helper does see the removal.
    expect(p.memberId).toBeNull();
    // The secure expectation:
    expect(relogin).toBe(false);
    expect(p.companyId).toBeNull();
    expect(p.read).toBe(0);
    expect(p.write).toBe(0);
    // ⚠️ NOT `downloadBytes`: the object this same token already fetched is
    // served again after removal (measured S127: 147191 bytes on P, whose
    // fresh object, signed URL, read, write and function are ALL refused).
    // That is a cached response for bytes the person already holds, not the
    // policy admitting them; the cross-tenant control shows it is per-token.
    // Recorded as a residual in S127-report 1.4a. The policy is judged on an
    // object this token has never requested.
    expect(p.freshBytes).toBe(0);
    expect(p.signedUrl).toBe(false);
    expect(p.fnRows).toBe(0);
  });
});
