/**
 * S120 1-A — TECH_DEBT #175: a record's `pdf_file_id` cannot reach another
 * company's file.
 *
 * The hole (S119 ITEM A-3): PDF regeneration reads the record's current
 * `pdf_file_id` and hard-deletes that `files` row and its object WITH THE
 * SERVICE ROLE. The record's author could set `pdf_file_id` to any file id — the
 * FK is checked without RLS — so the next regeneration destroyed a foreign file.
 *
 * Two halves, each proven here on its own:
 *   WRITE  — migration 20262110000000: an authenticated user cannot set or
 *            change `pdf_file_id` (INSERT or UPDATE). The attempt is made AS THE
 *            AUTHOR, WITHOUT returning rows, and judged by the service role.
 *   DELETE — the services: with the pointer forced onto a foreign file (service
 *            role, standing in for "a pointer that got there some other way"),
 *            regeneration through the REAL route, in-process, as the author,
 *            leaves the foreign row AND object in place.
 * POSITIVE CONTROL — a legitimate stale PDF (own company, right category) IS
 * still removed by regeneration, so "the victim survived" cannot pass on a
 * cleanup that silently stopped running.
 *
 * Three tables with a regeneration route: daily_logs, deliveries,
 * safety_incidents. Fixtures carry the marker S120P and are swept before/after.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => h.client,
  getRequestUser: async () =>
    (await (h.client as SupabaseClient).auth.getUser()).data.user ?? null,
}));

const MARKER = 'S120P';
const BUCKET = 'project-files';
const OWNER = 'josh+test50@worthprop.com';
const AUTHOR = 'josh+crew@worthprop.com';

type Kind = 'daily_logs' | 'deliveries' | 'safety_incidents';
const KINDS: Kind[] = ['daily_logs', 'deliveries', 'safety_incidents'];
const CATEGORY: Record<Kind, string> = {
  daily_logs: 'daily_logs',
  deliveries: 'deliveries',
  safety_incidents: 'safety',
};

let companyA = '';
let projectA = '';
let companyB = '';
let projectB = '';
let authorMember = '';
let author: SupabaseClient;
const record: Partial<Record<Kind, string>> = {};
const victim: Partial<Record<Kind, { id: string; path: string }>> = {};
const objects: string[] = [];

const must = (l: string, e: { message: string } | null) => {
  if (e) throw new Error(`${l}: ${e.message}`);
};

async function putFile(
  company: string,
  project: string,
  category: string,
  tag: string
): Promise<{ id: string; path: string }> {
  const path = `${company}/${project}/${MARKER}-${tag}-${Date.now()}.pdf`;
  must(
    `object ${tag}`,
    (
      await admin.storage
        .from(BUCKET)
        .upload(path, Buffer.from(`%PDF-1.4 ${MARKER} ${tag}`), { contentType: 'application/pdf' })
    ).error
  );
  objects.push(path);
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: company,
      project_id: project,
      category,
      file_name: `${MARKER}-${tag}.pdf`,
      file_path: path,
      file_size: 20,
      mime_type: 'application/pdf',
      created_by: null,
    })
    .select('id')
    .single();
  must(`files ${tag}`, error);
  return { id: (data as { id: string }).id, path };
}

/**
 * Service role: does the files row exist, and is the object still in the
 * bucket? The object is judged by LISTING its folder, never by download():
 * a download can be answered from the storage CDN after the object is gone
 * (S112 Q6 / S180 — measured on the first run of this file, where every
 * removed object still "downloaded").
 */
async function exists(f: { id: string; path: string }): Promise<{ row: boolean; object: boolean }> {
  const { count } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('id', f.id);
  const cut = f.path.lastIndexOf('/');
  const name = f.path.slice(cut + 1);
  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(f.path.slice(0, cut), { search: name, limit: 100 });
  must('list', error);
  return { row: (count ?? 0) === 1, object: (data ?? []).some((o) => o.name === name) };
}

async function pointerOf(kind: Kind): Promise<string | null> {
  const { data } = await admin.from(kind).select('pdf_file_id').eq('id', record[kind]!).single();
  return (data as { pdf_file_id: string | null }).pdf_file_id;
}

