import type { SupabaseClient } from '@supabase/supabase-js';
import { MARKUP_SCHEMA_VERSION, type MarkupData } from '@framefocus/shared/types/markup';
import { derivativePathFor } from '@framefocus/shared/utils/markup';
import { COMPANY_A, CREW_MEMBER, type HubFixture } from './hub-fixture';

// M6M — photo fixtures for the M-8 / M-9 / M-10 criteria.
//
// ---------------------------------------------------------------------------
// WHY REAL BYTES AND NOT STUB ROWS.
// ---------------------------------------------------------------------------
// Most of this slice's criteria are about WHICH FILE IS ON SCREEN (D-31), so a
// `files` row pointing at nothing would make every one of them pass vacuously:
// a broken <img> and a correct <img> are the same DOM. So the fixture uploads
// genuine image objects to the real bucket, and the derivative is a
// DIFFERENT-LOOKING image from the original — different dimensions — so a test
// can tell which one rendered by measuring it, rather than trusting a URL.
//
// Every object and row created here is removed in teardown.

const BUCKET = 'project-files';

/** Lower-cased hub prefix — file names and storage keys are case-sensitive. */
function filePrefix(fx: HubFixture): string {
  return fx.prefix.toLowerCase();
}

/**
 * Two real PNGs, distinguishable BY SIZE.
 *
 *   original    8x8
 *   derivative  16x16
 *
 * `naturalWidth` in the browser is then a reliable answer to "which file is
 * this?" — which is exactly what A-23f/A-23g/A-23e need and what a URL string
 * comparison could not give, since both are signed URLs over the same bucket.
 */
const PNG_8 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=';
const PNG_16 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVQ4y2P8z8BAEmCkugFMVDdg1MBRA0cNHDVw1MBRA4eBgQCzTQMFPfDs0gAAAABJRU5ErkJggg==';

function bytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

export type PhotoFixture = {
  /** Annotated: markup_data is non-empty AND a derivative object exists. */
  annotated: { id: string; path: string };
  /** Plain: no markup, no derivative — renders the original, no indicator. */
  plain: { id: string; path: string };
  /** Punch-linked via reference_photo_file_id — D-15's read-only join. */
  punchLinked: { id: string; path: string };
  /** Annotated but with NO derivative object — the A-23t degrade path. */
  orphanMarkup: { id: string; path: string };
  /** Written to by the save test, and by nothing else. */
  saveTarget: { id: string; path: string };
  /** Deleted by the owner-role test — A-25d's positive half. */
  deletable: { id: string; path: string };
  /** Bulk-deleted by the owner-role test — A-22e's delete half. */
  bulkA: { id: string; path: string };
  bulkB: { id: string; path: string };
  /** The punch item whose reference_photo_file_id was set, for byte-comparison. */
  punchItemId: string;
  /** Marks all in one corner — for A-23r. */
  markup: MarkupData;
};

async function putPhoto(
  admin: SupabaseClient,
  projectId: string,
  prefix: string,
  name: string,
  b64: string
): Promise<{ id: string; path: string }> {
  // Prefix-scoped for the same reason the hub fixture's projects are: parallel
  // spec files must not delete each other's rows mid-run.
  const path = `${COMPANY_A}/${projectId}/${prefix}-${name}.png`;

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes(b64), { contentType: 'image/png', upsert: true });
  if (upErr) throw new Error(`fixture upload ${name}: ${upErr.message}`);

  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: COMPANY_A,
      project_id: projectId,
      category: 'photos',
      file_name: `${prefix}-${name}.png`,
      file_path: path,
      file_size: bytes(b64).length,
      mime_type: 'image/png',
      tags: ['m6m-fixture'],
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`fixture files row ${name}: ${error?.message}`);

  return { id: data.id, path };
}

