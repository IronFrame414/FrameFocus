import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signInAs } from './sign-in-as';

// ============================================================================
// S119 ITEM D-2 — the Project Executive's estimates, through the real screens.
// RULED [Josh, 2026-09-29]: "PE can create. I also want to be able to add access
// to a PE for an estimate I started." … "that is the only one that PE can view."
//   1. The PE creates one at /dashboard/estimates/new and lands in an EDITABLE
//      builder, with no send, convert or clone offered.
//   2. The Owner grants the PE an estimate the Owner started, from the new
//      "Project Executive access" control; the PE can then open and edit it.
//   3. An estimate nobody assigned stays out of the PE's reach.
// The database rules are proven in s119-pe-estimate-assignment.live.ts.
// ============================================================================

const admin = adminClient();
const MARKER = 'S119PEUI';
const OWNER = 'josh+test50@worthprop.com';
const PE = 'josh+qa-pe@worthprop.com';
const STAMP = Date.now();
let companyId = '';
let contact = { id: '', search: '' };
let peMember = '';
let ownerStarted = '';
let unassigned = '';

const editableInputs = 'main input:not([disabled]):not([type="search"]), main textarea:not([disabled])';

async function sweep(): Promise<void> {
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = ((data ?? []) as { id: string }[]).map((e) => e.id);
  if (!ids.length) return;
  await admin.from('estimate_assignments').delete().in('estimate_id', ids);
  await admin.from('estimate_events').delete().in('estimate_id', ids);
  await admin.from('estimates').delete().in('id', ids);
}

async function ownerDraft(label: string): Promise<string> {
  const { data: o } = await admin.from('profiles').select('user_id').eq('email', OWNER).single();
  const { data, error } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      name: `${MARKER} ${label} ${STAMP}`,
      estimate_number: `${MARKER}-${label}-${STAMP}`,
      contact_id: contact.id,
      status: 'draft',
      created_by: (o as { user_id: string }).user_id,
      created_by_role: 'owner',
    })
    .select('id')
    .single();
  if (error) throw new Error(`draft ${label}: ${error.message}`);
  return (data as { id: string }).id;
}

test.beforeAll(async () => {
  const { data: p } = await admin.from('profiles').select('id, company_id').eq('email', PE).single();
  companyId = (p as { company_id: string }).company_id;
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', (p as { id: string }).id).single();
  peMember = (m as { id: string }).id;
  // A contact WITH a job-site address: the form requires one (first run stalled on
  // the unfilled "Job-site address *" — validation, not permission).
  const { data: addr } = await admin
    .from('contact_addresses')
    .select('contact_id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('contact_id')
    .limit(1)
    .single();
  const { data: c } = await admin
    .from('contacts')
    .select('id, last_name')
    .eq('id', (addr as { contact_id: string }).contact_id)
    .single();
  contact = { id: (c as { id: string }).id, search: (c as { last_name: string }).last_name };
  await sweep();
  ownerStarted = await ownerDraft('owner-started');
  unassigned = await ownerDraft('unassigned');
});

test.afterAll(async () => {
  await sweep();
});

test.describe('S119 D-2 · the PE and its estimates', () => {
  test.setTimeout(120_000);

  test('1 — the PE creates an estimate and lands in an editable builder, with no send, convert or clone', async ({ page }) => {
    await signInAs(page, PE);
    await page.goto('/dashboard/estimates/new');
    await expect(page.getByText('Clone from existing? (optional)')).toHaveCount(0);
    await page.getByPlaceholder('Search contacts…').click();
    await page.getByPlaceholder('Search contacts…').fill(contact.search);
    await page.getByText(contact.search, { exact: false }).first().dispatchEvent('mousedown');
    const address = page.locator('main select').first();
    await expect(address.locator('option')).not.toHaveCount(1);
    await address.selectOption({ index: 1 });
    await page.getByPlaceholder('e.g. Bishop Kitchen & Flooring Reno').fill(`${MARKER} by-pe ${STAMP}`);
    await page.getByRole('button', { name: 'Create Estimate' }).click();
    await page.waitForURL(/\/dashboard\/estimates\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const id = new URL(page.url()).pathname.split('/').pop()!;

    const { data: asg } = await admin
      .from('estimate_assignments').select('member_id').eq('estimate_id', id).eq('is_deleted', false);
    expect(asg).toEqual([{ member_id: peMember }]);

    await expect(page.getByText(`${MARKER} by-pe ${STAMP}`).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(editableInputs).first()).toBeVisible();
    await expect(page.getByTestId('est-review-send')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Convert to Project/i })).toHaveCount(0);
    await expect(page.getByTestId('est-pe-access')).toHaveCount(0);
  });

  test('2 — the Owner grants the PE an estimate the Owner started; the PE then opens it editable', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/estimates/${ownerStarted}`);
    const select = page.locator('#est-pe-access-select');
    await expect(select).toBeVisible({ timeout: 30_000 });
    await select.selectOption(peMember);
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('estimate_assignments').select('member_id').eq('estimate_id', ownerStarted).eq('is_deleted', false);
        return data;
      })
      .toEqual([{ member_id: peMember }]);

    await page.context().clearCookies();
    await signInAs(page, PE);
    await page.goto(`/dashboard/estimates/${ownerStarted}`);
    await expect(page.getByText(`${MARKER} owner-started ${STAMP}`).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(editableInputs).first()).toBeVisible();
  });

  test('3 — an estimate nobody assigned stays out of the PE\'s reach', async ({ page }) => {
    await signInAs(page, PE);
    await page.goto(`/dashboard/estimates/${unassigned}`);
    await expect(page.getByText('Estimate not found.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`${MARKER} unassigned ${STAMP}`)).toHaveCount(0);
  });
});