async function setPointer(kind: Kind, fileId: string | null): Promise<void> {
  must(
    `set pointer ${kind}`,
    (await admin.from(kind).update({ pdf_file_id: fileId } as never).eq('id', record[kind]!)).error
  );
}

const ROUTE: Record<Kind, string> = {
  daily_logs: '@/app/api/daily-logs/[id]/pdf/route',
  deliveries: '@/app/api/deliveries/[id]/pdf/route',
  safety_incidents: '@/app/api/safety-incidents/[id]/pdf/route',
};
const URL_SEGMENT: Record<Kind, string> = {
  daily_logs: 'daily-logs',
  deliveries: 'deliveries',
  safety_incidents: 'safety-incidents',
};

/** The real regeneration route, in-process, as the AUTHOR. */
async function regenerate(kind: Kind): Promise<number> {
  h.client = author;
  const mod = (await import(ROUTE[kind])) as {
    POST: (req: NextRequest, ctx: { params: { id: string } }) => Promise<Response>;
  };
  const id = record[kind]!;
  const res = await mod.POST(
    new NextRequest(`http://localhost/api/${URL_SEGMENT[kind]}/${id}/pdf`, { method: 'POST' }),
    { params: { id } }
  );
  return res.status;
}

async function sweep(): Promise<void> {
  // Each record's current PDF (made by a regeneration) goes with the record.
  for (const [kind, col, val] of [
    ['daily_logs', 'work_performed', `${MARKER}%`],
    ['deliveries', 'vendor_name', `${MARKER}%`],
    ['safety_incidents', 'description', `${MARKER}%`],
  ] as const) {
    const { data } = await admin.from(kind).select('id, pdf_file_id').like(col, val);
    for (const r of (data ?? []) as Array<{ id: string; pdf_file_id: string | null }>) {
      if (r.pdf_file_id) {
        const { data: f } = await admin.from('files').select('id, file_path').eq('id', r.pdf_file_id).maybeSingle();
        await admin.from(kind).update({ pdf_file_id: null } as never).eq('id', r.id);
        if (f) {
          await admin.storage.from(BUCKET).remove([(f as { file_path: string }).file_path]);
          await admin.from('files').delete().eq('id', (f as { id: string }).id);
        }
      }
      await admin.from(kind).delete().eq('id', r.id);
    }
  }
  const { data: fs } = await admin.from('files').select('id, file_path').like('file_name', `${MARKER}%`);
  for (const f of (fs ?? []) as Array<{ id: string; file_path: string }>) {
    await admin.storage.from(BUCKET).remove([f.file_path]);
    await admin.from('files').delete().eq('id', f.id);
  }
  if (objects.length) await admin.storage.from(BUCKET).remove(objects);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: prof } = await admin.from('profiles').select('company_id').eq('email', OWNER).single();
  companyA = (prof as { company_id: string }).company_id;
  const { data: ap } = await admin.from('profiles').select('id, user_id, company_id').eq('email', AUTHOR).single();
  if ((ap as { company_id: string }).company_id !== companyA) throw new Error('author is not in company A');
  const { data: am } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (ap as { id: string }).id)
    .eq('is_deleted', false)
    .single();
  authorMember = (am as { id: string }).id;
  author = await sessionFor(AUTHOR);
  // A project of company A the author can SEE (the routes read through RLS),
  // picked by stable order and scoped to what the probe depends on.
  const { data: vp } = await author.from('projects').select('id').eq('company_id', companyA).order('id').limit(1).single();
  projectA = (vp as { id: string }).id;
  const { data: bp } = await admin.from('projects').select('id, company_id').neq('company_id', companyA).order('id').limit(1).single();
  projectB = (bp as { id: string }).id;
  companyB = (bp as { company_id: string }).company_id;

  const today = new Date().toISOString().slice(0, 10);
  const { data: dl, error: dlErr } = await admin
    .from('daily_logs')
    .insert({ company_id: companyA, project_id: projectA, log_date: today, author_member_id: authorMember, work_performed: `${MARKER} work` })
    .select('id')
    .single();
  must('daily_log', dlErr);
  record.daily_logs = (dl as { id: string }).id;
  const { data: dv, error: dvErr } = await admin
    .from('deliveries')
    .insert({ company_id: companyA, project_id: projectA, delivery_date: today, vendor_name: `${MARKER} vendor`, received_by: authorMember })
    .select('id')
    .single();
  must('delivery', dvErr);
  record.deliveries = (dv as { id: string }).id;
  const { data: si, error: siErr } = await admin
    .from('safety_incidents')
    .insert({ company_id: companyA, project_id: projectA, incident_date: today, incident_type: 'near_miss', description: `${MARKER} incident`, reported_by_member_id: authorMember })
    .select('id')
    .single();
  must('incident', siErr);
  record.safety_incidents = (si as { id: string }).id;

  // The victims: ANOTHER company's file, in the SAME category the cleanup
  // expects, so only the company check can protect it.
  for (const k of KINDS) victim[k] = await putFile(companyB, projectB, CATEGORY[k], `victim-${k}`);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('files').select('id', { count: 'exact', head: true }).like('file_name', `${MARKER}%`);
  expect(count ?? 0, 'S120P files survived teardown').toBe(0);
}, 240_000);

