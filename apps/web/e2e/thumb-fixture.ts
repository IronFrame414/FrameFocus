import type { Page, Request } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { deleteProjects } from '../test-support/company-purge';

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
  for (let i = 0; i < rows.length; i += 100) {
    await admin.storage.from(BUCKET).remove(rows.slice(i, i + 100).map((r) => r.file_path));
  }
  if (rows.length) await admin.from('files').delete().in('id', rows.map((r) => r.id));
  await deleteProjects(admin, ids);
}

/** Creates the project and its photos; returns the project id. */
export async function setupThumbFixture(tag: string): Promise<string> {
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
    const up = await admin.storage.from(BUCKET).upload(path, PNG_8, { contentType: 'image/png' });
    if (up.error) throw new Error(`upload ${n}: ${up.error.message}`);
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
  return projectId;
}

/**
 * Every storage IMAGE request the page makes, classified. `/render/image/` is a
 * thumbnail; `/object/` is an original (or a derivative at full size).
 */
export function watchStorageImages(page: Page): { thumbs: string[]; originals: string[] } {
  const seen = { thumbs: [] as string[], originals: [] as string[] };
  page.on('request', (r: Request) => {
    if (r.resourceType() !== 'image') return;
    const u = r.url();
    if (!u.includes('/storage/v1/')) return;
    if (u.includes('/storage/v1/render/image/')) seen.thumbs.push(u);
    else if (u.includes('/storage/v1/object/')) seen.originals.push(u);
  });
  return seen;
}
