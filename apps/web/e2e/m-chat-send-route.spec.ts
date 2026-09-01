import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';

// ============================================================================
// /api/chat/messages — the HTTP layer. Slice 2's last unverified piece.
// ============================================================================
//
// The route's pieces are each verified in s126-chat-core.live.ts. What that
// harness CANNOT reach is the route itself: the auth gate, the 401/403 mapping,
// the zod validation and the JSON contract. Until this spec, the route had
// never been called by anything.
//
// ⚠️ THE `m-` PREFIX IS NOT A CLAIM THAT THIS IS A MOBILE SPEC. In
// playwright.config.ts the authenticated project is selected by
// `testMatch: /m-.*\.spec\.ts/`, so the prefix is what buys a signed-in
// session; `chromium` (unauthenticated) ignores exactly those files. Named for
// the project it needs rather than the surface it tests — the first run of this
// spec landed in `chromium` and all seven cases failed as 401, which is the
// convention announcing itself.
//
// The spec is surface-agnostic: it uses `request` only and never opens a page,
// so the authenticated project's mobile viewport is irrelevant to it.
//
// Signed in as the crew test identity — the role that can post in a crew thread
// and must be refused in a sub thread.

const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const OTHER_PROJECT = '6c395b31-cd45-4683-bb6a-cc4895488692'; // crew NOT assigned

test.afterAll(async () => {
  // chat_messages and chat_message_mentions cascade from the thread.
  const admin = adminClient();
  await admin.from('chat_threads').delete().in('project_id', [PROJECT, OTHER_PROJECT]);
  await admin.from('notifications').delete().eq('type', 'mention');
});

