import type { Page, Request } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { deleteProjects } from '../test-support/company-purge';
import { thumbPathFor } from '@framefocus/shared/utils/markup';
// The BACKFILL's own generator — so CI exercises the exact code Josh will run.
import { generate, withSlowDownRetry } from '../../../scripts/s111-thumbnail-backfill.cjs';

// [S111 D] Fixture for the thumbnail/load-ahead specs: a throwaway project
// holding PHOTO_COUNT real (tiny) photos on DISTINCT paths, so every tile has
// its own signed URL and the load-ahead can be counted per tile.
//
// Keyed on MARKER + the spec's TAG in the project name, so a crashed run is
// swept by the next — and so two specs running in parallel never sweep each
// other's fixture.

export const PHOTO_COUNT = 80;
const MARKER = 'S111THUMBS';
const BUCKET = 'project-files';
const PNG_8 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=',
  'base64'
);

const admin = adminClient();

export async function sweepThumbFixture(tag: string): Promise<void> {
  const { data: projects } = await admin.from('projects').select('id').eq('name', `${MARKER} ${tag}`);
  const ids = ((projects ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return;
  const { data: files } = await admin.from('files').select('id, file_path').in('project_id', ids);
  const rows = (files ?? []) as { id: string; file_path: string }[];
  const objects = rows.flatMap((r) => [r.file_path, thumbPathFor(r.file_path, null)]);
  // ⚠️ CHECKED AND RETRIED. This used to ignore remove()'s result: under
  // Storage's "SlowDown" the removal failed silently while the rows below were
  // deleted, stranding 89 thumbnails from one CI run with no row pointing at them.
  for (let i = 0; i < objects.length; i += 100) {
    const batch = objects.slice(i, i + 100);
    await withSlowDownRetry(async () => {
      const { error } = await admin.storage.from(BUCKET).remove(batch);
      if (error) throw new Error(`sweep remove: ${error.message}`);
    });
  }
  if (rows.length) await admin.from('files').delete().in('id', rows.map((r) => r.id));
  await deleteProjects(admin, ids);
}

export interface ThumbFixture {
  projectId: string;
  fileIds: string[];
  /** Per-photo generation time, ms — empty when thumbnails were not made. */
  generationMs: number[];
}

/**
 * Creates the project and its photos. `thumbnails: false` leaves them without
 * stored thumbnails, for the fallback case.
 */
export async function setupThumbFixture(
  tag: string,
  opts: { thumbnails: boolean } = { thumbnails: true }
): Promise<ThumbFixture> {
  await sweepThumbFixture(tag);
  // Any contact will do; ordered so the pick is stable (CLAUDE.md, .limit(1)).
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);
  const { data: counters } = await admin
    .from('companies')
    .select('project_internal_sequence')
    .eq('id', COMPANY_A)
    .single();
  const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: COMPANY_A,
      name: `${MARKER} ${tag}`,
      contact_id: (c as { id: string }).id,
      project_type: 'fixed_price',
      project_number: `PRJ-${MARKER}-${tag}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`project: ${pErr.message}`);
  await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', COMPANY_A);
  const projectId = (project as { id: string }).id;

  const rows = [];
  for (let n = 0; n < PHOTO_COUNT; n++) {
    const id = crypto.randomUUID();
    const name = `${MARKER.toLowerCase()}-${String(n).padStart(3, '0')}.png`;
    const path = `${COMPANY_A}/${projectId}/${id}-${name}`;
    // rebuild-test's Storage answers bursts with 429 "SlowDown" (max_connections
    // 60); an upsert of the same bytes is safe to retry.
    await withSlowDownRetry(async () => {
      const up = await admin.storage.from(BUCKET).upload(path, PNG_8, { contentType: 'image/png', upsert: true });
      if (up.error) throw new Error(`upload ${n}: ${up.error.message}`);
    });
    await new Promise((res) => setTimeout(res, 50));
    rows.push({
      id,
      company_id: COMPANY_A,
      project_id: projectId,
      category: 'photos',
      file_name: name,
      file_path: path,
      file_size: PNG_8.length,
      mime_type: 'image/png',
    });
  }
  const ins = await admin.from('files').insert(rows);
  if (ins.error) throw new Error(`files: ${ins.error.message}`);

  const generationMs: number[] = [];
  if (opts.thumbnails) {
    // ONE at a time, paced — the backfill's default, and for the same reason:
    // rebuild-test's Storage runs on a pool of ~5 DB connections shared by every
    // upload, sign and render, and two in flight still drew "Too many
    // connections" (S111 thumbnails report).
    for (const r of rows) {
      const g = (await generate(admin, { ...r, markup_data: null })) as { ms: number };
      generationMs.push(g.ms);
      await new Promise((res) => setTimeout(res, 100));
    }
  }
  return { projectId, fileIds: rows.map((r) => r.id), generationMs };
}

/**
 * Every storage IMAGE request the page makes, classified: a stored thumbnail
 * (`….thumb.webp`), a live `/render/image/` transform (the per-view route that
 * was ruled out — must stay ZERO), or a full file (original or derivative).
 */
export function watchStorageImages(page: Page): { thumbs: string[]; originals: string[]; renders: string[] } {
  const seen = { thumbs: [] as string[], originals: [] as string[], renders: [] as string[] };
  page.on('request', (r: Request) => {
    if (r.resourceType() !== 'image') return;
    const u = r.url();
    if (!u.includes('/storage/v1/')) return;
    if (u.includes('/storage/v1/render/image/')) seen.renders.push(u);
    else if (/\.thumb\.webp\?/.test(u)) seen.thumbs.push(u);
    else if (u.includes('/storage/v1/object/')) seen.originals.push(u);
  });
  return seen;
}
