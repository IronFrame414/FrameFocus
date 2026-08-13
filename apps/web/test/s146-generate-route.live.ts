import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S146 — the generate route, ACTUALLY EXECUTED. Both directions, end to end.
//
// Route:  apps/web/app/api/lien-releases/generate/route.ts
// Spec:   7f2-spec.md §7 (the generate flow), §12 [S145] (the sub-inbound arm)
// Rulings: (i) upload-back · (ii) completion→CONDITIONAL, payment→UNCONDITIONAL
// ============================================================================
//
// ⚠️ WHY THIS FILE EXISTS. S145 shipped the sub-inbound arm and probed the
// SCHEMA and the RLS around it — 12 assertions, all green, none of which ran a
// single line of the route. The arm was reviewed by reading it. This executes
// it: the four seeded sub templates carry no PDF, so `renderRelease()` had also
// never rendered a sub-inbound release at all.
//
// ⚠️ THE ROUTE MODULE ITSELF IS IMPORTED AND CALLED. Not a copy of its logic.
// Only the CLIENT FACTORY is replaced, exactly as `s97ct-7e-clicktest.live.ts`
// does — `state.client` is a real anon-key client carrying a real user JWT, so
// every read and write inside the route runs under the policies it runs under
// in production. Re-implementing the route's body in this file would have been
// the divergence CLAUDE.md's parity ruling is about, written in a form that
// looks like agreement.
//
// ⚠️ EVERY NEGATIVE HERE IS PAIRED WITH A POSITIVE. The signature assertions
// are the reason: "no signature was stamped" passes trivially against a
// company with no signature on file, against a broken storage path, and
// against a renderer that silently dropped every image. S146-G1 renders the
// SAME fixture PDF through the client-outbound arm first and requires an image
// to appear. Only then does the sub-inbound absence mean anything.

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { NextRequest } from 'next/server';
// THE REAL SHIPPED ROUTE.
import { POST } from '@/app/api/lien-releases/generate/route';

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';

/** Everything this file creates is tagged so a crashed run self-heals. */
const MARKER = 'S146GEN';

let ownerC: SupabaseClient;
let pmC: SupabaseClient;

let companyId = '';
let subContractId = '';
let expenseId = '';
let invoiceId = '';
let subTemplateId = '';
let clientTemplateId = '';
let fixtureFileId = '';
let fixtureStoragePath = '';

/** Restored in afterAll — see the signatory note in beforeAll. */
let priorSignatory: { signatory_name: string | null; signatory_title: string | null } | null = null;

const madeReleases: string[] = [];
const madeFileIds: string[] = [];
const madeStoragePaths: string[] = [];

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/lien-releases/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Count image XObjects in a rendered PDF.
 *
 * This is how "our signature was not stamped" is proved. pdf-lib re-encodes an
 * embedded PNG into a Flate image stream, so the original PNG bytes do NOT
 * survive into the output and searching for them would produce a test that
 * passes for the wrong reason. The image dictionary does survive.
 */
async function imageCount(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  let n = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = (obj as { dict?: Map<unknown, unknown> }).dict;
    if (!dict || typeof (dict as Map<unknown, unknown>).entries !== 'function') continue;
    for (const [k, v] of (dict as Map<unknown, unknown>).entries()) {
      if (String(k) === '/Subtype' && String(v) === '/Image') n++;
    }
  }
  return n;
}

/** Pull the stored PDF for a release row, through the service role. */
async function storedPdf(releaseId: string): Promise<{ path: string; bytes: Uint8Array }> {
  const { data: rel } = await admin
    .from('lien_releases')
    .select('generated_pdf_file_id')
    .eq('id', releaseId)
    .single();
  const fileId = (rel as { generated_pdf_file_id: string }).generated_pdf_file_id;
  expect(fileId, 'the release carries no generated PDF').toBeTruthy();
  madeFileIds.push(fileId);

  const { data: file } = await admin
    .from('files')
    .select('file_path')
    .eq('id', fileId)
    .single();
  const path = (file as { file_path: string }).file_path;
  madeStoragePaths.push(path);

  const { data: blob, error } = await admin.storage.from('project-files').download(path);
  expect(error, `could not download ${path}: ${error?.message}`).toBeNull();
  return { path, bytes: new Uint8Array(await blob!.arrayBuffer()) };
}

