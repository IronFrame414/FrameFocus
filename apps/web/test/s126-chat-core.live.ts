import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { resolveThread, postableSet } from '@/lib/chat/threads';
import {
  insertMessage,
  insertMentions,
  messagesSince,
  recentMessages,
  markThreadRead,
  withAuthors,
} from '@/lib/chat/messages';
import { adminAuthorResolver } from '@/lib/chat/authors';
import { parseMentions } from '@/lib/chat/mentions';
import { switcherThreads, groupByProject } from '@/lib/chat/switcher';
import { notifyMentions } from '@/lib/chat/mention-notify';

// ============================================================================
// CHAT slice 2 — the lib/ core, DRIVEN AGAINST rebuild-test.
// ============================================================================
//
// The unit suite covers the parser and nothing else. Everything in threads.ts,
// messages.ts and mention-notify.ts type-checks and, until this file, had never
// executed against a database. This is what turns slice 2 from written into
// verified.
//
// Every service function here is given a REAL SESSION CLIENT, so slice 1's RLS
// is what decides — the same policies the probes exercised, now reached through
// the code the app will actually call.

const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

/** Project A — crew, PM, owner and the one profiled sub are all assigned. */
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

let crewC: SupabaseClient<Database>;
let subC: SupabaseClient<Database>;
let ownerC: SupabaseClient<Database>;
let companyId: string;
let crewProfileId: string;
let ownerProfileId: string;

const runStart = new Date().toISOString();

async function cleanup() {
  // chat_messages and chat_message_mentions cascade from the thread.
  await admin.from('chat_threads').delete().eq('project_id', PROJECT);
  await admin.from('notifications').delete().eq('type', 'mention').gte('created_at', runStart);
}

beforeAll(async () => {
  assertRebuildTest();
  [crewC, subC, ownerC] = (await Promise.all([
    sessionFor(CREW),
    sessionFor(SUB),
    sessionFor(OWNER),
  ])) as SupabaseClient<Database>[];

  const { data } = await admin
    .from('profiles')
    .select('id, email, company_id')
    .in('email', [CREW, OWNER]);
  crewProfileId = data!.find((p) => p.email === CREW)!.id;
  ownerProfileId = data!.find((p) => p.email === OWNER)!.id;
  companyId = data!.find((p) => p.email === CREW)!.company_id;

  await cleanup();
});

afterAll(cleanup);

describe('resolveThread — lazy creation, under the caller RLS', () => {
  it('crew creates the crew thread on first use, and gets the same row twice', async () => {
    const first = await resolveThread(crewC, PROJECT, 'crew');
    expect(first, 'crew must be able to open the crew thread').not.toBeNull();
    expect(first!.kind).toBe('crew');

    // Idempotent: the second call must return the SAME row, not a duplicate.
    // UNIQUE (project_id, kind) is the guarantee; this proves the code honours
    // it rather than erroring on the conflict.
    const second = await resolveThread(crewC, PROJECT, 'crew');
    expect(second!.id).toBe(first!.id);

    const { count } = await admin
      .from('chat_threads')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', PROJECT)
      .eq('kind', 'crew');
    expect(count).toBe(1);
  });

  it('⚠️ a subcontractor gets NULL for the crew thread — ND-19, through the code path', async () => {
    // The probes proved the policy. This proves the SERVICE FUNCTION surfaces it
    // as a real answer rather than throwing or, worse, returning a thread the
    // caller cannot post in.
    const t = await resolveThread(subC, PROJECT, 'crew');
    expect(t).toBeNull();
  });

  it('a subcontractor CAN resolve their own sub thread', async () => {
    // Paired positive — without it the test above passes on a build where
    // resolveThread returns null for everyone.
    const t = await resolveThread(subC, PROJECT, 'sub');
    expect(t).not.toBeNull();
    expect(t!.kind).toBe('sub');
  });
});

describe('postableSet — POSTABLE, not readable', () => {
  it('crew are absent from the SUB thread candidates', async () => {
    const sub = await resolveThread(ownerC, PROJECT, 'sub');
    const candidates = await postableSet(admin, sub!, companyId);
    const ids = candidates.map((c) => c.profileId);

    // §3d — crew read the sub thread and cannot post, so being mentionable
    // there is a dead end.
    expect(ids).not.toContain(crewProfileId);
    // Paired positive: the Owner IS postable there, so the set is not empty.
    expect(ids).toContain(ownerProfileId);
  });

  it('crew ARE present in the crew thread candidates', async () => {
    const crew = await resolveThread(ownerC, PROJECT, 'crew');
    const ids = (await postableSet(admin, crew!, companyId)).map((c) => c.profileId);
    expect(ids).toContain(crewProfileId);
  });
});

