import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import {
  resolveThread,
  postableSet,
  canPostInThread,
  subThreadProjects,
} from '@/lib/chat/threads';
import { insertMessage } from '@/lib/chat/messages';

// ============================================================================
// CHAT slice 4 — the SUB THREAD, driven against rebuild-test.
// Spec: §5.2, §5.3, §7.4, A-C1…A-C10, ND-20, ND-25. Spec @ spec/chat-s124 4b61b9d.
// ============================================================================

const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';

/** QA A — crew, PM, foreman and the one profiled sub are all assigned. */
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';
/** kitchen test — NO assigned sub with a profile. ND-25's negative case. */
const PROJECT_NO_SUB = '6c395b31-cd45-4683-bb6a-cc4895488692';

let ownerC: SupabaseClient<Database>;
let crewC: SupabaseClient<Database>;
let subC: SupabaseClient<Database>;
let pmC: SupabaseClient<Database>;
let foremanC: SupabaseClient<Database>;
let companyId: string;

async function cleanup() {
  await admin.from('chat_threads').delete().in('project_id', [PROJECT, PROJECT_NO_SUB]);
}

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, crewC, subC, pmC, foremanC] = await Promise.all([
    sessionFor(OWNER),
    sessionFor(CREW),
    sessionFor(SUB),
    sessionFor(PM),
    sessionFor(FOREMAN),
  ]);
  const { data } = await admin.from('profiles').select('company_id').eq('email', OWNER).single();
  companyId = (data as { company_id: string }).company_id;
  await cleanup();
});

afterAll(cleanup);

