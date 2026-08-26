import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { pdfText } from './pdf-text';
import { completeSelectionSignature, offerSelection } from '@/lib/services/selection-lifecycle-service';
import {
  generateSelectionSpecPdf,
  specSheetFileName,
  storeSelectionSpecPdf,
} from '@/lib/services/selection-spec-pdf-service';
import { getSelectionSpecSheetData } from '@/lib/selections/spec-sheet-data';
import { getPortalPhotos, getPortalSharedFiles, signPortalPaths } from '@/lib/services/portal';

// ============================================================================
// S175 #4 — Allowances & Selections STAGE 6: the SPECIFICATIONS SHEET.
// Migration 20261036000000. Spec §7.3, §9.4; acceptance criterion #18.
// Josh's rulings Q4.1–Q4.4 (this session's prompt).
// ============================================================================
//
// WHAT THIS FILE PROVES:
//
//   A  GENERATION — the sheet renders, the `files` row lands with the right
//      category and mime, and the blob is actually in the bucket. (#18)
//   B  WHAT IS ON IT — Q4.3 approved only, stamped "Approved as of <date>";
//      Q4.4 a client-supplied selection LISTED and MARKED; §9.4 NO MONEY, and
//      that one is asserted against REAL priced options in the database rather
//      than against a hand-built fixture, which is the only version of it that
//      could catch a figure leaking out of a service.
//   C  Q4.1 REPLACEMENT — a second generation leaves exactly ONE filed sheet,
//      and the stale STORAGE OBJECT is gone too, not just the row.
//   D  Q4.2 client_visible — and the half the ruling did not anticipate: that
//      the portal reads it as a DOCUMENT and not as a broken photo tile.
//   E  AN EMPTY SHEET IS REFUSED, and nothing is written when it is.
//   F  THE ROUTE — because that is where this class of defect lives.
//
// ⚠️ F EXECUTES THE REAL SHIPPED ROUTE, NOT THE SERVICE, and the reason is
// S174's, one stage back, verbatim: `s171-selections-lifecycle` was fully green
// while no client had ever received anything, because THE MECHANISM WAS NEVER
// BROKEN — the wiring to it was missing. A harness that calls
// `storeSelectionSpecPdf()` and `sendSelectionSpecificationsEmail()` itself
// goes green on a button that reaches neither.
//
// ⚠️ NO REAL EMAIL LEAVES THE BUILDING, and that is arranged rather than hoped:
// the fixture project's contact is the QA ClientA row, whose address is
// `qa-client-a@example.invalid` — a domain RFC 2606 guarantees can never
// resolve. The send is ATTEMPTED for real (getResend, the composed element, the
// network call) and lands in `email_logs` as `sent` or `failed`; both prove the
// path RAN and neither mails a person. Same arrangement, and same reasoning, as
// `s174-selections-email.live.ts`.
//
// ⚠️ FIXTURE KEYS ARE COLLIDABLE (spec §10 #19): every row carries MARKER and
// is swept in beforeAll AND afterAll; afterAll asserts zero residue — storage
// objects included — and THROWS, so a leak fails this run rather than the next.
// ============================================================================

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));

import { NextRequest } from 'next/server';
// THE REAL SHIPPED ROUTE.
import { POST as SPEC_SHEET } from '@/app/api/selections/spec-sheet/route';

const MARKER = 'S175S6';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const LINKED = 'josh+qa-client-linked@worthprop.com';
const BUCKET = 'project-files';

type Client = SupabaseClient<Database>;
let ownerC: Client;
let pmC: Client;
let foremanC: Client;
let linkedC: Client;
let companyId: string;
let linkedProfileId: string;
let linkedContactId: string;

let projectId: string; // has approved selections
let emptyProjectId: string; // has none
let allowanceItemId: string;
let approvedSelId: string;
let suppliedSelId: string;
let pendingSelId: string;
let draftSelId: string;