describe('the send path, end to end', () => {
  it('crew posts, and the message comes back', async () => {
    const thread = await resolveThread(crewC, PROJECT, 'crew');
    const sent = await insertMessage(crewC, {
      threadId: thread!.id,
      authorProfileId: crewProfileId,
      body: 'running short on trim, need about 3 more sticks',
    });
    expect(sent.success, sent.error).toBe(true);

    const rows = await recentMessages(crewC, thread!.id);
    expect(rows.map((r) => r.id)).toContain(sent.id);

    // ⚠️ THE NAME NO LONGER COMES OFF THIS CALL [Ruling B, S131]. `recentMessages`
    // used to embed `author:profiles(...)`, which ran as the CALLER and so was
    // filtered by the caller's roster floor — a subcontractor reading another
    // sub's message got a bubble with no name and no error. Names are now a
    // decoration resolved through the service role, so the undecorated row is
    // `author: null` BY DESIGN and asserting otherwise here would be asserting
    // the bug back.
    expect(rows[rows.length - 1].author, 'undecorated rows carry no name').toBeNull();

    // The criterion this test actually exists for — a name reaches the reader —
    // asserted where it now lives.
    const named = await withAuthors(rows, adminAuthorResolver(admin as SupabaseClient<Database>));
    expect(named[named.length - 1].author).not.toBeNull();
    expect(named[named.length - 1].author!.first_name.length).toBeGreaterThan(0);
  });

  it('⚠️ crew CANNOT post in the sub thread, and the failure is typed as denied', async () => {
    const sub = await resolveThread(ownerC, PROJECT, 'sub');
    const sent = await insertMessage(crewC, {
      threadId: sub!.id,
      authorProfileId: crewProfileId,
      body: 'crew must not be able to post here',
    });
    expect(sent.success).toBe(false);
    // The route maps `denied` to 403 rather than 400 — CLAUDE.md's rule that a
    // permission failure never wears another status.
    expect(sent.denied).toBe(true);
  });

  it('you cannot post as somebody else', async () => {
    // author_profile_id = get_my_profile_id() in the INSERT policy. Without it a
    // member could write a message attributed to anyone in the company.
    const thread = await resolveThread(crewC, PROJECT, 'crew');
    const forged = await insertMessage(crewC, {
      threadId: thread!.id,
      authorProfileId: ownerProfileId, // crew claiming to be the Owner
      body: 'forged authorship',
    });
    expect(forged.success).toBe(false);
    expect(forged.denied).toBe(true);
  });
});

describe('messagesSince — the poll, and it is not a refetch', () => {
  it('returns ONLY messages newer than the one held', async () => {
    const thread = await resolveThread(crewC, PROJECT, 'crew');

    const first = await insertMessage(crewC, {
      threadId: thread!.id,
      authorProfileId: crewProfileId,
      body: 'poll fixture — first',
    });
    expect(first.success).toBe(true);

    const before = await recentMessages(crewC, thread!.id);
    const watermark = before[before.length - 1].created_at;

    // A refetch would return `before.length + 1`. Since-based returns exactly 1.
    const second = await insertMessage(crewC, {
      threadId: thread!.id,
      authorProfileId: crewProfileId,
      body: 'poll fixture — second',
    });
    expect(second.success).toBe(true);

    const delta = await messagesSince(crewC, thread!.id, watermark);
    expect(delta).toHaveLength(1);
    expect(delta[0].id).toBe(second.id);
    expect(delta[0].body).toBe('poll fixture — second');
  });

  it('a quiet thread polls EMPTY, not the page again', async () => {
    // The property that makes a 12-second interval affordable: an idle thread
    // costs one empty result per poll regardless of how long its history is.
    const thread = await resolveThread(crewC, PROJECT, 'crew');
    const all = await recentMessages(crewC, thread!.id);
    const newest = all[all.length - 1].created_at;
    expect(await messagesSince(crewC, thread!.id, newest)).toHaveLength(0);
  });
});

