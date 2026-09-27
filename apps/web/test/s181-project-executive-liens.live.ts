/**
 * S181 — the Project Executive's LIEN RELEASES (FILL-C-4) and JOB-COST READS
 * (Q4), proven against the database with the real `josh+qa-pe` session.
 *
 * RULED [Josh]: lien-release authority INCLUDED (2026-09-26); both directions
 * (S181 Q5 B); read-only templates (Q6 A); read-only expenses, allocations and
 * expense payments (Q4 A). Migrations 20261920000000 + 20261930000000.
 *
 * ⚠️ NEGATIVE FIRST. The OFF half — a release, an expense, a money file on a
 * project the PE is NOT assigned to — is the floor, and it is asserted before
 * the ON half and with a service-role control count beside every zero, so a
 * zero is a floor and never an empty fixture. Run BEFORE the migrations, the
 * ON half goes red and the OFF half stays green.
 *
 * ⚠️ DISPOSABLE FIXTURES (`PEL` marker): two projects of its own (ON / OFF),
 * a PE assignment on ON only, and every row below hangs off one of them. Swept
 * on the way in (a killed run) and on the way out. RUN ONLY WHILE NO CI IS LIVE.
 *
 *   npx vitest run --config test/live.vitest.config.ts s181-project-executive-liens
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const PE = 'josh+qa-pe@worthprop.com';
const MARKER = 'PEL';
const BUCKET = 'project-files';

const OUT: Record<string, unknown> = {};
const record = (k: string, v: unknown) => {
  OUT[k] = v;
  if (process.env.PE_LIENS_OUT) writeFileSync(process.env.PE_LIENS_OUT, JSON.stringify(OUT, null, 2));
};

type Side = 'on' | 'off';
let pe: SupabaseClient;
let companyId = '';
let peMemberId = '';
let subMemberId = '';
/** The fixtures' AUTHOR — never the PE: `expenses_select_scoped` admits any
 *  role to rows it authored, which would make an OFF zero unreachable. */
let ownerMemberId = '';
let contactId = '';
let clientTemplateId = '';
let subTemplateId = '';
const proj: Record<Side, string> = { on: '', off: '' };
const inv: Record<Side, string> = { on: '', off: '' };
const exp: Record<Side, string> = { on: '', off: '' };
const sc: Record<Side, string> = { on: '', off: '' };
const bi: Record<Side, string> = { on: '', off: '' };
const moneyFile: Record<Side, string> = { on: '', off: '' };
/** Releases the SERVICE ROLE made on OFF: invoice, expense, subcontract. */
const offReleases: string[] = [];
/** Releases the PE made on ON. */
const onReleases: string[] = [];
const storagePaths: string[] = [];

async function projectIds(): Promise<string[]> {
  const { data } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  return (data ?? []).map((p) => p.id as string);
}