describe('CONTROL — fixtures exist (service role)', () => {
  it('3 records in company A, 3 victim files (row + object) in company B', async () => {
    for (const k of KINDS) {
      expect(record[k], `${k} record`).toBeTruthy();
      expect(await exists(victim[k]!), `victim ${k}`).toEqual({ row: true, object: true });
    }
    expect(companyB).not.toBe(companyA);
  });
});

describe('WRITE — the author cannot point a record at a file (no returning; judged by service role)', () => {
  for (const k of KINDS) {
    it(`${k}: UPDATE pdf_file_id → a foreign file id is refused; the pointer is unchanged`, async () => {
      await setPointer(k, null);
      const { error } = await author.from(k).update({ pdf_file_id: victim[k]!.id } as never).eq('id', record[k]!);
      const after = await pointerOf(k);
      console.log(`[S120P] ${k} author UPDATE → error=${error?.code ?? 'none'} pointer=${after === victim[k]!.id ? 'VICTIM' : String(after)}`);
      expect(after).toBeNull();
      expect(error?.code).toBe('42501');
    });
  }

  it('daily_logs: INSERT with pdf_file_id set is refused (service-role count 0)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await author.from('daily_logs').insert({
      project_id: projectA,
      log_date: today,
      author_member_id: authorMember,
      work_performed: `${MARKER} insert-probe`,
      pdf_file_id: victim.daily_logs!.id,
    } as never);
    const { count } = await admin
      .from('daily_logs')
      .select('id', { count: 'exact', head: true })
      .eq('work_performed', `${MARKER} insert-probe`)
      .not('pdf_file_id', 'is', null);
    console.log(`[S120P] daily_logs author INSERT with pointer → error=${error?.code ?? 'none'} rows-with-pointer=${count}`);
    expect(count ?? 0).toBe(0);
    expect(error).not.toBeNull();
  });
});

describe('DELETE — regeneration (real route, as the author) never removes another company’s file', () => {
  for (const k of KINDS) {
    it(`${k}: pointer forced onto a foreign file → route 200, the foreign row AND object survive`, async () => {
      await setPointer(k, victim[k]!.id);
      const before = await exists(victim[k]!);
      const status = await regenerate(k);
      const after = await exists(victim[k]!);
      const pointer = await pointerOf(k);
      console.log(`[S120P] ${k} regenerate status=${status} victim before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
      expect(before).toEqual({ row: true, object: true });
      expect(status).toBe(200);
      // The regeneration really ran: the record now points at a NEW PDF.
      expect(pointer).not.toBeNull();
      expect(pointer).not.toBe(victim[k]!.id);
      expect(after).toEqual({ row: true, object: true });
    });
  }
});

describe('POSITIVE CONTROL — a legitimate stale PDF (own company, right category) IS removed', () => {
  for (const k of KINDS) {
    it(`${k}: regeneration removes the record's own previous PDF (row + object)`, async () => {
      const stale = await putFile(companyA, projectA, CATEGORY[k], `stale-${k}`);
      await setPointer(k, stale.id);
      expect(await exists(stale)).toEqual({ row: true, object: true });
      const status = await regenerate(k);
      const after = await exists(stale);
      console.log(`[S120P] ${k} own stale after regenerate: ${JSON.stringify(after)}`);
      expect(status).toBe(200);
      expect(after).toEqual({ row: false, object: false });
    });
  }
});