describe('mentions and notify() — the whole pipeline', () => {
  it('a mention writes the join row AND a notification; a plain message writes neither', async () => {
    const thread = await resolveThread(crewC, PROJECT, 'crew');
    const candidates = await postableSet(admin, thread!, companyId);

    // --- plain message first: R6 says it notifies nobody ---
    const plainSince = new Date().toISOString();
    const plain = await insertMessage(crewC, {
      threadId: thread!.id,
      authorProfileId: crewProfileId,
      body: 'no tag here, nobody should be told',
    });
    const plainParse = parseMentions('no tag here, nobody should be told', candidates, crewProfileId);
    expect(plainParse.profileIds).toEqual([]);

    const { count: plainRows } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'mention')
      .gte('created_at', plainSince);
    expect(plainRows ?? 0, 'a plain message must notify nobody — R6').toBe(0);

    // --- now the tagged one ---
    const body = '@Josh running short on trim, need about 3 more sticks';
    const parse = parseMentions(body, candidates, crewProfileId);
    expect(parse.profileIds, 'the Owner must be mentionable in the crew thread').toContain(
      ownerProfileId
    );

    const sent = await insertMessage(crewC, {
      threadId: thread!.id,
      authorProfileId: crewProfileId,
      body,
    });
    expect(sent.success, sent.error).toBe(true);

    const stored = await insertMentions(crewC, sent.id!, parse.profileIds);
    expect(stored.error ?? null).toBeNull();
    expect(stored.inserted).toBe(parse.profileIds.length);

    const outcome = await notifyMentions({
      admin,
      companyId,
      projectId: PROJECT,
      projectName: 'Alvarez',
      threadId: thread!.id,
      kind: 'crew',
      messageId: sent.id!,
      authorName: 'Casey Crew',
      body,
      mentioned: [{ profileId: ownerProfileId, role: 'owner', email: null }],
    });
    expect(outcome.written).toBe(1);

    // ⚠️ NO created_at FILTER HERE, and that is deliberate. The first version of
    // this test added `.gte('created_at', notifySince)` where `notifySince` came
    // from `new Date()` — the CLIENT clock — while `notifications.created_at`
    // defaults to `now()`, the DATABASE clock. A few milliseconds of skew put the
    // row just before the watermark and the query returned []. `source_id` is
    // already unique to this message, so the time filter added nothing but a
    // race. Same family as comparing a client timestamp to a server one anywhere
    // else: don't.
    const { data: rows } = await admin
      .from('notifications')
      .select('recipient_profile_id, type, title, link_key, link_params, source_table, source_id')
      .eq('source_id', sent.id!);

    expect(rows).toHaveLength(1);
    const row = rows![0];
    expect(row.recipient_profile_id).toBe(ownerProfileId);
    expect(row.type).toBe('mention');
    // R6 — the real message text, not "you were mentioned".
    expect(row.title).toBe('Casey Crew (Alvarez): ' + body);
    expect(row.link_key).toBe('chat');
    // ND-40 / A-C13 — the thread travels, or a sub-thread mention would open
    // the crew thread.
    expect(row.link_params).toMatchObject({ projectId: PROJECT, threadId: thread!.id });
    expect(row.source_table).toBe('chat_messages');
  });

  it('the mention join row is stored against the message (ND-39)', async () => {
    const { data } = await admin
      .from('chat_message_mentions')
      .select('mentioned_profile_id');
    expect((data ?? []).map((r) => r.mentioned_profile_id)).toContain(ownerProfileId);
  });
});

describe('markThreadRead — the one UPDATE in chat', () => {
  it('creates the row on first open and moves it on the second', async () => {
    const thread = await resolveThread(crewC, PROJECT, 'crew');

    await markThreadRead(crewC, thread!.id);
    const { data: first } = await admin
      .from('chat_reads')
      .select('id, last_read_at, updated_at')
      .eq('thread_id', thread!.id)
      .eq('profile_id', crewProfileId)
      .single();
    expect(first).not.toBeNull();

    await new Promise((r) => setTimeout(r, 1100));
    await markThreadRead(crewC, thread!.id);

    const { data: second } = await admin
      .from('chat_reads')
      .select('id, last_read_at, updated_at')
      .eq('thread_id', thread!.id)
      .eq('profile_id', crewProfileId)
      .single();

    // One row, not two — the upsert respects UNIQUE (profile_id, thread_id).
    expect(second!.id).toBe(first!.id);
    expect(new Date(second!.last_read_at).getTime()).toBeGreaterThan(
      new Date(first!.last_read_at).getTime()
    );
    // And the trigger fired, which is the thing chat_reads exists to prove is
    // NOT append-only.
    expect(new Date(second!.updated_at!).getTime()).toBeGreaterThan(
      new Date(first!.updated_at!).getTime()
    );
  });
});