async function makeTemplate(direction: 'client_outbound' | 'sub_inbound'): Promise<string> {
  const { data: tpl, error } = await admin
    .from('lien_release_templates')
    .insert({
      company_id: companyId,
      name: `${MARKER} ${direction}`,
      type: 'conditional',
      is_final: false,
      is_default: false,
      direction,
      pdf_file_id: fixtureFileId,
    })
    .select('id')
    .single();
  expect(error, `template insert failed: ${error?.message}`).toBeNull();
  const id = (tpl as { id: string }).id;

  // One value box, one signature box. The signature box is the load-bearing
  // one: without it the renderer has nowhere to put an image and the
  // client-outbound positive control below could not distinguish "not stamped"
  // from "nowhere to stamp".
  const { error: boxErr } = await admin.from('lien_release_template_boxes').insert([
    {
      company_id: companyId,
      template_id: id,
      page: 0,
      x: 0.1,
      y: 0.1,
      width: 0.6,
      height: 0.05,
      kind: 'value',
      value_key: 'claimant_name',
    },
    {
      company_id: companyId,
      template_id: id,
      page: 0,
      x: 0.1,
      y: 0.3,
      width: 0.3,
      height: 0.08,
      kind: 'signature',
    },
  ]);
  expect(boxErr, `box insert failed: ${boxErr?.message}`).toBeNull();
  return id;
}

