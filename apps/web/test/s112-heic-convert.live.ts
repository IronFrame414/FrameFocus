import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const heicScript = require('../../../scripts/s112-heic-convert.cjs') as {
  EVIDENCE_FIELDS: readonly string[];
};
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { derivativePathFor, thumbPathFor } from '@framefocus/shared/utils/markup';
import {
  REQUIRED_PROJECT_REF,
  admin,
  assertRebuildTest,
  sessionFor,
  sweepProjectsNamed,
} from './live-session';

// ============================================================================
// S112 R7 — scripts/s112-heic-convert.cjs, end to end on rebuild-test.
// ============================================================================
// RULED [Josh, S112 R7]: one-time conversion of legacy HEIC photos to a stored
// JPEG. His condition, the reason this file exists: "repointing
// files.file_path CHANGES THE THUMBNAIL NAME ... Repoint the path and every
// converted photo's thumbnail is orphaned and unreadable. Say how you handle
// that ... and prove it before Josh runs anything."
//
// Handled by COPYING the side objects to the new path's names in the same
// pass — plain thumbnail, marked thumbnail, markup derivative — and leaving
// every old object untouched, so undo is lossless. This proves it as the
// person who depends on it: a SUBCONTRACTOR assigned to the project, whose
// only way to read a thumbnail is 20261810000000's assignment policy — the one
// that finds the parent row by regexp_replace on the object name.
//
// Its own rows only (`--only-ids`); the real HEIC bytes are copied from the
// smallest live HEIC on rebuild-test, which is itself never touched.
// ============================================================================

const MARKER = 'S112HEIC';
const OWNER = 'josh+test50@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const BUCKET = 'project-files';
const SCRIPT = resolve(__dirname, '../../../scripts/s112-heic-convert.cjs');
const WEBP = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'); // 1x1
const MARKUP = {
  version: 2,
  imageWidth: 3024,
  imageHeight: 4032,
  shapes: [{ type: 'rectangle', x: 10, y: 10, w: 100, h: 100, color: '#ff0000', strokeWidth: 8 }],
};
const KEYS = ['plain', 'marked'] as const;
type Key = (typeof KEYS)[number];

let subC: SupabaseClient;
let companyId = '';
let projectId = '';
let heic: Buffer;
const row: Record<Key, { id: string; path: string; markup: unknown }> = {
  plain: { id: '', path: '', markup: null },
  marked: { id: '', path: '', markup: null },
};
const undoFile = join(mkdtempSync(join(tmpdir(), 's112heic-')), 'undo.jsonl');

function run(args: string[]) {
  const r = spawnSync(
    'node',
    [SCRIPT, '--project-ref', REQUIRED_PROJECT_REF, '--only-ids', `${row.plain.id},${row.marked.id}`, ...args],
    { env: process.env, encoding: 'utf8', timeout: 240_000 }
  );
  console.log(`[S112 R7] ${args.join(' ') || '(dry run)'} → exit ${r.status}\n${(r.stdout + r.stderr).slice(-1500)}`);
  return r;
}

/** Signing is an RLS decision taken in the database on every call. */
async function readable(c: SupabaseClient, path: string) {
  const { data } = await c.storage.from(BUCKET).createSignedUrl(path, 60);
  return data?.signedUrl ? 1 : 0;
}

/** A GET, which may be answered from a cache primed by an earlier read. */
async function downloadable(c: SupabaseClient, path: string) {
  const { data } = await c.storage.from(BUCKET).download(path);
  return data ? 1 : 0;
}

async function exists(path: string) {
  const slash = path.lastIndexOf('/');
  const { data } = await admin.storage
    .from(BUCKET)
    .list(path.slice(0, slash), { search: path.slice(slash + 1) });
  return (data ?? []).some((o) => o.name === path.slice(slash + 1));
}

function sideObjects(path: string, markup: unknown) {
  const out = [thumbPathFor(path, markup)];
  if (markup) out.push(derivativePathFor(path));
  return out;
}