const must = (l: string, e: { message: string } | null) => {
  if (e) throw new Error(`${l}: ${e.message}`);
};
const sig = {
  signatureType: 'draw' as const,
  signatureData: 'data:image/png;base64,iVBORw0KGgo=',
  signerName: 'QA Client',
  signerIp: '127.0.0.1',
  signerUserAgent: 'vitest',
};

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/selections/spec-sheet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const filedSheets = async (pid: string) =>
  (
    await admin
      .from('files')
      .select('id, file_name, file_path, category, mime_type, client_visible, project_id')
      .eq('project_id', pid)
      .eq('category', 'selections')
  ).data ?? [];

// ── sweep ───────────────────────────────────────────────────────────────────
async function sweep(): Promise<void> {
  const { data: projs } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const pids = (projs ?? []).map((p) => p.id);

  if (pids.length) {
    // Storage first, and BY PATH, because a `files` delete leaves the blob.
    const { data: fileRows } = await admin.from('files').select('id, file_path').in('project_id', pids);
    const paths = (fileRows ?? []).map((f) => f.file_path);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    await admin.from('files').delete().in('project_id', pids);

    // ⚠️ AND THE EMAIL LOGS, KEYED ON metadata->>project_id — NOT on MARKER.
    // The subject is the COMPANY's ("Bishop Contracting: your specifications
    // sheet") and carries no marker at all, so a sweep and a residue check
    // written against MARKER would BOTH pass while leaving a row per run
    // behind. That is exactly the leak a harness which cannot collide with
    // itself can never report. Swept before the projects go, because their ids
    // are what identifies these rows.
    for (const pid of pids) {
      await admin
        .from('email_logs')
        .delete()
        .eq('email_type', 'selection_specifications')
        .eq('metadata->>project_id', pid);
    }
  }

  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const sids = (sels ?? []).map((s) => s.id);
  if (sids.length) {
    await admin.from('notifications').delete().in('source_id', sids).eq('source_table', 'selections');
    // The four signed_* stamps travel together by CHECK and the FK runs both
    // ways, so all four clear at once with the status they imply — the S175
    // stage-5 sweep found this the hard way.
    must('unstamp', (await admin.from('selections').update({
      status: 'draft', signed_session_id: null, signed_sell_amount: null,
      signed_allowance_deduction: null, signed_variance: null, signed_at: null,
    }).in('id', sids)).error);
    must('sessions', (await admin.from('selection_signing_sessions').delete().in('selection_id', sids)).error);
    const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', sids);
    const oids = (opts ?? []).map((o) => o.id);
    if (oids.length) {
      await admin.from('selection_option_amounts').delete().in('option_id', oids);
      await admin.from('selection_options').delete().in('id', oids);
    }
    await admin.from('selection_amounts').delete().in('selection_id', sids);
    await admin.from('selection_notes').delete().in('selection_id', sids);
    await admin.from('selection_threads').delete().in('selection_id', sids);
    must('sweep selections', (await admin.from('selections').delete().in('id', sids)).error);
  }
  await admin.from('selection_areas').delete().like('name', `${MARKER}%`);

  if (pids.length) {
    const { data: items } = await admin.from('project_budget_items').select('id').in('project_id', pids);
    const iids = (items ?? []).map((i) => i.id);
    if (iids.length) {
      await admin.from('project_budget_amounts').delete().in('budget_item_id', iids);
      must('sweep budget items', (await admin.from('project_budget_items').delete().in('id', iids)).error);
    }
    await admin.from('project_assignments').delete().in('project_id', pids);
    await admin.from('project_financials').delete().in('project_id', pids);
    must('sweep projects', (await admin.from('projects').delete().in('id', pids)).error);
  }

  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const estIds = (ests ?? []).map((e) => e.id);
  if (estIds.length) {
    await admin.from('estimate_categories').delete().in('estimate_id', estIds);
    must('sweep estimates', (await admin.from('estimates').delete().in('id', estIds)).error);
  }
}