/** Clear the (subject, type) slot so the partial unique indexes cannot bite. */
async function freeSlot(column: 'invoice_id' | 'expense_id' | 'sub_contract_id', id: string) {
  const { data } = await admin.from('lien_releases').select('id').eq(column, id);
  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  if (ids.length) await admin.from('lien_releases').delete().in('id', ids);
}

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, pmC] = (await Promise.all([sessionFor(OWNER), sessionFor(PM)])) as SupabaseClient[];
  state.client = ownerC;

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  // ── self-heal: drop anything a crashed earlier run left behind ───────────
  // S145-S1 asserts this company has EXACTLY eight templates. A leaked fixture
  // template would turn that file red in a later suite run, in a way that
  // looks like a defect in 7F rather than litter from here.
  const { data: stale } = await admin
    .from('lien_release_templates')
    .select('id')
    .eq('company_id', companyId)
    .like('name', `${MARKER}%`);
  const staleIds = (stale ?? []).map((t) => (t as { id: string }).id);
  if (staleIds.length) {
    await admin.from('lien_releases').delete().in('template_id', staleIds);
    await admin.from('lien_release_template_boxes').delete().in('template_id', staleIds);
    await admin.from('lien_release_templates').delete().in('id', staleIds);
  }

  // ── the subject rows, chosen by CRITERIA rather than by row order ────────
  // The PM assignment constraint is not decoration: S146-G4's refusal must be
  // "no authority", not "no visibility". This is the fixture defect S145 found
  // in two of its own harnesses, applied here up front.
  const { data: pmProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', PM)
    .eq('is_deleted', false)
    .single();
  const { data: pmMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (pmProfile as { id: string }).id)
    .maybeSingle();
  const { data: assignments } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', (pmMember as { id: string }).id);
  const assigned = (assignments ?? []).map((a) => (a as { project_id: string }).project_id);
  expect(assigned.length, 'the PM identity has no project assignments').toBeGreaterThan(0);

  // ⚠️ EVERY SUBJECT MUST SIT ON A PROJECT THAT HAS A PROPERTY ADDRESS, and the
  // first version of this constrained NONE of them — all three picks were bare
  // `.limit(1)`.
  //
  // §6.3's build guard REFUSES to render without one ("the address is legally
  // required on the release form"), so an address-less subject returns 422. On
  // the client arm that collapses G1, and with it the meaning of every "no
  // signature was stamped" assertion below — which is the whole point of G1
  // existing. On the sub arm it fails the run outright.
  //
  // ⚠️ IT PASSED STANDALONE BY ROW ORDERING AND WENT RED INSIDE THE FULL SUITE,
  // behind harnesses that churn invoices. Identical to the defect S145 recorded
  // in two of its own harnesses and S146 fixed in `s140-lien-releases.live.ts`:
  // another file's row ordering is not a fixture. The sub picks passed twice by
  // luck and are constrained here too, rather than left to be found later.
  //
  // Two plain steps rather than a PostgREST embed — the embed alias depends on
  // the FK name and a rename would turn this into a silent empty set.
  const { data: addrRows } = await admin
    .from('contact_addresses')
    .select('id')
    .eq('company_id', companyId)
    .not('address_line1', 'is', null)
    .neq('address_line1', '');
  const addressIds = (addrRows ?? []).map((a) => (a as { id: string }).id);

  const { data: addressed } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('contact_address_id', addressIds);
  const addressedProjectIds = (addressed ?? []).map((p) => (p as { id: string }).id);
  expect(
    addressedProjectIds.length,
    'no project on this company has a property address — this file cannot be built'
  ).toBeGreaterThan(0);

  // PM-assigned AND addressed: G4's refusal must be "no authority" rather than
  // "no visibility", and the sub arms must clear the §6.3 guard.
  const subjectProjectIds = assigned.filter((id) => addressedProjectIds.includes(id));
  expect(
    subjectProjectIds.length,
    'no project is both PM-assigned and addressed — G2/G3/G4 cannot be built'
  ).toBeGreaterThan(0);

  // An expense whose sub_contract_id is SET — the payment arm resolves the
  // contract THROUGH the expense, so an unattached expense yields a 404 and the
  // test would pass its status assertion for the wrong reason.
  const { data: expense } = await admin
    .from('expenses')
    .select('id, sub_contract_id, project_id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('project_id', subjectProjectIds)
    .not('sub_contract_id', 'is', null)
    .limit(1)
    .single();
  expenseId = (expense as { id: string }).id;
  subContractId = (expense as { sub_contract_id: string }).sub_contract_id;

  const { data: invoice } = await admin
    .from('invoices')
    .select('id, project_id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('project_id', addressedProjectIds)
    .limit(1)
    .single();
  invoiceId = (invoice as { id: string }).id;

  await freeSlot('expense_id', expenseId);
  await freeSlot('sub_contract_id', subContractId);
  await freeSlot('invoice_id', invoiceId);

  // ── the fixture form ────────────────────────────────────────────────────
  // FrameFocus ships no release form in either direction (§2), so the seeded
  // templates carry no PDF and the renderer has never run on this side. A
  // one-page blank stands in for the company's own uploaded form.
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const pdfBytes = await doc.save();

  fixtureStoragePath = `${companyId}/lien-releases/${MARKER}-template-${Date.now()}.pdf`;
  const { error: upErr } = await admin.storage
    .from('project-files')
    .upload(fixtureStoragePath, Buffer.from(pdfBytes), {
      contentType: 'application/pdf',
      upsert: true,
    });
  expect(upErr, `fixture upload failed: ${upErr?.message}`).toBeNull();
  madeStoragePaths.push(fixtureStoragePath);

  const { data: fileRow, error: fileErr } = await admin
    .from('files')
    .insert({
      company_id: companyId,
      project_id: null,
      category: 'lien_releases',
      file_name: `${MARKER}-template.pdf`,
      file_path: fixtureStoragePath,
      file_size: pdfBytes.length,
      mime_type: 'application/pdf',
    })
    .select('id')
    .single();
  expect(fileErr, `fixture file row failed: ${fileErr?.message}`).toBeNull();
  fixtureFileId = (fileRow as { id: string }).id;
  madeFileIds.push(fixtureFileId);

  // ── the signatory, and the ASYMMETRY it exposes ──────────────────────────
  // Found by running this file: the CLIENT-OUTBOUND resolver refuses to render
  // without `signatory_name` and `signatory_title` (`lien-releases.ts:255`) —
  // "a release is signed on behalf of the company and both print on the form".
  // The SUB-INBOUND resolver blocks on the property address and the sub's name
  // and NOT on the signatory, and that difference is correct rather than an
  // omission: on the inbound direction we are not the signer. It is the same
  // reason §12 never stamps our signature there. The seeded company has both
  // fields NULL, so G1's positive control needs them set.
  const { data: co } = await admin
    .from('companies')
    .select('signatory_name, signatory_title')
    .eq('id', companyId)
    .single();
  priorSignatory = co as { signatory_name: string | null; signatory_title: string | null };
  await admin
    .from('companies')
    .update({ signatory_name: `${MARKER} Signer`, signatory_title: 'Managing Member' })
    .eq('id', companyId);

  subTemplateId = await makeTemplate('sub_inbound');
  clientTemplateId = await makeTemplate('client_outbound');
}, 180_000);

afterAll(async () => {
  if (priorSignatory) {
    await admin.from('companies').update(priorSignatory).eq('id', companyId);
  }
  if (madeReleases.length) await admin.from('lien_releases').delete().in('id', madeReleases);
  const { data: tpls } = await admin
    .from('lien_release_templates')
    .select('id')
    .eq('company_id', companyId)
    .like('name', `${MARKER}%`);
  const tplIds = (tpls ?? []).map((t) => (t as { id: string }).id);
  if (tplIds.length) {
    await admin.from('lien_releases').delete().in('template_id', tplIds);
    await admin.from('lien_release_template_boxes').delete().in('template_id', tplIds);
    await admin.from('lien_release_templates').delete().in('id', tplIds);
  }
  if (madeFileIds.length) await admin.from('files').delete().in('id', madeFileIds);
  if (madeStoragePaths.length) await admin.storage.from('project-files').remove(madeStoragePaths);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('S146-G1 — the POSITIVE control: client-outbound DOES stamp', () => {
  it('renders, embeds the signature image, and marks the release signed', async () => {
    state.client = ownerC;
    const res = await POST(
      req({ invoiceId, templateId: clientTemplateId, type: 'conditional' })
    );
    const body = (await res.json()) as { id?: string; error?: string };
    expect(res.status, `route said: ${body.error}`).toBe(200);
    madeReleases.push(body.id!);

    const { data: row } = await admin
      .from('lien_releases')
      .select('direction, type, status, invoice_id')
      .eq('id', body.id!)
      .single();
    const r = row as { direction: string; type: string; status: string; invoice_id: string };
    expect(r.direction).toBe('client_outbound');
    expect(r.status).toBe('signed');
    expect(r.invoice_id).toBe(invoiceId);

    // THE CONTROL. If this is 0 the sub-inbound assertions below prove nothing.
    const { bytes } = await storedPdf(body.id!);
    expect(
      await imageCount(bytes),
      'the client-outbound arm embedded no image — every "not stamped" assertion below is vacuous'
    ).toBeGreaterThan(0);
  }, 120_000);
});

describe('S146-G2 — sub-inbound COMPLETION → conditional against sub_contract_id', () => {
  it('the route runs, and the row is the instrument ruling (ii) names', async () => {
    state.client = ownerC;
    const res = await POST(
      req({ subTrigger: 'completion', subContractId, templateId: subTemplateId })
    );
    const body = (await res.json()) as { id?: string; error?: string };
    expect(res.status, `route said: ${body.error}`).toBe(200);
    madeReleases.push(body.id!);

    const { data: row } = await admin
      .from('lien_releases')
      .select('direction, type, status, invoice_id, expense_id, sub_contract_id, filled_values')
      .eq('id', body.id!)
      .single();
    const r = row as {
      direction: string;
      type: string;
      status: string;
      invoice_id: string | null;
      expense_id: string | null;
      sub_contract_id: string | null;
      filled_values: Record<string, string> | null;
    };

    expect(r.direction).toBe('sub_inbound');
    // The TYPE IS NOT PASSED IN — the route derives it from the trigger.
    expect(r.type).toBe('conditional');
    expect(r.sub_contract_id).toBe(subContractId);
    expect(r.expense_id).toBeNull();
    expect(r.invoice_id).toBeNull();

    // Ruling (i): the blank goes out, the sub signs on paper, the executed copy
    // comes back by upload. Nothing we generate on this side is ever 'signed'.
    expect(r.status).toBe('draft');

    // The snapshot is what the instrument SAID at render time. A release whose
    // values are re-resolved later is a different document.
    expect(r.filled_values).toBeTruthy();
    expect(Object.keys(r.filled_values ?? {}).length).toBeGreaterThan(0);
    // THE INVERSION — the claimant is the SUB, never the company.
    expect(r.filled_values?.claimant_name).toBeTruthy();
    expect(r.filled_values?.claimant_name).not.toBe('Bishop Contracting');
    expect(r.filled_values?.contractor_furnished_to).toBe('Bishop Contracting');
  }, 120_000);

  it('renderRelease PRODUCED a document, and it carries NO signature of ours', async () => {
    const id = madeReleases[madeReleases.length - 1];
    const { path, bytes } = await storedPdf(id);

    // The renderer ran on this direction for the first time.
    expect(bytes.length).toBeGreaterThan(0);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');

    // §12 — stamping our signature onto a release we are RECEIVING would be
    // signing someone else's instrument. Paired with G1's positive control.
    expect(await imageCount(bytes)).toBe(0);

    // The storage key is the SUB path, not the invoice path it was before S145.
    expect(path).toContain(`${companyId}/lien-releases/`);
    expect(path).toContain(subContractId);
    expect(path).not.toContain(invoiceId);
  }, 120_000);
});

describe('S146-G3 — sub-inbound PAYMENT → unconditional against expense_id', () => {
  it('the other arm, and the subject moves to the paid stage', async () => {
    state.client = ownerC;
    const res = await POST(req({ subTrigger: 'payment', expenseId, templateId: subTemplateId }));
    const body = (await res.json()) as { id?: string; error?: string };
    expect(res.status, `route said: ${body.error}`).toBe(200);
    madeReleases.push(body.id!);

    const { data: row } = await admin
      .from('lien_releases')
      .select('direction, type, status, expense_id, sub_contract_id, invoice_id')
      .eq('id', body.id!)
      .single();
    const r = row as {
      direction: string;
      type: string;
      status: string;
      expense_id: string | null;
      sub_contract_id: string | null;
      invoice_id: string | null;
    };
    expect(r.direction).toBe('sub_inbound');
    expect(r.type).toBe('unconditional');
    expect(r.expense_id).toBe(expenseId);
    expect(r.sub_contract_id).toBeNull();
    expect(r.invoice_id).toBeNull();
    expect(r.status).toBe('draft');

    const { path, bytes } = await storedPdf(body.id!);
    expect(await imageCount(bytes)).toBe(0);
    expect(path).toContain(expenseId);
  }, 120_000);

  it('the caller CANNOT choose the type — a lying `type` in the body is ignored', async () => {
    // Ruling (ii) is the point of the whole arm: a completion prompt must not be
    // able to produce an unconditional release, which would be a statement that
    // money has moved when it has not. The route derives the type from the
    // trigger; this proves the body cannot override it.
    state.client = ownerC;
    await freeSlot('sub_contract_id', subContractId);
    const res = await POST(
      req({
        subTrigger: 'completion',
        subContractId,
        templateId: subTemplateId,
        type: 'unconditional', // <- the lie
      })
    );
    const body = (await res.json()) as { id?: string; error?: string };
    expect(res.status, `route said: ${body.error}`).toBe(200);
    madeReleases.push(body.id!);

    const { data: row } = await admin
      .from('lien_releases')
      .select('type')
      .eq('id', body.id!)
      .single();
    expect((row as { type: string }).type).toBe('conditional');
  }, 120_000);

  it('a release is client-outbound or sub-inbound, never both', async () => {
    state.client = ownerC;
    const res = await POST(
      req({ invoiceId, subTrigger: 'payment', expenseId, templateId: subTemplateId })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/never both/i);
  }, 120_000);
});

describe('S146-G4 — the route floor holds on the new arm too', () => {
  it('a PM is refused 403, and NOTHING is written', async () => {
    const before = await admin
      .from('lien_releases')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);

    state.client = pmC;
    const res = await POST(
      req({ subTrigger: 'completion', subContractId, templateId: subTemplateId })
    );
    expect(res.status).toBe(403);

    const after = await admin
      .from('lien_releases')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    // A refusal that still wrote a row is not a refusal.
    expect(after.count).toBe(before.count);
    state.client = ownerC;
  }, 120_000);

  it('a sub-inbound call with no subject is refused before anything renders', async () => {
    state.client = ownerC;
    const res = await POST(req({ subTrigger: 'completion', templateId: subTemplateId }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/subContractId is required/i);
  }, 120_000);
});

describe('S146-G5 — the two directions have DIFFERENT build guards, on purpose', () => {
  it('sub-inbound renders with NO company signatory; client-outbound refuses', async () => {
    // Discovered by executing G1 rather than by reading: §6.3's blocker list is
    // not shared between the resolvers. Client-outbound requires the signatory
    // because WE sign that instrument. Sub-inbound does not, because the SUB
    // does — the same reason §12 leaves the signature box empty there.
    //
    // Asserted rather than commented, because a future edit that "tidies" the
    // two blocker lists into one would silently start refusing every
    // sub-inbound release for a company that has no signatory on file.
    state.client = ownerC;
    await admin
      .from('companies')
      .update({ signatory_name: null, signatory_title: null })
      .eq('id', companyId);

    try {
      await freeSlot('sub_contract_id', subContractId);
      const subRes = await POST(
        req({ subTrigger: 'completion', subContractId, templateId: subTemplateId })
      );
      const subBody = (await subRes.json()) as { id?: string; error?: string };
      expect(subRes.status, `sub arm said: ${subBody.error}`).toBe(200);
      madeReleases.push(subBody.id!);

      await freeSlot('invoice_id', invoiceId);
      const cliRes = await POST(
        req({ invoiceId, templateId: clientTemplateId, type: 'conditional' })
      );
      expect(cliRes.status).toBe(422);
      const cliBody = (await cliRes.json()) as { error: string };
      expect(cliBody.error).toMatch(/signatory name and title/i);
    } finally {
      await admin
        .from('companies')
        .update({ signatory_name: `${MARKER} Signer`, signatory_title: 'Managing Member' })
        .eq('id', companyId);
    }
  }, 120_000);
});