async function sweep() {
  const ids = await projectIds();
  if (ids.length) {
    const invIds = ((await admin.from('invoices').select('id').in('project_id', ids)).data ?? []).map((r) => r.id);
    const expIds = ((await admin.from('expenses').select('id').in('project_id', ids)).data ?? []).map((r) => r.id);
    const scIds = (
      (await admin.from('subcontractor_contracts').select('id').in('project_id', ids)).data ?? []
    ).map((r) => r.id);
    if (invIds.length) await admin.from('lien_releases').delete().in('invoice_id', invIds);
    if (expIds.length) await admin.from('lien_releases').delete().in('expense_id', expIds);
    if (scIds.length) await admin.from('lien_releases').delete().in('sub_contract_id', scIds);
    if (expIds.length) {
      await admin.from('expense_payments').delete().in('expense_id', expIds);
      await admin.from('expense_allocations').delete().in('expense_id', expIds);
      await admin.from('expenses').delete().in('id', expIds);
    }
    await admin.from('files').delete().in('project_id', ids);
    if (invIds.length) await admin.from('invoices').delete().in('id', invIds);
    await admin.from('subcontractor_contracts').delete().in('project_id', ids);
    await admin.from('project_budget_items').delete().in('project_id', ids);
    await admin.from('project_assignments').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
  // Uploaded executed copies: rows by path, objects by path.
  if (companyId) {
    const { data: fs } = await admin
      .from('files')
      .select('id, file_path')
      .like('file_path', `${companyId}/lien-releases/%`)
      .like('file_name', `${MARKER.toLowerCase()}-%`);
    const paths = (fs ?? []).map((f) => f.file_path as string);
    if (fs?.length) await admin.from('files').delete().in('id', fs.map((f) => f.id));
    const all = [...new Set([...paths, ...storagePaths])];
    if (all.length) await admin.storage.from(BUCKET).remove(all);
  }
  await admin.from('contacts').delete().eq('last_name', `${MARKER} Client`);
}

/** One row or throw, naming the step. Callers cast the fields they read. */
async function one(
  label: string,
  q: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<Record<string, unknown>> {
  const { data, error } = await q;
  if (error || data === null || data === undefined) throw new Error(`${label}: ${error?.message ?? 'no row'}`);
  return data as Record<string, unknown>;
}

async function makeSide(side: Side, seq: number) {
  const tag = side.toUpperCase();
  proj[side] = (
    await one(
      `project ${tag}`,
      admin
        .from('projects')
        .insert({
          company_id: companyId,
          contact_id: contactId,
          project_number: `PRJ-PEL-${tag}`,
          name: `${MARKER} ${tag} project`,
          status: 'active',
          project_internal_seq: seq,
        })
        .select('id')
        .single()
    )
  ).id as string;
  bi[side] = (
    await one(
      `budget item ${tag}`,
      admin
        .from('project_budget_items')
        .insert({ company_id: companyId, project_id: proj[side], description: `${MARKER} line` })
        .select('id')
        .single()
    )
  ).id as string;
  inv[side] = (
    await one(
      `invoice ${tag}`,
      admin
        .from('invoices')
        .insert({
          company_id: companyId,
          project_id: proj[side],
          author_member_id: ownerMemberId,
          title: `${MARKER} invoice`,
          presentation_level: 'full_detail',
        })
        .select('id')
        .single()
    )
  ).id as string;
  exp[side] = (
    await one(
      `expense ${tag}`,
      admin
        .from('expenses')
        .insert({
          company_id: companyId,
          project_id: proj[side],
          author_member_id: ownerMemberId,
          supplier: `${MARKER} supplier`,
          expense_date: '2026-09-01',
          amount: 250,
          cost_category: 'subcontractor',
          state: 'actual',
          status: 'approved',
        })
        .select('id')
        .single()
    )
  ).id as string;
  await one(
    `allocation ${tag}`,
    admin
      .from('expense_allocations')
      .insert({ company_id: companyId, expense_id: exp[side], budget_item_id: bi[side], amount: 250 })
      .select('id')
      .single()
  );
  await one(
    `expense payment ${tag}`,
    admin
      .from('expense_payments')
      .insert({ company_id: companyId, expense_id: exp[side], paid_date: '2026-09-02', amount: 250, method: 'check' })
      .select('id')
      .single()
  );
  sc[side] = (
    await one(
      `subcontract ${tag}`,
      admin
        .from('subcontractor_contracts')
        .insert({ company_id: companyId, project_id: proj[side], member_id: subMemberId, status: 'draft' })
        .select('id')
        .single()
    )
  ).id as string;
  moneyFile[side] = (
    await one(
      `money file ${tag}`,
      admin
        .from('files')
        .insert({
          company_id: companyId,
          project_id: proj[side],
          invoice_id: inv[side],
          category: 'invoices',
          file_name: `${MARKER.toLowerCase()}-invoice-${tag}.pdf`,
          file_path: `${companyId}/${proj[side]}/${MARKER.toLowerCase()}-invoice-${tag}.pdf`,
          file_size: 1,
          mime_type: 'application/pdf',
        })
        .select('id')
        .single()
    )
  ).id as string;
}

beforeAll(async () => {
  assertRebuildTest();
  const prof = await one(
    `profile ${PE}`,
    admin.from('profiles').select('id, company_id, role').eq('email', PE).single()
  );
  expect(prof.role).toBe('project_executive');
  companyId = prof.company_id as string;
  peMemberId = (
    await one('PE member', admin.from('company_members').select('id').eq('profile_id', prof.id).single())
  ).id as string;
  ownerMemberId = (
    await one(
      'owner member',
      admin
        .from('company_members')
        .select('id, profile:profiles!inner(role)')
        .eq('company_id', companyId)
        .eq('profile.role', 'owner')
        .eq('is_deleted', false)
        .order('id')
        .limit(1)
        .single()
    )
  ).id as string;
  expect(ownerMemberId).not.toBe(peMemberId);
  subMemberId = (
    await one(
      'a sub member',
      admin
        .from('company_members')
        .select('id')
        .eq('company_id', companyId)
        .eq('member_type', 'subcontractor')
        .eq('is_deleted', false)
        .order('id')
        .limit(1)
        .single()
    )
  ).id as string;
  // Any template of each direction will do — the subject, not the form, is
  // what the scope reads. Ordered, so a rerun picks the same one.
  clientTemplateId = (
    await one(
      'client template',
      admin
        .from('lien_release_templates')
        .select('id')
        .eq('company_id', companyId)
        .eq('direction', 'client_outbound')
        .eq('is_deleted', false)
        .order('id')
        .limit(1)
        .single()
    )
  ).id as string;
  subTemplateId = (
    await one(
      'sub template',
      admin
        .from('lien_release_templates')
        .select('id')
        .eq('company_id', companyId)
        .eq('direction', 'sub_inbound')
        .eq('is_deleted', false)
        .order('id')
        .limit(1)
        .single()
    )
  ).id as string;

  await sweep();

  contactId = (
    await one(
      'contact',
      admin
        .from('contacts')
        .insert({ company_id: companyId, first_name: 'PE', last_name: `${MARKER} Client`, contact_type: 'client' })
        .select('id')
        .single()
    )
  ).id as string;
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = (seqRow?.project_internal_seq ?? 0) + 5000;
  await makeSide('on', base);
  await makeSide('off', base + 1);

  const { error: aErr } = await admin.from('project_assignments').insert({
    company_id: companyId,
    project_id: proj.on,
    member_id: peMemberId,
    role_on_project: 'project_executive',
  });
  if (aErr) throw new Error(`assign: ${aErr.message}`);

  // The OFF releases exist, made by the service role — so "the PE reads 0" is
  // about the floor, not about an empty table.
  for (const subject of [
    { direction: 'client_outbound', invoice_id: inv.off, template_id: clientTemplateId },
    { direction: 'sub_inbound', expense_id: exp.off, template_id: subTemplateId },
    { direction: 'sub_inbound', sub_contract_id: sc.off, template_id: subTemplateId },
  ]) {
    const row = await one(
      'OFF release',
      admin
        .from('lien_releases')
        .insert({ company_id: companyId, type: 'conditional', ...subject })
        .select('id')
        .single()
    );
    offReleases.push(row.id as string);
  }

  pe = await sessionFor(PE);
}, 240_000);

afterAll(async () => {
  await sweep();
  const left = (await projectIds()).length;
  record('teardown_projects_left', left);
  expect(left, 'disposable PEL projects survived teardown').toBe(0);
}, 240_000);

async function peCount(table: string, col: string, ids: string[]): Promise<number> {
  const { data, error } = await pe.from(table).select('id').in(col, ids);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []).length;
}
async function adminCount(table: string, col: string, ids: string[]): Promise<number> {
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).in(col, ids);
  return count ?? 0;
}