export async function setupPhotoFixture(fx: HubFixture): Promise<PhotoFixture> {
  const admin = fx.admin;
  const projectId = fx.futureProject;

  await teardownPhotoFixture(fx);

  // Marks deliberately clustered in the TOP-LEFT so A-23r has a photo whose
  // every mark would be cropped away by a centre-crop of a wide image — the
  // case §4.7a.3 wrote the indicator for.
  const markup: MarkupData = {
    version: MARKUP_SCHEMA_VERSION,
    imageWidth: 8,
    imageHeight: 8,
    shapes: [
      { id: 'fx-rect', type: 'rectangle', x: 0, y: 0, width: 2, height: 2, color: '#f2453d', strokeWidth: 1 },
      { id: 'fx-pin', type: 'pin', x: 1, y: 1, color: '#f2453d', number: 1 },
    ],
  };

  const p = filePrefix(fx);
  const annotated = await putPhoto(admin, projectId, p, 'annotated', PNG_8);
  const plain = await putPhoto(admin, projectId, p, 'plain', PNG_8);
  const punchLinked = await putPhoto(admin, projectId, p, 'punch', PNG_8);
  const orphanMarkup = await putPhoto(admin, projectId, p, 'orphan', PNG_8);
  // A photo of its own for the save test, so a mutation there cannot disturb
  // the read-only assertions the other fixtures back.
  const saveTarget = await putPhoto(admin, projectId, p, 'savetarget', PNG_8);
  // Owned by the delete tests. Separate photos so a destructive assertion can
  // run for real rather than being simulated, without disturbing anything else.
  const deletable = await putPhoto(admin, projectId, p, 'deletable', PNG_8);
  const bulkA = await putPhoto(admin, projectId, p, 'bulka', PNG_8);
  const bulkB = await putPhoto(admin, projectId, p, 'bulkb', PNG_8);

  // The annotated photo gets BOTH halves — markup_data and a real derivative
  // object at the deterministic path (A-23). The derivative is the 16px image,
  // so a rendered width of 16 proves the derivative is what loaded.
  await admin
    .from('files')
    .update({ markup_data: markup as unknown as Record<string, unknown> })
    .eq('id', annotated.id);

  const { error: derErr } = await admin.storage
    .from(BUCKET)
    .upload(derivativePathFor(annotated.path), bytes(PNG_16), {
      contentType: 'image/png',
      upsert: true,
    });
  if (derErr) throw new Error(`fixture derivative: ${derErr.message}`);

  // The orphan gets markup_data and NO derivative — a photo that claims marks
  // whose annotated bytes are absent. It must still carry the indicator and
  // must degrade to the original rather than showing a broken image (A-23t).
  await admin
    .from('files')
    .update({ markup_data: markup as unknown as Record<string, unknown> })
    .eq('id', orphanMarkup.id);

  // D-15 — the Punch badge is a READ-ONLY JOIN against these two columns. The
  // fixture WRITES one here to create the condition; the app only ever reads
  // it, which is what A-22c checks by comparing the row before and after.
  const { data: item, error: itemErr } = await admin
    .from('punch_list_items')
    .insert({
      company_id: COMPANY_A,
      punch_list_id: fx.punchListId,
      project_id: projectId,
      title: 'M6M — photo-linked punch item',
      status: 'open',
      assignee_id: CREW_MEMBER,
      requires_verification: false,
      reference_photo_file_id: punchLinked.id,
    })
    .select('id')
    .single();
  if (itemErr || !item) throw new Error(`fixture punch link: ${itemErr?.message}`);

  return {
    annotated,
    plain,
    punchLinked,
    orphanMarkup,
    saveTarget,
    deletable,
    bulkA,
    bulkB,
    punchItemId: item.id,
    markup,
  };
}

export async function teardownPhotoFixture(fx: HubFixture): Promise<void> {
  const admin = fx.admin;

  const { data: rows } = await admin
    .from('files')
    .select('id, file_path')
    .eq('company_id', COMPANY_A)
    .like('file_name', `${filePrefix(fx)}-%`);

  const ids = (rows ?? []).map((r) => r.id);
  const paths = (rows ?? []).flatMap((r) => [r.file_path, derivativePathFor(r.file_path)]);

  if (ids.length) {
    // Unlink before deleting the files, or the FK on punch_list_items blocks it.
    await admin
      .from('punch_list_items')
      .update({ reference_photo_file_id: null })
      .in('reference_photo_file_id', ids);
    await admin
      .from('punch_list_items')
      .update({ completion_photo_file_id: null })
      .in('completion_photo_file_id', ids);
    await admin.from('files').delete().in('id', ids);
  }
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
}
