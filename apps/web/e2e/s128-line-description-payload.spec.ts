import { test, expect, request as playwrightRequest } from '@playwright/test';
import { adminClient } from './hub-fixture';

// ============================================================================
// S128 Part A — A-2, PROVEN ON THE BYTES (the S127 item 4e method).
// [Josh, 2026-10-03] "the description is only visible to clients when the format
// selected is 'summary with description', 'itemized with description', 'cost
// plus', 'time and material'"
//
// For each of the eight canonical formats: a SENT estimate whose section carries
// an internal note, and whose LINE (row) carries a description; a signing link;
// then a COOKIE-LESS fetch of the client's two surfaces — the /sign/{token} page
// HTML and the /api/sign/{token} JSON. The row description must be in the bytes
// on exactly the four formats and ABSENT from the bytes on the other four. The
// internal note must be absent on all eight (stop rule 5).
//
// A page that never rendered cannot pass: every fetch must contain the
// estimate's own name (a sentinel the error card does not carry).
// ============================================================================

const MARKER = 'E2ES128LD';
const ROW_DESC = 'S128ROWDESCSENTINEL';
const NOTE = 'S128INTERNALNOTESENTINEL';

const SHOWS = [
  'summary_with_descriptions',
  'itemized_with_descriptions',
  'cost_plus_itemized',
  'time_and_materials_itemized',
] as const;
const HIDES = ['total_only', 'summary', 'itemized', 'itemized_no_unit_pricing'] as const;
type Format = (typeof SHOWS)[number] | (typeof HIDES)[number];

const tokens = new Map<Format, string>();

async function sweep(): Promise<void> {
  const admin = adminClient();
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (data ?? []).map((e) => e.id);
  if (!ids.length) return;
  await admin.from('signing_sessions').delete().in('estimate_id', ids);
  await admin.from('proposal_views').delete().in('estimate_id', ids);
  const { error } = await admin.from('estimates').delete().in('id', ids);
  if (error) throw new Error(`sweep: ${error.message}`);
}

test.beforeAll(async () => {
  const admin = adminClient();
  await sweep();
  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Sabal Point Construction')
    .single();
  const companyId = company!.id;
  const { data: ct } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('id')
    .limit(1)
    .single();

  for (const format of [...SHOWS, ...HIDES]) {
    const { data: est, error: eErr } = await admin
      .from('estimates')
      .insert({
        company_id: companyId,
        contact_id: ct!.id,
        name: `${MARKER} ${format}`,
        status: 'draft',
        estimate_number: `EST-${MARKER}-${format.slice(0, 18)}`,
        created_by_role: 'owner',
        contract_type: 'fixed_price',
        pricing_mode: 'markup',
        labor_markup_percent: 20,
        tax_rate: 0,
        proposal_pricing_level: format,
      })
      .select('id')
      .single();
    if (eErr) throw new Error(`estimate ${format}: ${eErr.message}`);
    const { data: cat, error: cErr } = await admin
      .from('estimate_categories')
      .insert({ company_id: companyId, estimate_id: est!.id, name: 'Interior', sort_order: 0 })
      .select('id')
      .single();
    if (cErr) throw new Error(`category: ${cErr.message}`);
    const { data: li, error: lErr } = await admin
      .from('estimate_line_items')
      .insert({
        company_id: companyId,
        estimate_id: est!.id,
        category_id: cat!.id,
        name: 'Drywall Repair and Trim',
        sort_order: 0,
        total_price: 720,
        notes: NOTE,
      })
      .select('id')
      .single();
    if (lErr) throw new Error(`section: ${lErr.message}`);
    const { error: rErr } = await admin.from('estimate_line_rows').insert({
      company_id: companyId,
      line_item_id: li!.id,
      row_type: 'labor',
      name: 'Drywall',
      sort_order: 0,
      rate: 60,
      quantity: 10,
      apply_tax: false,
      total: 720,
      description: `${ROW_DESC} patch and skim`,
    });
    if (rErr) throw new Error(`row: ${rErr.message}`);
    const { error: sErr } = await admin.from('estimates').update({ status: 'sent' }).eq('id', est!.id);
    if (sErr) throw new Error(`sent: ${sErr.message}`);
    const token = crypto.randomUUID();
    const { error: tErr } = await admin.from('signing_sessions').insert({
      company_id: companyId,
      estimate_id: est!.id,
      token,
      recipient_email: `josh+s128ld-${format}@worthprop.com`,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    if (tErr) throw new Error(`session: ${tErr.message}`);
    tokens.set(format, token);
  }
});

test.afterAll(async () => {
  await sweep();
});

async function clientBytes(token: string): Promise<{ page: string; json: string }> {
  // A fresh request context: NO cookies, NO storage state — what a client's link opens.
  const ctx = await playwrightRequest.newContext({ baseURL: 'http://localhost:3000' });
  try {
    const page = await ctx.get(`/sign/${token}`);
    expect(page.status()).toBe(200);
    const api = await ctx.get(`/api/sign/${token}`);
    expect(api.status()).toBe(200);
    return { page: await page.text(), json: await api.text() };
  } finally {
    await ctx.dispose();
  }
}

for (const format of SHOWS) {
  test(`A-2 · ${format}: the line description IS in the client's bytes; the internal note is not`, async () => {
    const { page, json } = await clientBytes(tokens.get(format)!);
    expect(page, 'the page never rendered').toContain(`${MARKER} ${format}`);
    expect(page).toContain(ROW_DESC);
    expect(json).toContain(ROW_DESC);
    expect(page).not.toContain(NOTE);
    expect(json).not.toContain(NOTE);
  });
}

for (const format of HIDES) {
  test(`⚠️ A-2 · ${format}: the line description is ABSENT from the client's bytes (and the note)`, async () => {
    const { page, json } = await clientBytes(tokens.get(format)!);
    expect(page, 'the page never rendered').toContain(`${MARKER} ${format}`);
    expect(page, 'row description in the HTML payload').not.toContain(ROW_DESC);
    expect(json, 'row description in the JSON payload').not.toContain(ROW_DESC);
    expect(page).not.toContain(NOTE);
    expect(json).not.toContain(NOTE);
  });
}