async function sweep() {
  const { data } = await admin.from('files').select('id, file_path, markup_data').like('file_name', `${MARKER}%`);
  for (const r of (data ?? []) as { id: string; file_path: string; markup_data: unknown }[]) {
    const base = r.file_path.replace(/\.jpg$/, '');
    const paths = [base, `${base}.jpg`, ...sideObjects(base, r.markup_data), ...sideObjects(`${base}.jpg`, r.markup_data)];
    await admin.storage.from(BUCKET).remove(paths);
    await admin.from('files').delete().eq('id', r.id);
  }
  await sweepProjectsNamed(MARKER);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  subC = await sessionFor(SUB);
  const { data: owner } = await admin.from('profiles').select('company_id').eq('email', OWNER).eq('is_deleted', false).single();
  companyId = (owner as { company_id: string }).company_id;

  // The smallest live HEIC, ordered so the pick is stable; any real HEIC will
  // do — nothing downstream depends on which.
  const { data: src } = await admin
    .from('files')
    .select('file_path')
    .eq('is_deleted', false)
    .eq('company_id', companyId)
    .or('mime_type.in.(image/heic,image/heif),file_name.ilike.*.heic')
    .order('file_size', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const dl = await admin.storage.from(BUCKET).download((src as { file_path: string }).file_path);
  expect(dl.error, dl.error?.message).toBeNull();
  heic = Buffer.from(await dl.data!.arrayBuffer());
  expect(heic.subarray(4, 12).toString('latin1'), 'source is not an ISO-BMFF HEIC').toMatch(/^ftyp(heic|heix|mif1|msf1)/);

  const { data: sub } = await admin.from('profiles').select('id').eq('email', SUB).eq('is_deleted', false).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (sub as { id: string }).id)
    .eq('is_deleted', false)
    .single();
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const { data: counters } = await admin.from('companies').select('project_internal_sequence').eq('id', companyId).single();
  const internal = (counters as { project_internal_sequence: number }).project_internal_sequence + 1;
  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} conversion proof`,
      contact_id: (c as { id: string }).id,
      project_type: 'fixed_price',
      project_number: `PRJ-${MARKER}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  expect(pErr, pErr?.message).toBeNull();
  projectId = (project as { id: string }).id;
  await admin.from('companies').update({ project_internal_sequence: internal }).eq('id', companyId);
  const asg = await admin
    .from('project_assignments')
    .insert({ company_id: companyId, project_id: projectId, member_id: (m as { id: string }).id, role_on_project: 'crew' });
  expect(asg.error, asg.error?.message).toBeNull();

  for (const key of KEYS) {
    const id = crypto.randomUUID();
    const name = `${MARKER}-${key}.heic`;
    // Both real path shapes: a project photo ({company}/{project}/…) and a
    // converted estimate photo ({company}/estimates/{estimate}/…). Neither is
    // covered by a path-based policy — for a non-owner the ONLY read of a
    // thumbnail is 20261810000000's regexp_replace lookup of the parent row —
    // so the trap bites on both (§3d measures it).
    const path =
      key === 'plain'
        ? `${companyId}/${projectId}/${id}-${name}`
        : `${companyId}/estimates/${crypto.randomUUID()}/${id}-${name}`;
    // Legacy shape: stored as octet-stream, exactly as the old uploads were.
    expect(
      (await admin.storage.from(BUCKET).upload(path, heic, { contentType: 'application/octet-stream' })).error
    ).toBeNull();
    const ins = await admin.from('files').insert({
      id,
      company_id: companyId,
      project_id: projectId,
      category: 'photos',
      file_name: name,
      file_path: path,
      file_size: heic.length,
      mime_type: 'image/heic',
      markup_data: key === 'marked' ? MARKUP : null,
    });
    expect(ins.error, ins.error?.message).toBeNull();
    const { data: back } = await admin.from('files').select('markup_data').eq('id', id).single();
    const markup = (back as { markup_data: unknown }).markup_data;
    for (const side of sideObjects(path, markup)) {
      expect((await admin.storage.from(BUCKET).upload(side, WEBP, { contentType: 'image/webp' })).error).toBeNull();
    }
    row[key] = { id, path, markup };
  }
}, 240_000);

afterAll(async () => {
  await sweep();
}, 240_000);

describe('S112 R7 · 1. before: the assigned sub reads each thumbnail (control for §3)', () => {
  for (const k of KEYS) {
    it(`1-${k}`, async () => {
      expect(await readable(subC, thumbPathFor(row[k].path, row[k].markup))).toBe(1);
    });
  }
});

describe('S112 R7 · 2. dry run writes nothing', () => {
  it('2a — exit 0, rows and storage unchanged', async () => {
    const r = run([]);
    expect(r.status).toBe(0);
    for (const k of KEYS) {
      const { data } = await admin.from('files').select('file_path, mime_type').eq('id', row[k].id).single();
      expect(data).toEqual({ file_path: row[k].path, mime_type: 'image/heic' });
      expect(await exists(`${row[k].path}.jpg`), `${k}: dry run created a JPEG`).toBe(false);
    }
  });
});

