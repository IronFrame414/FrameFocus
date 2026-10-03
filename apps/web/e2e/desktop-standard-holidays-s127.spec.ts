import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S127 item 6 — the seven standard holidays on the Working Calendar tab: a
// checkbox each with THIS year's resolved date, and ticking one shows its
// consequence BEFORE anything is written. Cancel writes nothing; Apply writes
// exactly `enabled` — read back with the service role. The row is restored.

const OWNER = 'josh+test50@worthprop.com';
const admin = adminClient();
let ruleId = '';
let original: boolean | null = null;

test.beforeAll(async () => {
  const { data, error } = await admin
    .from('company_holiday_rules')
    .select('id, enabled')
    .eq('company_id', COMPANY_A)
    .eq('rule_key', 'memorial_day')
    .eq('is_deleted', false)
    .single();
  if (error || !data)
    throw new Error(`no memorial_day rule seeded for Company A: ${error?.message}`);
  ruleId = data.id as string;
  original = data.enabled as boolean;
});

test.afterAll(async () => {
  if (ruleId && original !== null)
    await admin.from('company_holiday_rules').update({ enabled: original }).eq('id', ruleId);
});

async function enabled(): Promise<boolean> {
  const { data } = await admin
    .from('company_holiday_rules')
    .select('enabled')
    .eq('id', ruleId)
    .single();
  return data!.enabled as boolean;
}

test('seven rows with this year’s dates; a change states its consequence first; cancel writes nothing; apply writes it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, OWNER);
  await page.goto('/dashboard/settings?tab=schedule');
  const list = page.getByTestId('standard-holidays');
  await expect(list.locator('input[type="checkbox"]')).toHaveCount(7);
  const year = new Date().getFullYear();
  await expect(list).toContainText(`Christmas Day — ${year}-12-25`);

  const box = page.getByTestId(`holiday-rule-${ruleId}`);
  const before = await enabled();
  await box.click();
  await expect(page.getByTestId('holiday-consequence-text')).not.toHaveText(
    'Checking what moves…',
    { timeout: 30_000 }
  );
  // Nothing written while the consequence is on screen.
  expect(await enabled()).toBe(before);
  await page.getByTestId('holiday-cancel').click();
  expect(await enabled()).toBe(before);

  await box.click();
  await expect(page.getByTestId('holiday-apply')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('holiday-apply').click();
  await expect.poll(enabled, { timeout: 15_000 }).toBe(!before);
});
