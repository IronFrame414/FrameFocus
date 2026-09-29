import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';

// [S116] A DELIVERY PAGE RENDERS. Since 20260902000000 added
// `deliveries.checked_in_by` — a SECOND foreign key to company_members — the
// bare `receiver:company_members(display_name)` embed in DELIVERY_SELECT was
// ambiguous; PostgREST refused it (PGRST201) and every read through it came
// back null. The delivery detail and edit pages 404'd, and the delivery PDF
// failed with "Delivery not found" (visible in CI logs as
// "[deliveries/check-in] PDF failed"). Nothing in the suite rendered either
// page, which is how seven weeks passed. Found by the S116 C-5 proof for the
// delivery edit form.
//
// Seeds one delivery with the service role, opens both pages as the Owner,
// and requires the page's own heading and receiver — a 404 cannot pass.

const OWNER = 'josh+test50@worthprop.com';
const RUN = `s116-deliv-${Date.now()}`;
const VENDOR = `Vendor ${RUN}`;
const admin = adminClient();

let projectId = '';
let deliveryId = '';
let receiverName = '';

test.beforeAll(async () => {
  const { data: project, error: pErr } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (pErr || !project) throw new Error(`no active Company A project: ${pErr?.message}`);
  projectId = project.id as string;

  const { data: prof, error: profErr } = await admin
    .from('profiles')
    .select('id, user_id')
    .eq('email', OWNER)
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .single();
  if (profErr || !prof) throw new Error(`owner profile: ${profErr?.message}`);
  const { data: mem, error: memErr } = await admin
    .from('company_members')
    .select('id, display_name')
    .eq('profile_id', prof.id)
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .single();
  if (memErr || !mem) throw new Error(`owner member: ${memErr?.message}`);
  receiverName = (mem.display_name as string | null) ?? '';

  // Checked in (checked_in_by set), so BOTH member FKs are populated — the
  // exact shape the ambiguous embed could not resolve.
  const { data: del, error: delErr } = await admin
    .from('deliveries')
    .insert({
      company_id: COMPANY_A,
      project_id: projectId,
      purchase_order_id: null,
      vendor_name: VENDOR,
      delivery_date: new Date().toISOString().slice(0, 10),
      received_by: mem.id,
      checked_in_at: new Date().toISOString(),
      checked_in_by: mem.id,
      created_by: prof.user_id,
      updated_by: prof.user_id,
    })
    .select('id')
    .single();
  if (delErr || !del) throw new Error(`seed delivery: ${delErr?.message}`);
  deliveryId = del.id as string;
  const { error: itemErr } = await admin.from('delivery_items').insert({
    company_id: COMPANY_A,
    delivery_id: deliveryId,
    description: `Line ${RUN}`,
    qty_received: 1,
    qty_damaged: 0,
    created_by: prof.user_id,
    updated_by: prof.user_id,
  });
  if (itemErr) throw new Error(`seed item: ${itemErr.message}`);
});

test.afterAll(async () => {
  if (deliveryId) {
    await admin.from('delivery_items').delete().eq('delivery_id', deliveryId);
    await admin.from('deliveries').delete().eq('id', deliveryId);
  }
  const { count } = await admin
    .from('deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_name', VENDOR);
  expect(count, 'seeded delivery removed').toBe(0);
});

test.describe('S116 · delivery pages render (DELIVERY_SELECT names its FK)', () => {
  test.setTimeout(120_000);

  test('the delivery detail page renders its heading and receiver', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/field-ops/${projectId}/deliveries/d/${deliveryId}`);
    await expect(page.getByRole('heading', { name: `Delivery — ${VENDOR}` })).toBeVisible();
    await expect(page.getByText('This page could not be found.')).toHaveCount(0);
    expect(receiverName.length, 'the owner member has a display name to look for').toBeGreaterThan(
      0
    );
    await expect(page.getByText(receiverName).first()).toBeVisible();
  });

  test('the delivery edit page renders its heading', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/field-ops/${projectId}/deliveries/d/${deliveryId}/edit`);
    await expect(page.getByRole('heading', { name: `Edit delivery — ${VENDOR}` })).toBeVisible();
    await expect(page.getByText('This page could not be found.')).toHaveCount(0);
  });
});