describe('ND-34 — the switcher RPC, under the caller RLS', () => {
  it('crew see BOTH threads; the subcontractor sees ONLY the sub thread', async () => {
    // The RPC is SECURITY INVOKER precisely so this holds. Under DEFINER it
    // would return every thread in the company and the switcher would be the
    // one place the access model does not apply.
    await resolveThread(crewC, PROJECT, 'crew');
    await resolveThread(ownerC, PROJECT, 'sub');

    const crewRows = (await switcherThreads(crewC)).filter((r) => r.projectId === PROJECT);
    expect(crewRows.map((r) => r.kind).sort()).toEqual(['crew', 'sub']);

    const subRows = (await switcherThreads(subC)).filter((r) => r.projectId === PROJECT);
    expect(subRows.map((r) => r.kind)).toEqual(['sub']);
  });

  it('unread counts a message from someone else, and NOT your own', async () => {
    const thread = await resolveThread(crewC, PROJECT, 'crew');
    await markThreadRead(crewC, thread!.id);

    // Crew's own message must not light crew's own badge — otherwise every
    // message you send marks the thread you just typed into as unread.
    const own = await insertMessage(crewC, {
      threadId: thread!.id,
      authorProfileId: crewProfileId,
      body: 'my own message, must not count as unread for me',
    });
    expect(own.success, own.error).toBe(true);
    let mine = (await switcherThreads(crewC)).find((r) => r.threadId === thread!.id);
    expect(mine!.unreadCount).toBe(0);

    // Somebody else's does.
    const fromOwner = await insertMessage(ownerC, {
      threadId: thread!.id,
      authorProfileId: ownerProfileId,
      body: 'from the owner',
    });
    expect(fromOwner.success, fromOwner.error).toBe(true);
    mine = (await switcherThreads(crewC)).find((r) => r.threadId === thread!.id);
    expect(mine!.unreadCount).toBe(1);

    // …and reading clears it.
    await markThreadRead(crewC, thread!.id);
    mine = (await switcherThreads(crewC)).find((r) => r.threadId === thread!.id);
    expect(mine!.unreadCount).toBe(0);
  });

  it('a thread never opened counts everything as unread', async () => {
    // No chat_reads row at all is the first-open case, and it must not read as
    // "nothing new".
    //
    // ⚠️ THE FIXTURE IS THE POINT HERE. The first version of this test asserted
    // against the sub thread as it stood — which had NO messages, because every
    // earlier sub-thread write in this file is a refusal. It failed with 0, and
    // 0 was the correct answer: the test's premise was wrong, not the RPC.
    // Establishing which one was wrong before changing either is the rule that
    // caught the markThreadRead bug in the same run.
    const subThread = await resolveThread(ownerC, PROJECT, 'sub');
    const posted = await insertMessage(ownerC, {
      threadId: subThread!.id,
      authorProfileId: ownerProfileId,
      body: 'a message the subcontractor has never read',
    });
    expect(posted.success, posted.error).toBe(true);

    // The subcontractor has no chat_reads row for this thread at all.
    const { count: readRows } = await admin
      .from('chat_reads')
      .select('id', { count: 'exact', head: true })
      .eq('thread_id', subThread!.id);
    expect(readRows ?? 0, 'fixture expects NO read row for this thread').toBe(0);

    const rows = await switcherThreads(subC);
    const seen = rows.find((r) => r.threadId === subThread!.id);
    expect(seen, 'the sub must see their own thread').toBeDefined();
    expect(seen!.unreadCount).toBeGreaterThan(0);
  });

  it('groups into projects with the threads adjacent', async () => {
    const grouped = groupByProject(await switcherThreads(crewC));
    const project = grouped.find((g) => g.projectId === PROJECT);
    expect(project).toBeDefined();
    expect(project!.threads.length).toBe(2);
    expect(project!.unreadCount).toBe(
      project!.threads.reduce((n, t) => n + t.unreadCount, 0)
    );
  });
});
