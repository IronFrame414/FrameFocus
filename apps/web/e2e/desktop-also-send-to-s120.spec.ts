import { test, expect } from '@playwright/test';
import { OWNER, signIn } from './chat-fixture';
import { adminClient } from './hub-fixture';

// S120 4-B — the "Also send to (email)" field on the estimate DETAILS page.
//
//   * Owner: a malformed address is REFUSED on screen and stays in the box (so
//     it can be fixed) — never silently dropped; a valid one is saved,
//     normalised, on the RECORD (read back with the service role).
//   * PM: sees the address, cannot edit who the proposal goes to (the database
//     refuses it too — s120-estimate-recipients.live.ts).
// Delivery itself (a copy, no signing link) is the live file's job.

const MARKER = 'E2EALSO';
const PM = 'josh+pm@worthprop.com';
const admin = adminClient();
let estimateId = '';

async function sweep() {
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (ests ?? []).map((e) => e.id as string);
  if (ids.length) await admin.from('estimates').delete().in('id', ids);
  await admin.from('contacts').delete().like('first_name', `${MARKER}%`);
}

async function typedOnRecord(): Promise<string | null> {
  const { data } = await admin
    .from('estimates')
    .select('also_send_to_email')
    .eq('id', estimateId)
    .single();
  return (data as { also_send_to_email: string | null }).also_send_to_email;
}

test.beforeAll(async () => {
  await sweep();
  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Sabal Point Construction')
    .single();
  const { data: pm } = await admin.from('profiles').select('user_id').eq('email', PM).single();
  const { data: contact } = await admin
    .from('contacts')
    .insert({
      company_id: company!.id,
      first_name: `${MARKER} Test`,
      last_name: 'Client',
      email: 'e2ealso-client@example.com',
    })
    .select('id')
    .single();
  const { data: est, error } = await admin
    .from('estimates')
    .insert({
      company_id: company!.id,
      estimate_number: `${MARKER}-${Date.now()}`,
      name: `${MARKER} Draft estimate`,
      contact_id: contact!.id,
      status: 'draft',
      // The PM's own draft, so the PM CAN edit it — the read-only field is then
      // the recipient rule, not a locked estimate.
      created_by_role: 'project_manager',
      created_by: pm!.user_id,
    })
    .select('id')
    .single();
  expect(error, 'estimate fixture refused').toBeNull();
  estimateId = est!.id as string;
});

test.afterAll(async () => {
  await sweep();
});

test('Owner: a malformed address is refused on screen and kept; a valid one is saved, normalised', async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  const box = page.getByTestId('also-send-to-email');
  await expect(box).toBeVisible();

  await box.fill('not-an-email');
  await box.blur();
  await expect(page.getByTestId('also-send-to-email-error')).toContainText(
    'one valid email address'
  );
  await expect(box).toHaveValue('not-an-email');
  expect(await typedOnRecord()).toBeNull();

  await box.fill('  Lender@Example.COM ');
  await box.blur();
  await expect(page.getByTestId('also-send-to-email-error')).toHaveCount(0);
  await expect.poll(typedOnRecord).toBe('lender@example.com');
});

test('PM on its own draft: sees the address, cannot edit who the proposal goes to', async ({
  page,
}) => {
  await admin
    .from('estimates')
    .update({ also_send_to_email: 'lender@example.com' })
    .eq('id', estimateId);
  await signIn(page, PM);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  await expect(page.getByTestId('also-send-to-email-readonly')).toHaveText('lender@example.com');
  await expect(page.getByTestId('also-send-to-email')).toHaveCount(0);
});
