import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

// files.ts imports the cookie-bound server client; only its FILTER CONSTANT is
// used here, run through the service role against real rows.
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }));
import { PHOTO_VIEW_FILTER } from '@/lib/services/files';

// ===========================================================================
// S114 C-2 [RULED Josh 2026-09-28] — WHAT THE PHOTOS VIEW SHOWS, against
// real PostgREST, not a mock of it.
//
//   Photos = category 'photos' (whole) + IMAGES filed under daily_logs/safety.
//   Files  = every category except 'photos' (unchanged — getDocumentFiles).
//
// So a daily-log IMAGE is in both lists (it can be marked up, and it does not
// vanish from Files); a daily-log PDF is in Files only; a receipt image and an
// 'other' image are in Files only. Row counts are asserted exactly, so nothing
// here can pass on an empty set.
// ===========================================================================

const MARK = `S114PV-${Date.now()}`;
let companyId = '';
let projectId = '';
const ids: Record<string, string> = {};

const FIXTURES: Array<{ key: string; category: string; mime: string }> = [
  { key: 'photo_jpg', category: 'photos', mime: 'image/jpeg' },
  { key: 'log_jpg', category: 'daily_logs', mime: 'image/jpeg' },
  { key: 'log_pdf', category: 'daily_logs', mime: 'application/pdf' },
  { key: 'safety_png', category: 'safety', mime: 'image/png' },
  { key: 'receipt_jpg', category: 'receipts', mime: 'image/jpeg' },
  { key: 'other_jpg', category: 'other', mime: 'image/jpeg' },
];

beforeAll(async () => {
  assertRebuildTest();
  // Any live project on the connected test company; the rows below are this
  // file's own and are removed in afterAll. Ordered: any stable project will do.
  const { data: proj, error } = await admin
    .from('projects')
    .select('id, company_id')
    .eq('is_deleted', false)
    .order('created_at')
    .order('id')
    .limit(1)
    .single();
  if (error || !proj) throw new Error(`no project on rebuild-test: ${error?.message}`);
  projectId = proj.id;
  companyId = proj.company_id;

  for (const f of FIXTURES) {
    const { data, error: e } = await admin
      .from('files')
      .insert({
        company_id: companyId,
        project_id: projectId,
        category: f.category,
        file_name: `${MARK}-${f.key}`,
        file_path: `${companyId}/${projectId}/${MARK}-${f.key}`,
        file_size: 1,
        mime_type: f.mime,
      })
      .select('id')
      .single();
    if (e || !data) throw new Error(`fixture ${f.key}: ${e?.message}`);
    ids[f.key] = data.id;
  }
});

afterAll(async () => {
  const all = Object.values(ids);
  if (all.length) await admin.from('files').delete().in('id', all);
});

async function namesFor(apply: (q: ReturnType<typeof base>) => ReturnType<typeof base>) {
  const { data, error } = await apply(base());
  expect(error, error?.message).toBeNull();
  return (data ?? []).map((r) => (r.file_name as string).slice(MARK.length + 1)).sort();
}
function base() {
  return admin
    .from('files')
    .select('file_name')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .like('file_name', `${MARK}-%`);
}

describe('S114 C-2 — the Photos view and the Files list, on real rows', () => {
  it('fixtures landed (6 rows, not vacuous)', async () => {
    expect(await namesFor((q) => q)).toHaveLength(6);
  });

  it('Photos = photos + daily-log image + safety image — exactly 3', async () => {
    expect(await namesFor((q) => q.or(PHOTO_VIEW_FILTER))).toEqual(
      ['log_jpg', 'photo_jpg', 'safety_png'].sort()
    );
  });

  it('Files (category <> photos, getDocumentFiles) still lists the daily-log and safety images — exactly 5', async () => {
    expect(await namesFor((q) => q.neq('category', 'photos'))).toEqual(
      ['log_jpg', 'log_pdf', 'other_jpg', 'receipt_jpg', 'safety_png'].sort()
    );
  });

  it('⚠️ a daily-log PDF is never a photo, and a receipt image never joins Photos', async () => {
    const photos = await namesFor((q) => q.or(PHOTO_VIEW_FILTER));
    expect(photos).not.toContain('log_pdf');
    expect(photos).not.toContain('receipt_jpg');
    expect(photos).not.toContain('other_jpg');
  });
});