// ---------------------------------------------------------------------------
// ND-25 — does the sub thread exist at all?
// ---------------------------------------------------------------------------
describe('ND-25 — no sub thread where no assigned sub has a profile', () => {
  it('a project WITH a profiled sub offers it; one without does NOT', async () => {
    const forOwner = await subThreadProjects(ownerC);
    expect(forOwner.has(PROJECT), 'QA A has the profiled sub assigned').toBe(true);
    // ⚠️ THE NEGATIVE IS THE CRITERION. Without it a build that returns every
    // project passes the positive half and renders a sub thread everywhere —
    // "no thread, not an empty one" (ND-25) inverted.
    expect(forOwner.has(PROJECT_NO_SUB), 'kitchen test has no profiled sub').toBe(false);
  });

  it('a CREW member gets the same answer as the Owner', async () => {
    // The reason chat_sub_thread_exists is SECURITY DEFINER: a crew member
    // cannot necessarily read the subcontractor's profiles row, so an INVOKER
    // version would say "no sub thread" to exactly the readers §7.4's banner is
    // written for. The thread would exist for Owners and vanish for crew, which
    // is a divergence in what EXISTS rather than in what is permitted.
    const forCrew = await subThreadProjects(crewC);
    expect(forCrew.has(PROJECT)).toBe(true);
    expect(forCrew.has(PROJECT_NO_SUB)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A-C6 / A-C7's policy half — read wide, write narrow
// ---------------------------------------------------------------------------
describe('§5.2 — the divergence, through the code the app calls', () => {
  it('A-C6 — crew CAN read the sub thread and CANNOT post in it', async () => {
    const subThread = await resolveThread(ownerC, PROJECT, 'sub');
    expect(subThread).not.toBeNull();

    await insertMessage(ownerC, {
      threadId: subThread!.id,
      authorProfileId: (await profileId(OWNER)),
      body: 'owner message in the sub thread',
    });

    // Read: crew resolve the same thread row and see the message.
    const asCrew = await resolveThread(crewC, PROJECT, 'sub');
    expect(asCrew?.id).toBe(subThread!.id);
    const { data: visible } = await crewC
      .from('chat_messages')
      .select('id')
      .eq('thread_id', subThread!.id);
    expect((visible ?? []).length).toBeGreaterThan(0);

    // Write: refused by the database, not by the UI.
    const denied = await insertMessage(crewC, {
      threadId: subThread!.id,
      authorProfileId: await profileId(CREW),
      body: 'crew attempting to post in the sub thread',
    });
    expect(denied.success).toBe(false);
    expect(denied.denied, 'RLS refusal must be typed as denied, not a generic error').toBe(true);
  });

  it('⚠️ chat_can_post AGREES WITH A REAL INSERT for every role', async () => {
    // This is the test that keeps `chat_can_post` honest. The function mirrors
    // chat_messages_insert_authorized so the composer can be ABSENT rather than
    // disabled (D-54) — and a mirror that nobody checks is exactly how two
    // definitions of one rule drift apart. If someone edits the policy and not
    // the function, this fails.
    const subThread = await resolveThread(ownerC, PROJECT, 'sub');
    const crewThread = await resolveThread(ownerC, PROJECT, 'crew');

    const cases: Array<[string, SupabaseClient<Database>, string, string]> = [
      ['owner/sub', ownerC, subThread!.id, OWNER],
      ['owner/crew', ownerC, crewThread!.id, OWNER],
      ['crew/sub', crewC, subThread!.id, CREW],
      ['crew/crew', crewC, crewThread!.id, CREW],
      ['sub/sub', subC, subThread!.id, SUB],
      ['pm/sub', pmC, subThread!.id, PM],
      ['foreman/sub', foremanC, subThread!.id, FOREMAN],
      ['foreman/crew', foremanC, crewThread!.id, FOREMAN],
    ];

    for (const [label, client, threadId, email] of cases) {
      const predicted = await canPostInThread(client, threadId);
      const attempt = await insertMessage(client, {
        threadId,
        authorProfileId: await profileId(email),
        body: `agreement probe — ${label}`,
      });
      expect(attempt.success, `${label}: chat_can_post said ${predicted}`).toBe(predicted);
    }
  });

  it('A-C10 — crew are NOT in the sub thread mention picker', async () => {
    const subThread = await resolveThread(ownerC, PROJECT, 'sub');
    const candidates = await postableSet(admin, subThread!, companyId);
    const ids = new Set(candidates.map((c) => c.profileId));

    expect(ids.has(await profileId(CREW)), 'crew cannot post here, so mentioning them is a dead end').toBe(false);
    expect(ids.has(await profileId(FOREMAN)), 'foreman are readers only in the sub thread').toBe(false);
    // The positive half, so the assertion above cannot pass on an empty set.
    expect(ids.has(await profileId(SUB))).toBe(true);
    expect(ids.has(await profileId(OWNER))).toBe(true);
  });

  it('A-C3 — a crew-thread message never appears in the sub thread', async () => {
    const crewThread = await resolveThread(ownerC, PROJECT, 'crew');
    const subThread = await resolveThread(ownerC, PROJECT, 'sub');
    const body = `crew-only ${Date.now()}`;
    await insertMessage(ownerC, {
      threadId: crewThread!.id,
      authorProfileId: await profileId(OWNER),
      body,
    });

    const { data: inSub } = await ownerC
      .from('chat_messages')
      .select('body')
      .eq('thread_id', subThread!.id);
    expect((inSub ?? []).map((m) => m.body)).not.toContain(body);
  });

  it('A-C5 — a subcontractor cannot SELECT any crew-thread message', async () => {
    const crewThread = await resolveThread(ownerC, PROJECT, 'crew');
    const { data } = await subC.from('chat_messages').select('id').eq('thread_id', crewThread!.id);
    expect((data ?? []).length).toBe(0);
    // And they cannot even resolve the thread — the absolute in §5.2's table.
    expect(await resolveThread(subC, PROJECT, 'crew')).toBeNull();
  });
});

const profileCache = new Map<string, string>();
async function profileId(email: string): Promise<string> {
  const hit = profileCache.get(email);
  if (hit) return hit;
  const { data } = await admin.from('profiles').select('id').eq('email', email).single();
  const id = (data as { id: string }).id;
  profileCache.set(email, id);
  return id;
}