// ===========================================================================
// OFF — the floor. Written and asserted first.
// ===========================================================================
describe('S181 OFF — another project: the PE reaches NOTHING (control beside every zero)', () => {
  it('N1 reads 0 of the 3 lien releases on OFF (service role: 3)', async () => {
    const control = await adminCount('lien_releases', 'id', offReleases);
    const seen = await peCount('lien_releases', 'id', offReleases);
    record('N1_off_releases', { pe: seen, control });
    expect(control).toBe(3);
    expect(seen).toBe(0);
  });

  it('N2 cannot INSERT a release against any OFF subject (invoice, expense, subcontract)', async () => {
    const tries = [
      { direction: 'client_outbound', invoice_id: inv.off, template_id: clientTemplateId },
      { direction: 'sub_inbound', expense_id: exp.off, template_id: subTemplateId },
      { direction: 'sub_inbound', sub_contract_id: sc.off, template_id: subTemplateId },
    ];
    const landed: number[] = [];
    for (const t of tries) {
      const { data } = await pe.from('lien_releases').insert({ type: 'conditional', ...t }).select('id');
      landed.push(data?.length ?? 0);
    }
    const after = await adminCount('lien_releases', 'invoice_id', [inv.off]);
    record('N2_off_insert', { landed, clientReleasesOnOffInvoice: after });
    expect(landed).toEqual([0, 0, 0]);
    expect(after).toBe(1); // only the service role's
  });

  it('N3 an UPDATE of an OFF release touches 0 rows, and the row is unchanged', async () => {
    const { data } = await pe.from('lien_releases').update({ status: 'sent' }).in('id', offReleases).select('id');
    const { data: rows } = await admin.from('lien_releases').select('status').in('id', offReleases);
    record('N3_off_update', { touched: data?.length ?? 0, statuses: rows?.map((r) => r.status) });
    expect(data?.length ?? 0).toBe(0);
    expect((rows ?? []).map((r) => r.status)).toEqual(['draft', 'draft', 'draft']);
  });

  it('N4 reads 0 expenses / allocations / payments on OFF (service role: 1 each)', async () => {
    const counts = {
      expenses: [await peCount('expenses', 'id', [exp.off]), await adminCount('expenses', 'id', [exp.off])],
      allocations: [
        await peCount('expense_allocations', 'expense_id', [exp.off]),
        await adminCount('expense_allocations', 'expense_id', [exp.off]),
      ],
      payments: [
        await peCount('expense_payments', 'expense_id', [exp.off]),
        await adminCount('expense_payments', 'expense_id', [exp.off]),
      ],
    };
    record('N4_off_expenses_pe_control', counts);
    expect(counts).toEqual({ expenses: [0, 1], allocations: [0, 1], payments: [0, 1] });
  });

  it('N5 reads 0 money files (category invoices) on OFF (service role: 1)', async () => {
    const seen = await peCount('files', 'id', [moneyFile.off]);
    const control = await adminCount('files', 'id', [moneyFile.off]);
    record('N5_off_money_file', { pe: seen, control });
    expect(control).toBe(1);
    expect(seen).toBe(0);
  });

  it('N6 cannot upload an executed copy under an OFF release folder (storage AND files row)', async () => {
    const path = `${companyId}/lien-releases/${offReleases[0]}/${MARKER.toLowerCase()}-off.pdf`;
    storagePaths.push(path);
    const up = await pe.storage
      .from(BUCKET)
      .upload(path, new Blob(['%PDF-1.4 off'], { type: 'application/pdf' }), { upsert: false });
    const { data: row } = await pe
      .from('files')
      .insert({
        project_id: null,
        category: 'lien_releases',
        file_name: `${MARKER.toLowerCase()}-off.pdf`,
        file_path: path,
        file_size: 12,
        mime_type: 'application/pdf',
      })
      .select('id');
    record('N6_off_upload', { storageError: up.error?.message ?? null, fileRows: row?.length ?? 0 });
    expect(up.error, 'storage accepted an upload under another project’s release').not.toBeNull();
    expect(row?.length ?? 0).toBe(0);
  });

  it('N7 templates are READ-ONLY: an insert is refused', async () => {
    const { data } = await pe
      .from('lien_release_templates')
      .insert({ name: `${MARKER} template`, type: 'conditional', direction: 'client_outbound' })
      .select('id');
    record('N7_template_insert', data?.length ?? 0);
    expect(data?.length ?? 0).toBe(0);
  });
});