test.describe('the auth gate comes first', () => {
  test('a malformed body from an AUTHENTICATED caller is a 400, not a 401', async ({
    request,
  }) => {
    // Paired with the unauthenticated case: auth is checked BEFORE validation,
    // so an unauthenticated caller sending junk gets 401 and never learns
    // whether the body was valid. This half proves validation still runs once
    // the caller is known — without it, a route that 401s everything passes.
    const res = await request.post('/api/chat/messages', {
      data: { project_id: PROJECT, kind: 'crew', body: '   ' },
    });
    expect(res.status()).toBe(400);
    // ⚠️ THE WORDING CHANGED IN SLICE 6 AND THIS ASSERTION DID NOT [fixed S131].
    // It expected 'empty', from `'A message cannot be empty'`. Slice 6 (ad0b7bb)
    // relaxed `chatSendSchema` so a PHOTO-ONLY message is valid — §5.4 allows
    // "text, photos, or both" — and the refusal became 'A message needs text or
    // a photo'. The test was last touched in slice 2 and has been asserting a
    // string the build stopped producing.
    //
    // Matched on the REQUIREMENT rather than the sentence, so the next rewording
    // does not fail a route that is behaving correctly. What this test is for is
    // that validation runs at all once the caller is known — the status code is
    // the load-bearing half.
    expect((await res.json()).error).toMatch(/text or a photo|empty/i);
  });

  test('an unknown thread kind is rejected by validation', async ({ request }) => {
    const res = await request.post('/api/chat/messages', {
      data: { project_id: PROJECT, kind: 'everyone', body: 'hello' },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('403 is a permission answer, not a not-found', () => {
  test('crew posting to a project they cannot see gets 403 with its own message', async ({
    request,
  }) => {
    // CLAUDE.md, API/Data Layer: "Auth and permission failures return 401/403
    // with their own message — never fall through to a 'not found' path."
    const res = await request.post('/api/chat/messages', {
      data: { project_id: OTHER_PROJECT, kind: 'crew', body: 'should be refused' },
    });
    expect(res.status()).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('You do not have access to this thread.');
    // The message must not leak into not-found language — the distinction is
    // the whole point of the rule.
    expect(body.error.toLowerCase()).not.toContain('not found');
  });

  test('crew posting to the SUB thread gets 403 — ND-20 through the HTTP layer', async ({
    request,
  }) => {
    // The live harness proved the policy refuses it. This proves the ROUTE maps
    // that refusal to 403 rather than letting it surface as a 400 or a 500.
    const res = await request.post('/api/chat/messages', {
      data: { project_id: PROJECT, kind: 'sub', body: 'crew must not post here' },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('a valid send', () => {
  test('writes the row and returns the thread', async ({ request }) => {
    const res = await request.post('/api/chat/messages', {
      data: {
        project_id: PROJECT,
        kind: 'crew',
        body: 'route probe — plain message, notifies nobody',
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.threadId).toBeTruthy();
    // R6 — a plain message notifies nobody.
    expect(body.mentioned).toBe(0);

    const admin = adminClient();
    const { data } = await admin
      .from('chat_messages')
      .select('id, body, thread_id')
      .eq('id', body.id)
      .single();
    expect(data!.body).toBe('route probe — plain message, notifies nobody');
    expect(data!.thread_id).toBe(body.threadId);
  });

  test('a mention writes the join row AND fires notify() — through HTTP', async ({ request }) => {
    const admin = adminClient();

    // ⚠️ THE MENTION TARGET IS DERIVED FROM THE FIXTURE, NOT HARDCODED.
    // This test used to address `@Josh`, and the S176 owner rename (Josh Bishop
    // -> Dave Whitfield) silently broke it: `postableSet` resolves mentions from
    // `profiles.first_name` (chat/threads.ts), so the stale first name matched
    // nobody, `mentioned` came back 0, and the test failed on the `mentioned`
    // assertion below — NOT on the notify path it is named for. A hardcoded
    // first name is exactly what let a data rename break this; the next rename
    // would break it again. So we read the current owner and address them.
    // (The eighth casualty of that rename sweep — see GATED.md.)
    const { data: owner } = await admin
      .from('profiles')
      .select('first_name')
      .eq('company_id', COMPANY_A)
      .eq('role', 'owner')
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    expect(owner?.first_name, 'the fixture owner must exist to be mentionable').toBeTruthy();
    const messageBody = `@${owner!.first_name} route probe, please look`;

    const res = await request.post('/api/chat/messages', {
      data: { project_id: PROJECT, kind: 'crew', body: messageBody },
    });
    expect(res.status()).toBe(200);

    const payload = await res.json();
    expect(
      payload.mentioned,
      `the Owner (@${owner!.first_name}) is mentionable in the crew thread`
    ).toBe(1);

    const { data: mentions } = await admin
      .from('chat_message_mentions')
      .select('mentioned_profile_id')
      .eq('message_id', payload.id);
    expect(mentions).toHaveLength(1);

    // ⚠️ notify() writes the notification row server-side DURING the request,
    // but this admin client reads it back over a separate connection that can
    // lag the write by up to ~1s (observed). A single immediate read asserts on
    // the SCHEDULE, not the outcome — the source of this test's flake. Poll on a
    // TIGHT ceiling instead, and when it exhausts, say plainly that the
    // notification never arrived. Widening the ceiling would only hide a real
    // regression; it is not needed to catch one, because a broken notify writes
    // NOTHING and never arrives at any ceiling — the bound tolerates read lag,
    // it does not wait out a failure.
    type NotifRow = {
      type: string;
      title: string;
      link_key: string;
      link_params: Record<string, unknown> | null;
    };
    const DEADLINE_MS = 3000;
    const POLL_MS = 100;
    const started = Date.now();
    let notifs: NotifRow[] = [];
    for (;;) {
      const { data } = await admin
        .from('notifications')
        .select('type, title, link_key, link_params')
        .eq('source_id', payload.id);
      notifs = (data ?? []) as NotifRow[];
      if (notifs.length >= 1 || Date.now() - started >= DEADLINE_MS) break;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    expect(
      notifs,
      `notify() never wrote a notification for message ${payload.id} within ${DEADLINE_MS}ms — ` +
        `the mention notification did not arrive. This is NOT read-timing noise: a working ` +
        `notify lands within ~1s, a broken one never lands at any ceiling.`
    ).toHaveLength(1);
    expect(notifs[0].type).toBe('mention');
    expect(notifs[0].title).toContain(messageBody);
    expect(notifs[0].link_key).toBe('chat');
    expect(notifs[0].link_params).toMatchObject({ threadId: payload.threadId });
  });

  test('an unresolvable @token is reported back rather than silently dropped', async ({
    request,
  }) => {
    // §2.4 — the delivery guarantee rests on the mention landing. A message that
    // notified nobody because the name did not match must say so, or it is the
    // lost-request failure chat exists to fix, wearing a new coat.
    const res = await request.post('/api/chat/messages', {
      data: { project_id: PROJECT, kind: 'crew', body: '@nobodyhere please look' },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.mentioned).toBe(0);
    expect(body.unresolved).toContain('nobodyhere');
  });
});