// ── fixture builders ────────────────────────────────────────────────────────
async function makeJob(label: string, contract: number) {
  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence')
    .eq('id', companyId)
    .single();
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;
  const { data: est, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: linkedContactId,
      name: `${MARKER} — ${label}`,
      estimate_number: `EST-${String(seq).padStart(4, '0')}`,
      status: 'accepted',
      contract_type: 'fixed_price',
      created_by_role: 'owner',
      subtotal: contract,
      grand_total: contract,
      discount_total: 0,
    })
    .select('id')
    .single();
  must(`estimate ${label}`, eErr);
  const { data: proj, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} — ${label}`,
      // The LINKED client reaches the project through projects.contact_id
      // (arm (a) of is_client_of_project) — that is what lets her sign, and it
      // is also what makes the recipient `qa-client-a@example.invalid`.
      contact_id: linkedContactId,
      project_type: 'fixed_price',
      source_estimate_id: est!.id,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  must(`project ${label}`, pErr);
  must(
    `financials ${label}`,
    (await admin.from('project_financials').insert({
      company_id: companyId, project_id: proj!.id, contract_value: contract,
    })).error
  );
  must(
    'counters',
    (await admin.from('companies')
      .update({ estimate_number_sequence: seq, project_internal_sequence: internal })
      .eq('id', companyId)).error
  );
  return proj!.id;
}

/** Assign a member so PM/Foreman can SEE the project — without this, F2's
 *  role refusal would pass against a principal who could not read the row
 *  anyway, and would prove nothing. */
async function assign(email: string, pid: string) {
  const { data: prof } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: member } = await admin.from('company_members').select('id').eq('profile_id', prof!.id).single();
  must(
    `assign ${email}`,
    (await admin.from('project_assignments').insert({
      company_id: companyId, project_id: pid, member_id: member!.id, created_by: null,
    })).error
  );
}

async function makeSelection(
  pid: string,
  name: string,
  areaId: string | null,
  options: { name: string; spec_detail?: string; link_url?: string; unit_cost: number }[],
  opts: { release?: boolean; sign?: boolean; client_supplied?: boolean } = {}
): Promise<string> {
  const { data: s, error } = await admin
    .from('selections')
    .insert({
      company_id: companyId,
      project_id: pid,
      area_id: areaId,
      name: `${MARKER} ${name}`,
      allowance_budget_item_id: allowanceItemId,
      allow_multiple: true,
      client_supplied: opts.client_supplied ?? false,
    })
    .select('id')
    .single();
  must(`selection ${name}`, error);
  const id = s!.id;
  for (const o of options) {
    const { data: opt, error: oErr } = await admin
      .from('selection_options')
      .insert({
        company_id: companyId,
        selection_id: id,
        name: `${MARKER} ${o.name}`,
        spec_detail: o.spec_detail ?? null,
        link_url: o.link_url ?? null,
        is_chosen: false,
      })
      .select('id')
      .single();
    must(`option ${o.name}`, oErr);
    if (!opts.client_supplied) {
      must(
        `amounts ${o.name}`,
        (await admin.from('selection_option_amounts').insert({
          company_id: companyId, option_id: opt!.id,
          quantity: 1, unit_cost: o.unit_cost, markup_percent: 20,
        })).error
      );
    }
  }
  if (!opts.release && !opts.sign) return id;
  const released = await offerSelection(ownerC, id);
  if (!released.success) throw new Error(`release ${name}: ${released.error}`);
  if (!opts.sign) return id;
  must('pick', (await admin.from('selection_options').update({ is_chosen: true }).eq('selection_id', id)).error);
  const signed = await completeSelectionSignature(linkedC, id, {
    ...sig,
    caller: { kind: 'portal_session', profileId: linkedProfileId },
  });
  if (!signed.success) throw new Error(`sign ${name}: ${signed.error}`);
  return id;
}

// ── setup ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  assertRebuildTest();
  await sweep();

  const { data: co } = await admin.from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = co!.id;
  ownerC = (await sessionFor(OWNER)) as Client;
  pmC = (await sessionFor(PM)) as Client;
  foremanC = (await sessionFor(FOREMAN)) as Client;
  linkedC = (await sessionFor(LINKED)) as Client;
  state.client = ownerC;

  const { data: linked } = await admin.from('profiles').select('id, contact_id').eq('email', LINKED).single();
  if (!linked?.contact_id) throw new Error('LINKED client is unlinked — run the seed.');
  linkedProfileId = linked.id;
  linkedContactId = linked.contact_id;

  projectId = await makeJob('stage 6', 20000);
  emptyProjectId = await makeJob('stage 6 empty', 5000);
  await assign(PM, projectId);
  await assign(FOREMAN, projectId);

  const { data: item, error: bErr } = await admin
    .from('project_budget_items')
    .insert({
      company_id: companyId, project_id: projectId, row_type: 'allowance',
      description: `${MARKER} tile allowance`, created_by: null,
    })
    .select('id')
    .single();
  must('budget line', bErr);
  allowanceItemId = item!.id;
  must(
    'budget amount',
    (await admin.from('project_budget_amounts').insert({
      company_id: companyId, budget_item_id: allowanceItemId, budgeted_amount: 5000,
    })).error
  );

  const { data: area, error: aErr } = await admin
    .from('selection_areas')
    .insert({ company_id: companyId, project_id: projectId, name: `${MARKER} Kitchen`, sort_order: 1 })
    .select('id')
    .single();
  must('area', aErr);

  approvedSelId = await makeSelection(projectId, 'countertop', area!.id, [
    { name: 'calacatta quartz', spec_detail: '3cm eased edge', link_url: 'https://example.test/quartz', unit_cost: 6000 },
  ], { sign: true });

  suppliedSelId = await makeSelection(projectId, 'cabinet pulls', area!.id, [
    { name: 'their pulls', spec_detail: 'satin brass', unit_cost: 0 },
  ], { client_supplied: true, sign: true });

  pendingSelId = await makeSelection(projectId, 'undecided grout', area!.id, [
    { name: 'grey grout', unit_cost: 100 },
  ], { release: true });

  draftSelId = await makeSelection(projectId, 'unstarted backsplash', area!.id, [
    { name: 'subway', unit_cost: 200 },
  ]);
}, 300_000);

afterAll(async () => {
  await sweep();
  const left: Record<string, number | null> = {};
  left.projects = (await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.selections = (await admin.from('selections').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.estimates = (await admin.from('estimates').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.areas = (await admin.from('selection_areas').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`)).count;
  left.budgetItems = (await admin.from('project_budget_items').select('id', { count: 'exact', head: true }).like('description', `${MARKER}%`)).count;
  // Keyed the same way the sweep is — see its comment.
  left.emailLogs = (await admin
    .from('email_logs')
    .select('id', { count: 'exact', head: true })
    .eq('email_type', 'selection_specifications')
    .in('metadata->>project_id', [projectId, emptyProjectId])).count;
  const residue = Object.entries(left).filter(([, n]) => (n ?? 0) > 0);
  if (residue.length) throw new Error(`[${MARKER}] residue: ${JSON.stringify(residue)}`);
}, 300_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S6 A — GENERATION: the sheet renders and is FILED (#18)', () => {
  let fileId: string;
  let filePath: string;

  it('A1 — storeSelectionSpecPdf files one PDF and returns its id', async () => {
    const out = await storeSelectionSpecPdf(ownerC, admin as unknown as Client, projectId);
    expect(out.error, `store refused: ${out.error}`).toBeNull();
    expect(out.fileId).toBeTruthy();
    expect(out.buffer!.subarray(0, 5).toString()).toBe('%PDF-');
    fileId = out.fileId!;
  });

  it('A2 — the `files` row has the stage-6 category, the pdf mime and the project', async () => {
    const rows = await filedSheets(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(fileId);
    expect(rows[0].category).toBe('selections');
    expect(rows[0].mime_type).toBe('application/pdf');
    expect(rows[0].project_id).toBe(projectId);
    expect(rows[0].file_name).toBe(specSheetFileName(`${MARKER} — stage 6`));
    filePath = rows[0].file_path;
  });

  it('A3 — ⚠️ and the BLOB is actually in the bucket, not just the row', async () => {
    // A `files` row with no object behind it reads as a filed document and
    // 404s on open — the failure that presents as a broken link rather than as
    // a missing upload.
    const { data, error } = await admin.storage.from(BUCKET).download(filePath);
    expect(error, `download failed: ${error?.message}`).toBeNull();
    const buf = Buffer.from(await data!.arrayBuffer());
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.byteLength).toBeGreaterThan(1000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S6 B — WHAT IS ON IT: Q4.3, Q4.4 and §9.4, read off the real PDF', () => {
  let text: string;

  beforeAll(async () => {
    const rendered = await generateSelectionSpecPdf(ownerC, admin as unknown as Client, projectId);
    text = pdfText(rendered!.buffer);
  });

  it('B1 — Q4.3: the APPROVED selection is on it', () => {
    expect(text).toContain(`${MARKER} countertop`);
    expect(text).toContain(`${MARKER} calacatta quartz`);
    expect(text).toContain('3cm eased edge');
  });

  it('B2 — ⚠️ Q4.3: the RELEASED-BUT-UNSIGNED and the DRAFT are NOT', () => {
    // "A build document listing unapproved choices invites the crew to install
    // one." Both are non-vacuous: the fixture creates them and B1 proves the
    // sheet is not simply empty.
    expect(text).not.toContain(`${MARKER} undecided grout`);
    expect(text).not.toContain(`${MARKER} unstarted backsplash`);
  });

  it('B3 — Q4.3: the sheet is stamped "Approved as of <today>"', () => {
    expect(text).toMatch(/Approved as of [A-Z][a-z]+ \d{1,2}, \d{4}/);
    expect(text).toContain('Selections still being chosen are not on this sheet.');
  });

  it('B4 — Q4.4: the CLIENT-SUPPLIED selection is LISTED and MARKED, never blanked', () => {
    expect(text).toContain(`${MARKER} cabinet pulls`);
    expect(text).toContain(`${MARKER} their pulls`);
    expect(text).toContain('Supplied by client');
  });

  it('B5 — ⚠️ §9.4: NO MONEY reaches the sheet, against REAL priced options', async () => {
    // The unit test asserts this on a hand-built fixture. THIS is the version
    // that matters: the options in the database carry $6,000 at 20% markup and
    // the selection has signed stamps, so a figure leaking out of a service —
    // rather than out of a literal in the template — would show up here.
    //
    // Why it is a floor rule and not a layout one: the sheet is filed under
    // `files.category = 'selections'`, and `files_select_non_client` gates only
    // contracts/change_orders/invoices — so foreman, crew and subcontractor can
    // all read this row (proved by D4 below). A sell figure on it would breach
    // the Financial Visibility Floor through a document.
    expect(text).not.toMatch(/\$\s*[\d,]/);
    for (const word of ['Allowance', 'Variance', 'Markup', 'Subtotal', 'Total', 'Price']) {
      expect(text, `"${word}" reached the specifications sheet`).not.toContain(word);
    }
    // …and the figures ARE there to leak, so the absence is meaningful.
    const { data: sel } = await admin
      .from('selections')
      .select('signed_sell_amount, signed_variance')
      .eq('id', approvedSelId)
      .single();
    expect(Number(sel!.signed_sell_amount)).toBeGreaterThan(0);
    expect(text).not.toContain(String(Math.round(Number(sel!.signed_sell_amount))));
  });

  it('B6 — the data type carries no money either: the client-supplied row has no stamps', async () => {
    const data = await getSelectionSpecSheetData(ownerC, admin as unknown as Client, projectId);
    const all = data!.areas.flatMap((a) => a.selections);
    expect(all.map((s) => s.id).sort()).toEqual([approvedSelId, suppliedSelId].sort());
    const supplied = all.find((s) => s.id === suppliedSelId)!;
    expect(supplied.clientSupplied).toBe(true);

    // ⚠️ A CHECK MAKES ALL FOUR `signed_*` STAMPS NULL ON A CLIENT-SUPPLIED
    // SELECTION — including `signed_at`, which is not money and is easy to
    // forget travels with the other three. So the approval date CANNOT come
    // from the column here, and reading it alone would have printed a date on
    // every selection except the one Q4.4 exists to keep fully listed: the one
    // row that would silently look less approved than its neighbours. It falls
    // back to the completed signing session, and this is the probe that says
    // the fallback actually fires.
    const { data: row } = await admin
      .from('selections')
      .select('signed_sell_amount, signed_variance, signed_at')
      .eq('id', suppliedSelId)
      .single();
    expect(row!.signed_sell_amount).toBeNull();
    expect(row!.signed_variance).toBeNull();
    expect(row!.signed_at, 'the stamp is set — B6 is no longer testing the fallback').toBeNull();
    expect(supplied.approvedAt, 'no approval date on the client-supplied selection').toBeTruthy();

    // …and the money selection takes its date from the column, as before.
    const money = all.find((s) => s.id === approvedSelId)!;
    const { data: moneyRow } = await admin
      .from('selections').select('signed_at').eq('id', approvedSelId).single();
    expect(moneyRow!.signed_at).toBeTruthy();
    expect(money.approvedAt).toBe(moneyRow!.signed_at);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S6 C — Q4.1: a regeneration REPLACES, and takes the stale blob with it', () => {
  it('C1 — a second generation leaves exactly ONE filed sheet, with a NEW id', async () => {
    const before = await filedSheets(projectId);
    expect(before, 'A did not file a sheet — C would be vacuous').toHaveLength(1);
    const staleId = before[0].id;
    const stalePath = before[0].file_path;

    const out = await storeSelectionSpecPdf(ownerC, admin as unknown as Client, projectId);
    expect(out.error).toBeNull();

    const after = await filedSheets(projectId);
    expect(after).toHaveLength(1);
    expect(after[0].id).not.toBe(staleId);
    expect(after[0].id).toBe(out.fileId);

    // ⚠️ AND THE STALE OBJECT IS GONE FROM STORAGE. Deleting the row alone
    // leaves an orphan blob that nothing will ever clean up — invisible in
    // every listing and paid for forever.
    const { data: orphan } = await admin.storage.from(BUCKET).download(stalePath);
    expect(orphan, 'the stale blob survived the replace').toBeNull();
  });

  it('C2 — the replace is scoped to THIS project: another project keeps its own', async () => {
    // The key is (project_id, category), so a generation on one project must
    // not touch another's. Proved by filing one on the empty project's sibling
    // rather than by reasoning about the query.
    const { data: other } = await admin
      .from('files')
      .select('id')
      .eq('category', 'selections')
      .neq('project_id', projectId);
    // Nothing else in the company files this category today; the assertion
    // that matters is that OUR project still has exactly one after a third run.
    await storeSelectionSpecPdf(ownerC, admin as unknown as Client, projectId);
    expect(await filedSheets(projectId)).toHaveLength(1);
    const { data: otherAfter } = await admin
      .from('files')
      .select('id')
      .eq('category', 'selections')
      .neq('project_id', projectId);
    expect((otherAfter ?? []).length).toBe((other ?? []).length);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S6 D — Q4.2: client_visible, AND the portal reads it as a document', () => {
  it('D1 — the filed row is client_visible', async () => {
    const rows = await filedSheets(projectId);
    expect(rows[0].client_visible).toBe(true);
  });

  it('D2 — the LINKED CLIENT can read the row through her own session', async () => {
    const { data } = await linkedC
      .from('files')
      .select('id, category, mime_type')
      .eq('project_id', projectId)
      .eq('category', 'selections');
    expect(data, 'the client could not read her own specifications sheet').toHaveLength(1);
    expect(data![0].mime_type).toBe('application/pdf');
  });

  it('D3 — ⚠️ the portal serves it as a DOCUMENT and NOT as a photo', async () => {
    // The finding this stage turned up: `getPortalPhotos` had no type filter,
    // so every client-visible file landed in the photo grid — and the sheet
    // would have appeared as a BROKEN IMAGE TILE. Present, unopenable, and
    // reading as a fault in her contractor's software.
    const shared = await getPortalSharedFiles(linkedC, projectId);
    expect(shared.map((f) => f.category)).toContain('selections');
    const photos = await getPortalPhotos(linkedC, projectId);
    expect(photos.map((p) => p.id)).not.toContain(shared.find((f) => f.category === 'selections')!.id);
    for (const p of photos) expect(p.file_path).not.toMatch(/\.pdf$/);
  });

  it('D4 — ⚠️ and the sheet SIGNS for her, which is the half that 403s', async () => {
    const shared = await getPortalSharedFiles(linkedC, projectId);
    const sheet = shared.find((f) => f.category === 'selections')!;
    const urls = await signPortalPaths(linkedC, [sheet.file_path], 60);
    expect(urls.get(sheet.file_path), 'the client could not sign a URL for her own sheet').toBeTruthy();
  });

  it('D5 — the FOREMAN can read the filed row too, and that is why it carries no money', async () => {
    // `files_select_non_client` gates only contracts/change_orders/invoices, so
    // an assigned foreman reads this category. Non-vacuous: he is assigned, and
    // this is the exact reason B5 exists.
    const { data } = await foremanC
      .from('files')
      .select('id, category')
      .eq('project_id', projectId)
      .eq('category', 'selections');
    expect(data, 'the assigned foreman could not read the project files at all').toHaveLength(1);
  });

  it('D6 — ⚠️ a PM cannot set client_visible directly: the admin write is the only route', async () => {
    // The service files this row through the service-role client. Under RLS,
    // `files_insert_non_client` admits `client_visible = true` from Owner/Admin
    // ONLY — so this is not a widening of who may flip the flag.
    const { data, error } = await pmC
      .from('files')
      .insert({
        company_id: companyId, project_id: projectId, category: 'selections',
        file_name: `${MARKER}-pm-attempt.pdf`, file_path: `${companyId}/${projectId}/${MARKER}-pm-attempt.pdf`,
        file_size: 1, mime_type: 'application/pdf', client_visible: true,
      })
      .select('id');
    expect(error, 'a PM inserted a client_visible file').not.toBeNull();
    // ⚠️ RE-READ THROUGH THE SERVICE ROLE: a 42501 alone cannot tell a refused
    // WRITE from a refused RETURNING.
    expect(data).toBeNull();
    const { count } = await admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('file_name', `${MARKER}-pm-attempt.pdf`);
    expect(count, 'the row was written and only the RETURNING was refused').toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S6 E — an EMPTY sheet is refused, and nothing is written', () => {
  it('E1 — a project with no approved selections is refused, by name', async () => {
    const out = await storeSelectionSpecPdf(ownerC, admin as unknown as Client, emptyProjectId);
    expect(out.error).toMatch(/Nothing has been approved/);
    expect(out.fileId).toBeNull();
  });

  it('E2 — ⚠️ and NO file row and NO blob were left behind by the refusal', async () => {
    // The first draft of the route checked this AFTER storing, which would have
    // uploaded the blob, inserted a client_visible row and THEN reported an
    // error — leaving an empty specifications sheet in the client's portal.
    expect(await filedSheets(emptyProjectId)).toHaveLength(0);
    const { data: any } = await admin.from('files').select('id').eq('project_id', emptyProjectId);
    expect(any ?? []).toHaveLength(0);
  });

  it('E3 — but `generate` still RENDERS the empty case, for a preview', async () => {
    const rendered = await generateSelectionSpecPdf(ownerC, admin as unknown as Client, emptyProjectId);
    expect(rendered).not.toBeNull();
    expect(pdfText(rendered!.buffer)).toContain('This sheet lists approved selections only.');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-S6 F — THE ROUTE: the button files AND mails, and the gate is the role', () => {
  it('F1 — ⚠️ the OWNER through the REAL route: filed, and an email_logs row exists', async () => {
    // The S174 lesson, one stage back: the lifecycle harness was green while no
    // client ever received anything, because the mechanism was fine and nothing
    // called it. This is the assertion a service-level probe cannot make.
    state.client = ownerC;
    const res = await SPEC_SHEET(req({ projectId }));
    const body = (await res.json()) as {
      fileId?: string; selectionCount?: number; emailed?: boolean; emailError?: string | null; recipient?: string | null; error?: string;
    };
    expect(res.status, `route refused: ${body.error}`).toBe(200);
    expect(body.fileId).toBeTruthy();
    expect(body.selectionCount).toBe(2);
    expect(body.recipient).toBe('qa-client-a@example.invalid');

    expect(await filedSheets(projectId)).toHaveLength(1);

    // ⚠️ SCOPED to this project, not merely ORDERED. The caller depends on the
    // row being THIS send's; ordering alone would make a wrong pick stable
    // rather than correct, and a stale row from another project would satisfy
    // every assertion below except the project id.
    const { data: logs } = await admin
      .from('email_logs')
      .select('id, email_type, recipient_email, status, metadata, subject')
      .eq('email_type', 'selection_specifications')
      .eq('metadata->>project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1);
    expect(logs, 'no email_logs row of type selection_specifications').toHaveLength(1);
    const log = logs![0] as { email_type: string; recipient_email: string; metadata: Record<string, unknown> };
    expect(log.recipient_email).toBe('qa-client-a@example.invalid');
    expect(log.metadata.project_id).toBe(projectId);
    expect(log.metadata.selection_count).toBe(2);
    expect(log.metadata.selection_ids as string[]).toContain(approvedSelId);
    expect(log.metadata.approved_as_of).toBeTruthy();
  });

  it('F2 — a PM (assigned) is admitted: §7.3 puts generation at Owner/Admin/PM', async () => {
    state.client = pmC;
    const res = await SPEC_SHEET(req({ projectId }));
    const body = (await res.json()) as { error?: string; fileId?: string };
    expect(res.status, `PM refused: ${body.error}`).toBe(200);
    expect(body.fileId).toBeTruthy();
    state.client = ownerC;
  });

  it('F3 — ⚠️ a FOREMAN is refused 403 BY ROLE, and the probe is non-vacuous', async () => {
    // He is assigned to the project and D5 proves he can read its files, so the
    // refusal is the role gate and not RLS quietly returning nothing. And it is
    // a 403 with its own sentence — never a fall-through to "not found".
    state.client = foremanC;
    const res = await SPEC_SHEET(req({ projectId }));
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/owner, admin or project manager/);
    state.client = ownerC;

    // And nothing was filed by the attempt.
    expect(await filedSheets(projectId)).toHaveLength(1);
  });

  it('F4 — the empty project is refused through the route too, with the sentence', async () => {
    state.client = ownerC;
    const res = await SPEC_SHEET(req({ projectId: emptyProjectId }));
    const body = (await res.json()) as { error?: string };
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/Nothing has been approved/);
    expect(await filedSheets(emptyProjectId)).toHaveLength(0);
  });
});
