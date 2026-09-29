import { test, expect } from '@playwright/test';
import { isThumbnailPath } from '@framefocus/shared/utils/markup';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signIn } from './chat-fixture';
import { withThumbnails } from './storage-cleanup';

// ============================================================================
// S116 C-5 [#2-s180u step 1 proof] — THE CLIENT PORTAL COMPOSER uploads each
// photo through the shared queue (`POST /api/portal/photos`, one per request)
// and posts the message ONLY once they have landed (`POST /api/portal/messages`
// with `fileIds`). ClientComposer, app/portal/[projectId]/portal-writes-ui.tsx.
//
// Josh's ruling: ONE PROOF SPEC PER SURFACE. Every outcome is COUNTED WITH THE
// SERVICE ROLE, never inferred from the UI:
//
//   1  N = 3 photos + a note → one forced failure, NAMED in the batch list:
//      N−1 `files` rows, N−1 objects, and NO message (the unit is not posted
//      while a photo is missing)
//   2  Retry → exactly ONE message carrying exactly N `chat_message_photos`;
//      exactly N `files` rows (no duplicate), each hers, on this project,
//      category photos, client-visible; exactly N objects
//   3  ⚠️ NEGATIVE: from her page, a message naming a photo that is NOT hers
//      → 400, and no message, no attachment. A control on the same page (no
//      file ids) → 200, so the 400 is the ownership check and not a broken call
//   4  cleanup → zero messages, attachments, rows and objects of this run
//
// ⚠️ THE CHAT TABLES GO BACK TO EMPTY (chat-fixture.ts header). No chat thread
// exists on this project before the run; the composer creates the client
// thread lazily, so the teardown removes that thread too when this spec made
// it — and only then.
// ============================================================================

const LINKED = 'josh+qa-client-linked@worthprop.com';
/** The rich fixture project she is linked to (portal-pages.spec.ts). */
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';
const MARKER = 'S116C5-PC';
const RUN = `${MARKER}-${Date.now()}`;
const BUCKET = 'project-files';
const DIR = `${COMPANY_A}/${PROJECT}`;
// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const NAMES = [`${RUN}-a.png`, `${RUN}-b.png`, `${RUN}-fail.png`];
const FAIL_NAME = `${RUN}-fail.png`;
const N = NAMES.length;
const BODY = `${RUN} — three photos of the porch`;
const NEG_BODY = `${RUN} — negative, not her photo`;
const CTRL_BODY = `${RUN} — control, no photo`;

const admin = adminClient();
let clientUserId = '';
let clientProfileId = '';
let threadExistedBefore = true;

type FileRow = {
  id: string;
  company_id: string;
  project_id: string | null;
  estimate_id: string | null;
  category: string;
  client_visible: boolean;
  file_name: string;
  file_path: string;
  created_by: string | null;
  is_deleted: boolean;
};

type MessageRow = { id: string; thread_id: string; author_profile_id: string; body: string };

/** Every `files` row of this spec (any run) — matched by the marker in the name. */
async function runFileRows(): Promise<FileRow[]> {
  const { data, error } = await admin
    .from('files')
    .select(
      'id, company_id, project_id, estimate_id, category, client_visible, file_name, file_path, created_by, is_deleted'
    )
    .eq('project_id', PROJECT)
    .like('file_name', `${MARKER}%`)
    .order('file_name', { ascending: true });
  if (error) throw new Error(`files count: ${error.message}`);
  return (data ?? []) as FileRow[];
}

/**
 * Every object in the project's folder whose name carries the marker —
 * originals AND thumbnails. Paged: the folder is shared with other fixtures.
 * (The portal route names an object `{uuid}-{fileName}`, so a prefix `search`
 * cannot find it; the marker is matched after listing.)
 */
async function runObjects(): Promise<string[]> {
  const out: string[] = [];
  const page = 100;
  for (let offset = 0; ; offset += page) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(DIR, { limit: page, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`storage list: ${error.message}`);
    const names = ((data ?? []) as Array<{ name: string }>).map((o) => o.name);
    out.push(...names.filter((n) => n.includes(MARKER)).map((n) => `${DIR}/${n}`));
    if (names.length < page) break;
  }
  return out;
}