describe('S112 R7 · 3. apply — repointed, AND every side object still readable at the new name', () => {
  it('3a — exit 0', () => {
    expect(run(['--apply', '--undo-file', undoFile]).status).toBe(0);
  });

  for (const k of KEYS) {
    it(`3b-${k} — row repointed to a real JPEG`, async () => {
      const { data } = await admin
        .from('files')
        .select('file_path, mime_type, file_name, file_size')
        .eq('id', row[k].id)
        .single();
      const d = data as { file_path: string; mime_type: string; file_name: string; file_size: number };
      expect(d.file_path).toBe(`${row[k].path}.jpg`);
      expect(d.mime_type).toBe('image/jpeg');
      expect(d.file_name).toMatch(/\.jpg$/);
      const dl = await admin.storage.from(BUCKET).download(d.file_path);
      const bytes = Buffer.from(await dl.data!.arrayBuffer());
      console.log(`[S112 R7 3b-${k}] ${bytes.length} B JPEG, stored size ${d.file_size}, HEIC was ${heic.length} B`);
      expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect(d.file_size).toBe(bytes.length);
      // [S112 Q3, RULED Josh] Capture time and GPS are EVIDENCE. The converted
      // JPEG must carry every field the HEIC carried, unchanged, at full size.
      const fmt = ['%w', '%h', ...heicScript.EVIDENCE_FIELDS.map((k) => `%[EXIF:${k}]`)].join('|');
      const read = (b: Buffer) => String(spawnSync('magick', ['identify', '-format', fmt, '-'], { input: b }).stdout);
      const src = read(heic);
      console.log(`[S112 R7 3b-${k}] evidence HEIC: ${src}\n                  JPEG: ${read(bytes)}`);
      expect(src.split('|').slice(2).every(Boolean), 'the source HEIC carries no evidence — vacuous').toBe(true);
      expect(read(bytes)).toBe(src);
      // The whole point: the served type is one a browser renders.
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(d.file_path, 60);
      const head = await fetch(signed!.signedUrl, { method: 'HEAD' });
      expect(head.headers.get('content-type')).toBe('image/jpeg');
    });

    it(`3c-${k} — THE TRAP: the assigned sub reads the thumbnail at the NEW name`, async () => {
      const newThumb = thumbPathFor(`${row[k].path}.jpg`, row[k].markup);
      const r = await readable(subC, newThumb);
      console.log(`[S112 R7 3c-${k}] sub reads ${newThumb.split('/').pop()}: ${r} (expected 1)`);
      expect(r).toBe(1);
    });

    it(`3d-${k} — THE TRAP, measured: the OLD thumbnail name is orphaned for the sub`, async () => {
      const r = await readable(subC, thumbPathFor(row[k].path, row[k].markup));
      const g = await downloadable(subC, thumbPathFor(row[k].path, row[k].markup));
      console.log(`[S112 R7 3d-${k}] sub, OLD thumbnail name: sign ${r}, download ${g}`);
      // Orphaned: no files row names the old path any more. This is the trap
      // Josh named, measured; 3c's read of the COPY at the new name is the fix.
      //
      // ⚠️ Probe by SIGNING, and a GET only alongside it. A first version of
      // this file probed with download() and read 1 here: section 1 had
      // already GOT the same object, and the repeat GET was answered from a
      // cache rather than by the policy. With no earlier GET, download reads 0
      // too. A cached read is not a policy decision.
      expect(r).toBe(0);
      expect(g).toBe(0);
    });
  }

  it('3e — the marked photo’s derivative was copied to the new name', async () => {
    expect(await exists(derivativePathFor(`${row.marked.path}.jpg`))).toBe(true);
  });

  it('3f — originals are untouched', async () => {
    for (const k of KEYS) expect(await exists(row[k].path), k).toBe(true);
  });

  it('3g — --verify agrees (exit 0)', () => {
    expect(run(['--verify', undoFile]).status).toBe(0);
  });
});

describe('S112 R7 · 4. undo restores exactly', () => {
  it('4a — exit 0', () => {
    expect(run(['--undo', undoFile, '--apply']).status).toBe(0);
  });

  for (const k of KEYS) {
    it(`4b-${k} — row back, new objects gone, sub reads the old thumbnail again`, async () => {
      const { data } = await admin.from('files').select('file_path, mime_type').eq('id', row[k].id).single();
      expect(data).toEqual({ file_path: row[k].path, mime_type: 'image/heic' });
      expect(await exists(`${row[k].path}.jpg`)).toBe(false);
      for (const side of sideObjects(`${row[k].path}.jpg`, row[k].markup)) expect(await exists(side), side).toBe(false);
      expect(await readable(subC, thumbPathFor(row[k].path, row[k].markup))).toBe(1);
    });
  }

  it('4c — the undo file recorded both rows', () => {
    const lines = readFileSync(undoFile, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});
