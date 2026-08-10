import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { resolveThread } from '@/lib/chat/threads';
import { insertMessage } from '@/lib/chat/messages';
import { attachPhotos, eligiblePhotoIds, withPhotos } from '@/lib/chat/photos';

// ============================================================================
// CHAT slice 6 — the photo reference, against rebuild-test.
// Spec: §4.3, §4.5a, §5.4, A-C17, A-C17b, A-C17c, A-C19. Spec @ 4b61b9d.
// ============================================================================

const OWNER = 'josh+test50@worthprop.com';
const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';
const OTHER_PROJECT = '6c395b31-cd45-4683-bb6a-cc4895488692';

let ownerC: SupabaseClient<Database>;
let ownerProfileId: string;
const madeFiles: string[] = [];

/** A `files` row of a given category — the fixture chat must discriminate on. */
async function makeFile(category: string, projectId = PROJECT): Promise<string> {
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: COMPANY,
      project_id: projectId,
      category,
      file_name: `s126-${category}-${Date.now()}-${Math.round(performance.now())}.bin`,
      file_path: `${COMPANY}/s126/${category}.bin`,
      file_size: 10,
      mime_type: 'image/jpeg',
    })
    .select('id')
    .single();
  if (error) throw new Error(`makeFile(${category}): ${error.message}`);
  const id = (data as { id: string }).id;
  madeFiles.push(id);
  return id;
}

async function cleanup() {
  await admin.from('chat_threads').delete().in('project_id', [PROJECT, OTHER_PROJECT]);
  if (madeFiles.length > 0) await admin.from('files').delete().in('id', madeFiles);
  madeFiles.length = 0;
}

beforeAll(async () => {
  assertRebuildTest();
  ownerC = await sessionFor(OWNER);
  const { data } = await admin.from('profiles').select('id').eq('email', OWNER).single();
  ownerProfileId = (data as { id: string }).id;
  await cleanup();
});

afterAll(cleanup);

/** Stands in for getProjectPhotos(), which needs a request scope. */
async function gallery(): Promise<Array<{ id: string; file_name: string; displayUrl: string | null }>> {
  const { data } = await admin
    .from('files')
    .select('id, file_name')
    .eq('project_id', PROJECT)
    .eq('category', 'photos');
  return ((data ?? []) as Array<{ id: string; file_name: string }>).map((f) => ({
    id: f.id,
    file_name: f.file_name,
    displayUrl: `https://example.test/${f.id}`,
  }));
}

async function messageWith(body: string): Promise<{ threadId: string; messageId: string }> {
  const thread = await resolveThread(ownerC, PROJECT, 'crew');
  const sent = await insertMessage(ownerC, {
    threadId: thread!.id,
    authorProfileId: ownerProfileId,
    body,
  });
  expect(sent.success, sent.error).toBe(true);
  return { threadId: thread!.id, messageId: sent.id! };
}

describe('A-C17c — the category check, which the FK cannot make', () => {
  it('⚠️ a CONTRACT and a RECEIPT are not eligible; a photo is', async () => {
    // `files` holds receipts, contracts, invoices and change-order PDFs
    // alongside photos, and `file_id → files(id)` permits every one of them.
    // This is the only thing standing between the composer and a contract PDF
    // rendering as a chat thumbnail.
    const photo = await makeFile('photos');
    const contract = await makeFile('contracts');
    const receipt = await makeFile('receipts');

    const eligible = await eligiblePhotoIds(ownerC, PROJECT, [photo, contract, receipt]);
    expect(eligible).toEqual([photo]);
  });

  it('a photo from ANOTHER project is not eligible either', async () => {
    // Scope is as load-bearing as category: a photo from a different job is as
    // wrong in this thread as a contract from this one.
    const here = await makeFile('photos');
    const elsewhere = await makeFile('photos', OTHER_PROJECT);
    const eligible = await eligiblePhotoIds(ownerC, PROJECT, [here, elsewhere]);
    expect(eligible).toEqual([here]);
  });

  it('a soft-deleted photo is not eligible', async () => {
    const gone = await makeFile('photos');
    await admin.from('files').update({ is_deleted: true }).eq('id', gone);
    expect(await eligiblePhotoIds(ownerC, PROJECT, [gone])).toEqual([]);
  });
});

