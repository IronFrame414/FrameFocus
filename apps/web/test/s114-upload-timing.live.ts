import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PNG } from 'pngjs';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { runUploadBatch, toUploadItems, type UploadOutcome } from '@/lib/uploads/upload-batch';

// ===========================================================================
// S114 FILL-C-5.3 — TIMING for a 10-image batch INCLUDING thumbnails, on
// rebuild-test, through the SAME runner every multi-file control now uses.
// A MEASUREMENT, logged; its assertions are only that every file and every
// thumbnail landed (a timing over a partial batch is not a timing).
//
// What one file costs in the browser: a Storage PUT + a `files` INSERT under
// the user's session, then a fire-and-forget thumbnail request that the
// server renders through Supabase's image transform. Here: the PUT + INSERT
// run through runUploadBatch at concurrency 1 and 3 (the session is a real
// signed-in owner), then the 10 thumbnails run in parallel as the browser's
// keepalive requests would. Images are ~2.8 MB incompressible PNGs (a phone
// JPEG is 2–4 MB); the HEIC→JPEG step is not exercised.
// ===========================================================================

// thumbnail-server.ts imports 'server-only'; test/live.vitest.config.ts aliases it.

const OWNER = 'josh+test50@worthprop.com';
const MARKER = `S114UT-${Date.now()}`;
const BUCKET = 'project-files';
let owner: SupabaseClient;
let companyId = '';
let projectId = '';
const created: { id: string; file_path: string }[] = [];

function noisePng(w: number, h: number): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = (Math.random() * 256) | 0;
    png.data[i + 1] = (Math.random() * 256) | 0;
    png.data[i + 2] = (Math.random() * 256) | 0;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

beforeAll(async () => {
  assertRebuildTest();
  owner = await sessionFor(OWNER);
  const { data: p } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (p as { company_id: string }).company_id;
  // Any live project of the owner's company; ordered so the pick is stable.
  const { data: proj } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at')
    .order('id')
    .limit(1)
    .single();
  projectId = (proj as { id: string }).id;
}, 60_000);

afterAll(async () => {
  if (!created.length) return;
  const { removeThumbnails } = await import('@/lib/photos/thumbnail-server');
  for (const f of created) await removeThumbnails(admin, f.file_path);
  await admin.storage.from(BUCKET).remove(created.map((f) => f.file_path));
  await admin
    .from('files')
    .delete()
    .in(
      'id',
      created.map((f) => f.id)
    );
}, 120_000);

async function batch(label: string, concurrency: number) {
  const files = Array.from(
    { length: 10 },
    (_, i) =>
      new File([new Uint8Array(noisePng(1100, 850))], `${MARKER}-${label}-${i}.png`, {
        type: 'image/png',
      })
  );
  const bytes = files.reduce((n, f) => n + f.size, 0);
  const rows: { id: string; file_path: string; mime_type: string; markup_data: null }[] = [];

  const worker = async (file: File): Promise<UploadOutcome> => {
    const id = crypto.randomUUID();
    const path = `${companyId}/${projectId}/${id}-${file.name}`;
    const up = await owner.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) return { success: false, error: up.error.message };
    const ins = await owner.from('files').insert({
      id,
      company_id: companyId,
      project_id: projectId,
      category: 'photos',
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
    });
    if (ins.error) return { success: false, error: ins.error.message };
    rows.push({ id, file_path: path, mime_type: file.type, markup_data: null });
    created.push({ id, file_path: path });
    return { success: true, id };
  };

  const t0 = Date.now();
  const items = await runUploadBatch(toUploadItems(files), worker, { concurrency });
  const tRows = Date.now() - t0;

  const { generateThumbnail } = await import('@/lib/photos/thumbnail-server');
  const t1 = Date.now();
  const thumbs = await Promise.all(rows.map((r) => generateThumbnail(admin, r)));
  const tThumbs = Date.now() - t1;

  const landed = items.filter((i) => i.status === 'done').length;
  const thumbsOk = thumbs.filter((t) => t.ok).length;
  console.log(
    `[S114 C-5.3] ${label}: 10 images, ${(bytes / 1e6).toFixed(1)} MB, concurrency ${concurrency} — ` +
      `upload+rows ${tRows} ms, then 10 thumbnails ${tThumbs} ms (parallel), total ${tRows + tThumbs} ms; ` +
      `landed ${landed}/10, thumbnails ${thumbsOk}/10` +
      (thumbsOk < 10
        ? ` — failures: ${thumbs
            .filter((t) => !t.ok)
            .map((t) => ('error' in t ? t.error : 'skipped'))
            .join(' | ')}`
        : '')
  );
  return { landed, thumbsOk };
}

describe('S114 C-5.3 — 10-image batch timing, thumbnails included', () => {
  it('concurrency 1 (the old serial loop)', async () => {
    const r = await batch('c1', 1);
    expect(r.landed).toBe(10);
    expect(r.thumbsOk).toBe(10);
  }, 300_000);

  it('concurrency 3 (runUploadBatch default, now every multi-file control)', async () => {
    const r = await batch('c3', 3);
    expect(r.landed).toBe(10);
    expect(r.thumbsOk).toBe(10);
  }, 300_000);
});