// ===========================================================================
// ON — its own project: the authority Josh ruled in.
// ===========================================================================
describe('S181 ON — its own project: reads and lien authority land', () => {
  it('Y1 reads the company templates and boxes (Q6) — same count as the service role', async () => {
    const { data: t } = await pe.from('lien_release_templates').select('id').eq('is_deleted', false);
    const { count: tc } = await admin
      .from('lien_release_templates')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_deleted', false);
    const { data: b } = await pe.from('lien_release_template_boxes').select('id').eq('is_deleted', false);
    const { count: bc } = await admin
      .from('lien_release_template_boxes')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_deleted', false);
    record('Y1_templates_boxes', { pe: [t?.length ?? 0, b?.length ?? 0], control: [tc, bc] });
    expect(tc ?? 0).toBeGreaterThan(0);
    expect(t?.length ?? 0).toBe(tc);
    expect(b?.length ?? 0).toBe(bc);
  });

  it('Y2 reads its expense, allocation and payment on ON (1 each)', async () => {
    const counts = [
      await peCount('expenses', 'id', [exp.on]),
      await peCount('expense_allocations', 'expense_id', [exp.on]),
      await peCount('expense_payments', 'expense_id', [exp.on]),
    ];
    record('Y2_on_expenses', counts);
    expect(counts).toEqual([1, 1, 1]);
  });

  it('Y3 reads its money file (category invoices) on ON', async () => {
    const seen = await peCount('files', 'id', [moneyFile.on]);
    record('Y3_on_money_file', seen);
    expect(seen).toBe(1);
  });

  it('Y4 generates a release in BOTH directions against ON subjects (3 rows)', async () => {
    const rows = [
      { direction: 'client_outbound', invoice_id: inv.on, template_id: clientTemplateId },
      { direction: 'sub_inbound', expense_id: exp.on, template_id: subTemplateId },
      { direction: 'sub_inbound', sub_contract_id: sc.on, template_id: subTemplateId },
    ];
    const errors: (string | null)[] = [];
    for (const r of rows) {
      const { data, error } = await pe.from('lien_releases').insert({ type: 'conditional', ...r }).select('id');
      errors.push(error?.message ?? null);
      if (data?.[0]) onReleases.push(data[0].id as string);
    }
    record('Y4_on_insert', { errors, landed: onReleases.length });
    expect(errors).toEqual([null, null, null]);
    expect(onReleases).toHaveLength(3);
    expect(await peCount('lien_releases', 'id', onReleases)).toBe(3);
  });

  it('Y5 sends and voids its own release (UPDATE lands)', async () => {
    const { data: sent } = await pe.from('lien_releases').update({ status: 'sent' }).eq('id', onReleases[0]).select('id');
    const { data: voided } = await pe
      .from('lien_releases')
      .update({
        status: 'voided',
        void_reason: `${MARKER} test`,
        voided_by: (await pe.auth.getUser()).data.user!.id,
        voided_at: new Date().toISOString(),
      })
      .eq('id', onReleases[1])
      .select('id');
    record('Y5_on_update', { sent: sent?.length ?? 0, voided: voided?.length ?? 0 });
    expect(sent?.length ?? 0).toBe(1);
    expect(voided?.length ?? 0).toBe(1);
  });

  it('Y6 ⚠️ cannot MOVE its release onto an OFF subject (WITH CHECK)', async () => {
    const { data, error } = await pe
      .from('lien_releases')
      .update({ invoice_id: inv.off })
      .eq('id', onReleases[0])
      .select('id');
    const { data: row } = await admin.from('lien_releases').select('invoice_id').eq('id', onReleases[0]).single();
    record('Y6_move', { touched: data?.length ?? 0, error: error?.message ?? null, invoiceNow: row?.invoice_id });
    expect(data?.length ?? 0).toBe(0);
    expect(row?.invoice_id).toBe(inv.on);
  });

  it('Y7 uploads an executed copy under its ON release (storage + files row) and can open it', async () => {
    const release = onReleases[2];
    const name = `${MARKER.toLowerCase()}-on.pdf`;
    const path = `${companyId}/lien-releases/${release}/${name}`;
    storagePaths.push(path);
    const up = await pe.storage
      .from(BUCKET)
      .upload(path, new Blob(['%PDF-1.4 on'], { type: 'application/pdf' }), { upsert: false });
    const { data: row, error: rowErr } = await pe
      .from('files')
      .insert({
        project_id: null,
        category: 'lien_releases',
        file_name: name,
        file_path: path,
        file_size: 11,
        mime_type: 'application/pdf',
      })
      .select('id');
    const { data: linked } = await pe
      .from('lien_releases')
      .update({ notarized_pdf_file_id: row?.[0]?.id, status: 'signed' })
      .eq('id', release)
      .select('id');
    const signed = await pe.storage.from(BUCKET).createSignedUrl(path, 60);
    record('Y7_on_upload', {
      storageError: up.error?.message ?? null,
      fileRows: row?.length ?? 0,
      fileError: rowErr?.message ?? null,
      linked: linked?.length ?? 0,
      signedUrl: Boolean(signed.data?.signedUrl),
      signedError: signed.error?.message ?? null,
    });
    expect(up.error?.message ?? null).toBeNull();
    expect(rowErr?.message ?? null).toBeNull();
    expect(row).toHaveLength(1);
    expect(linked?.length ?? 0).toBe(1);
    expect(signed.error?.message ?? null).toBeNull();
    expect(signed.data?.signedUrl).toBeTruthy();
  });
});