describe('A-C17 — a message references two photos and renders both', () => {
  it('both come back, in pick order', async () => {
    const a = await makeFile('photos');
    const b = await makeFile('photos');
    const { messageId } = await messageWith('two photos');

    const outcome = await attachPhotos(ownerC, messageId, [a, b]);
    expect(outcome.attached).toBe(2);

    const rows = await withPhotos(ownerC, [
      { id: messageId, thread_id: '', author_profile_id: ownerProfileId, body: 'two photos', created_at: new Date(0).toISOString(), author: null },
    ], gallery);
    expect(rows[0].photos.map((p) => p.fileId)).toEqual([a, b]);
    expect(rows[0].photos.map((p) => p.sortOrder)).toEqual([0, 1]);
  });

  it('a message with no photos gets an empty array, not a missing field', async () => {
    const { messageId } = await messageWith('text only');
    const rows = await withPhotos(
      ownerC,
      [
        { id: messageId, thread_id: '', author_profile_id: ownerProfileId, body: 'text only', created_at: new Date(0).toISOString(), author: null },
      ],
      // ⚠️ A RESOLVER THAT THROWS, deliberately. A message with no references
      // must never reach the expensive half — signing every project photo's URL
      // on a poll that returned nothing is the cost the short-circuit exists to
      // avoid. If it regresses this fails loudly rather than merely getting
      // slower, which nothing would otherwise notice.
      async () => {
        throw new Error('resolveGallery must not run when there are no references');
      }
    );
    expect(rows[0].photos).toEqual([]);
  });
});

describe('§4.5a / A-C17b — ND-28 CASCADE, and the message survives', () => {
  it('⚠️ hard-deleting the FILE removes the reference and keeps the text', async () => {
    const photo = await makeFile('photos');
    const { messageId } = await messageWith('look at the trim');
    await attachPhotos(ownerC, messageId, [photo]);

    const before = await admin
      .from('chat_message_photos')
      .select('id', { count: 'exact', head: true })
      .eq('message_id', messageId);
    expect(before.count).toBe(1);

    // files-client.ts:334 HARD-deletes after removing the blob, so this is a
    // real case rather than a soft-delete flag.
    await admin.from('files').delete().eq('id', photo);

    const after = await admin
      .from('chat_message_photos')
      .select('id', { count: 'exact', head: true })
      .eq('message_id', messageId);
    expect(after.count, 'the reference must vanish with the file').toBe(0);

    // A-C17b: the message and its TEXT are untouched.
    const { data: msg } = await admin
      .from('chat_messages')
      .select('body')
      .eq('id', messageId)
      .single();
    expect((msg as { body: string }).body).toBe('look at the trim');
  });

  it('deleting the MESSAGE removes its references too', async () => {
    const photo = await makeFile('photos');
    const { messageId } = await messageWith('will be deleted');
    await attachPhotos(ownerC, messageId, [photo]);

    await admin.from('chat_messages').delete().eq('id', messageId);

    const { count } = await admin
      .from('chat_message_photos')
      .select('id', { count: 'exact', head: true })
      .eq('message_id', messageId);
    expect(count).toBe(0);
  });

  it('⚠️ and NO ROLE can delete a reference directly — §4.5a', async () => {
    // The cascade works precisely BECAUSE referential actions are performed by
    // the system rather than the caller, so they are not subject to RLS. That
    // is what makes a table with no DELETE policy compatible with CASCADE, and
    // this is the half that proves the policy side rather than the FK side.
    const photo = await makeFile('photos');
    const { messageId } = await messageWith('undeletable reference');
    await attachPhotos(ownerC, messageId, [photo]);

    const { error } = await ownerC.from('chat_message_photos').delete().eq('message_id', messageId);
    // PostgREST reports no error for a delete that matched nothing; the proof
    // is that the row is still there afterwards.
    expect(error).toBeNull();

    const { count } = await admin
      .from('chat_message_photos')
      .select('id', { count: 'exact', head: true })
      .eq('message_id', messageId);
    expect(count, 'an Owner has no DELETE policy on this table').toBe(1);
  });
});