const originals = (paths: string[]) => paths.filter((p) => !isThumbnailPath(p));

async function clientThreadId(): Promise<string | null> {
  const { data, error } = await admin
    .from('chat_threads')
    .select('id')
    .eq('project_id', PROJECT)
    .eq('kind', 'client')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`chat_threads: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string }>;
  if (rows.length > 1) throw new Error(`${rows.length} client threads on ${PROJECT}; expected ≤ 1`);
  return rows[0]?.id ?? null;
}

async function messagesWithBody(body: string): Promise<MessageRow[]> {
  const { data, error } = await admin
    .from('chat_messages')
    .select('id, thread_id, author_profile_id, body')
    .eq('body', body)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`chat_messages: ${error.message}`);
  return (data ?? []) as MessageRow[];
}

async function runMessages(): Promise<MessageRow[]> {
  const { data, error } = await admin
    .from('chat_messages')
    .select('id, thread_id, author_profile_id, body')
    .like('body', `${MARKER}%`)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`chat_messages: ${error.message}`);
  return (data ?? []) as MessageRow[];
}

async function attachmentsFor(
  messageIds: string[]
): Promise<Array<{ message_id: string; file_id: string }>> {
  if (messageIds.length === 0) return [];
  const { data, error } = await admin
    .from('chat_message_photos')
    .select('message_id, file_id')
    .in('message_id', messageIds)
    .order('message_id', { ascending: true })
    .order('file_id', { ascending: true });
  if (error) throw new Error(`chat_message_photos: ${error.message}`);
  return (data ?? []) as Array<{ message_id: string; file_id: string }>;
}

/** Remove everything this spec (this run, or a crashed one) left behind. */
async function sweep(): Promise<void> {
  const msgIds = (await runMessages()).map((m) => m.id);
  if (msgIds.length) {
    await admin.from('chat_message_photos').delete().in('message_id', msgIds);
    await admin.from('chat_message_mentions').delete().in('message_id', msgIds);
    // A posted message may notify staff; teardownChat() removes these the same way.
    await admin
      .from('notifications')
      .delete()
      .eq('source_table', 'chat_messages')
      .in('source_id', msgIds);
    await admin.from('chat_messages').delete().in('id', msgIds);
  }
  const rows = await runFileRows();
  const paths = Array.from(
    new Set([...withThumbnails(rows.map((r) => r.file_path)), ...(await runObjects())])
  );
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  if (rows.length) {
    await admin
      .from('files')
      .delete()
      .in(
        'id',
        rows.map((r) => r.id)
      );
  }
  // The client thread goes only if THIS spec created it and nothing else is on it.
  if (!threadExistedBefore) {
    const tid = await clientThreadId();
    if (tid) {
      const { count } = await admin
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('thread_id', tid);
      if ((count ?? 0) === 0) {
        await admin.from('chat_reads').delete().eq('thread_id', tid);
        await admin.from('chat_threads').delete().eq('id', tid);
      }
    }
  }
}

test.beforeAll(async () => {
  const { data: me, error } = await admin
    .from('profiles')
    .select('id, user_id')
    .eq('email', LINKED)
    .eq('is_deleted', false)
    .single();
  if (error || !me) throw new Error(`client profile: ${error?.message}`);
  clientProfileId = (me as { id: string; user_id: string }).id;
  clientUserId = (me as { id: string; user_id: string }).user_id;
  // Measured BEFORE the sweep's thread step can run: the sweep only removes a
  // thread this spec created.
  threadExistedBefore = (await clientThreadId()) !== null;
  await sweep();
});

test.afterAll(async () => {
  await sweep();
  // ZERO LEFTOVERS, counted with the service role — not assumed from the sweep.
  const msgs = await runMessages();
  expect(msgs.length, 'chat_messages left behind').toBe(0);
  expect((await runFileRows()).length, 'files rows left behind').toBe(0);
  expect((await runObjects()).length, 'storage objects left behind').toBe(0);
  if (!threadExistedBefore) {
    expect(
      await clientThreadId(),
      'the client thread this spec created was left behind'
    ).toBeNull();
  }
});

test.describe('S116 C-5 · client portal composer', () => {
  test.describe.configure({ mode: 'serial' });

  test('N photos, one named failure, NO message until Retry; then one message with exactly N', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // ⚠️ THE FORCED FAILURE: the POST whose multipart body carries FAIL_NAME
    // is refused ONCE, before it reaches the server — nothing is stored for it.
    let armed = true;
    let refused = 0;
    let messagePosts = 0;
    await page.route('**/api/portal/photos', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST') return route.continue();
      const body = (req.postDataBuffer() ?? Buffer.alloc(0)).toString('latin1');
      if (armed && body.includes(FAIL_NAME)) {
        armed = false;
        refused += 1;
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'S116 C-5 forced failure' }),
        });
      }
      return route.continue();
    });
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/portal/messages')) messagePosts += 1;
    });

    await signIn(page, LINKED, /\/portal/);
    await page.goto(`/portal/${PROJECT}/files`);
    await expect(page.getByTestId('portal-composer-input')).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder('Ask a question, or say something about a photo…').fill(BODY);
    await page
      .getByTestId('portal-composer-input')
      .setInputFiles(NAMES.map((name) => ({ name, mimeType: 'image/png', buffer: PNG })));
    await page.getByTestId('portal-composer-send').click();

    // ── 1 · the failure is NAMED; the rest landed; NO message ───────────────
    const batch = page.getByTestId('portal-composer-batch');
    await expect(page.getByTestId('portal-composer-batch-retry')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('portal-composer-batch-row')).toHaveCount(N);
    await expect(
      batch.locator('[data-testid="portal-composer-batch-row"][data-status="done"]')
    ).toHaveCount(N - 1);
    const failedRow = batch.locator(
      '[data-testid="portal-composer-batch-row"][data-status="failed"]'
    );
    await expect(failedRow).toHaveCount(1);
    await expect(failedRow).toContainText(FAIL_NAME);
    await expect(page.getByTestId('portal-composer-batch-error')).toContainText(FAIL_NAME);
    await expect(page.getByTestId('portal-composer-batch-count')).toHaveText(
      `${N - 1} of ${N} uploaded`
    );
    // She is offered the choice, and it is not taken here.
    await expect(page.getByTestId('portal-composer-send-without')).toBeVisible();
    expect(refused, 'the forced failure never fired — this run proves nothing').toBe(1);

    expect(messagePosts, 'the message was POSTed while a photo was missing').toBe(0);
    expect((await messagesWithBody(BODY)).length, 'a message exists before Retry').toBe(0);
    const before = await runFileRows();
    expect(before.length, 'rows before Retry (N−1)').toBe(N - 1);
    expect(before.map((r) => r.file_name).sort()).toEqual(
      NAMES.filter((n) => n !== FAIL_NAME).sort()
    );
    expect(originals(await runObjects()).length, 'objects before Retry (N−1)').toBe(N - 1);

    // ── 2 · Retry → ONE message, exactly N photos on it ─────────────────────
    await page.getByTestId('portal-composer-batch-retry').click();
    await expect
      .poll(async () => (await messagesWithBody(BODY)).length, { timeout: 60_000 })
      .toBe(1);
    // A sent composer clears its batch (portal-writes-ui.tsx send()).
    await expect(batch).toHaveCount(0, { timeout: 30_000 });
    expect(refused, 'the failure fired more than once').toBe(1);
    expect(messagePosts, 'the message was POSTed more than once').toBe(1);

    const [msg] = await messagesWithBody(BODY);
    expect(msg.author_profile_id, 'message author').toBe(clientProfileId);
    const tid = await clientThreadId();
    expect(tid, 'no client thread on the project').not.toBeNull();
    expect(msg.thread_id, "message is not on the project's client thread").toBe(tid);

    const after = await runFileRows();
    expect(after.length, 'rows after Retry (exactly N — no duplicate)').toBe(N);
    expect(after.map((r) => r.file_name).sort()).toEqual([...NAMES].sort());
    for (const r of after) {
      expect(r.company_id, `${r.file_name} company`).toBe(COMPANY_A);
      expect(r.project_id, `${r.file_name} project`).toBe(PROJECT);
      expect(r.estimate_id, `${r.file_name} estimate`).toBeNull();
      expect(r.category, `${r.file_name} category`).toBe('photos');
      expect(r.client_visible, `${r.file_name} client_visible`).toBe(true);
      expect(r.created_by, `${r.file_name} created_by`).toBe(clientUserId);
      expect(r.is_deleted, `${r.file_name} is_deleted`).toBe(false);
    }

    const links = await attachmentsFor([msg.id]);
    expect(links.length, 'chat_message_photos on the message (exactly N)').toBe(N);
    expect(links.map((l) => l.file_id).sort()).toEqual(after.map((r) => r.id).sort());

    const objs = originals(await runObjects());
    expect(objs.length, 'objects after Retry (exactly N)').toBe(N);
    expect([...objs].sort()).toEqual(after.map((r) => r.file_path).sort());

    // A short wait: nothing late adds a second message or an N+1th photo.
    await page.waitForTimeout(3_000);
    expect((await messagesWithBody(BODY)).length, 'messages after the wait (still 1)').toBe(1);
    expect((await runFileRows()).length, 'rows after the wait (still N)').toBe(N);
  });

  test('⚠️ NEGATIVE: a message naming a photo that is not hers is refused (400), nothing posted', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // A STAFF photo on the SAME project that she can see: client-visible,
    // category photos, live — so ownership (`created_by`) is the ONLY property
    // `verifyOwnUnattachedPhotos` can refuse it on. Ordered, so stable.
    const { data: staff, error } = await admin
      .from('files')
      .select('id, created_by')
      .eq('project_id', PROJECT)
      .eq('category', 'photos')
      .eq('client_visible', true)
      .eq('is_deleted', false)
      .or(`created_by.is.null,created_by.neq.${clientUserId}`)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1);
    if (error) throw new Error(`staff photo: ${error.message}`);
    const staffId = ((staff ?? []) as Array<{ id: string }>)[0]?.id;
    expect(staffId, 'no staff photo on the project — the negative would be vacuous').toBeTruthy();
    const linksBefore = await admin
      .from('chat_message_photos')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', staffId as string);

    await signIn(page, LINKED, /\/portal/);
    await page.goto(`/portal/${PROJECT}/files`);
    await expect(page.getByTestId('portal-composer-input')).toBeVisible({ timeout: 30_000 });

    const post = (args: { projectId: string; body: string; fileIds: string[] }) =>
      page.evaluate(async ({ projectId, body, fileIds }) => {
        const form = new FormData();
        form.set('projectId', projectId);
        form.set('body', body);
        for (const id of fileIds) form.append('fileIds', id);
        const r = await fetch('/api/portal/messages', { method: 'POST', body: form });
        return { status: r.status, json: (await r.json().catch(() => ({}))) as { error?: string } };
      }, args);

    const neg = await post({ projectId: PROJECT, body: NEG_BODY, fileIds: [staffId as string] });
    expect(neg.status, `not-her photo was accepted: ${JSON.stringify(neg.json)}`).toBe(400);
    expect((await messagesWithBody(NEG_BODY)).length, 'a message was created').toBe(0);
    const linksAfter = await admin
      .from('chat_message_photos')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', staffId as string);
    expect(linksAfter.count, 'the staff photo was attached to something').toBe(linksBefore.count);

    // CONTROL that must fire: the same call from the same page, naming no file,
    // posts — so the 400 above is the ownership check, not a dead route.
    const ctrl = await post({ projectId: PROJECT, body: CTRL_BODY, fileIds: [] });
    expect(ctrl.status, `control did not post: ${JSON.stringify(ctrl.json)}`).toBe(200);
    expect((await messagesWithBody(CTRL_BODY)).length, 'control message count').toBe(1);
  });
});
