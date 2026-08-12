import { test, expect } from '@playwright/test';
import {
  CREW,
  OWNER,
  PROJECT_QA_A,
  PROJECT_QA_A_NAME,
  PROJECT_TEST,
  seedMessage,
  signIn,
  teardownChat,
} from './chat-fixture';

// CHUNK 2 of 4 — the switcher (ND-34). A-C26, A-C37, and unread.

test.beforeAll(async () => {
  await teardownChat([PROJECT_QA_A, PROJECT_TEST]);
  // Seeded AS CREW, read as OWNER. Your own messages are never unread by
  // design, so seeding as the viewer would make every assertion below pass at
  // zero — the vacuous-pass failure this spec exists to avoid.
  await seedMessage(PROJECT_TEST, CREW, 'older message, project test');
  // Ordering is by the project's most recent message, so the second seed must
  // land strictly later. Sequential awaits give distinct created_at values.
  await seedMessage(PROJECT_QA_A, CREW, 'newer message, project QA A');
});

test.afterAll(async () => {
  await teardownChat([PROJECT_QA_A, PROJECT_TEST]);
});

test.describe('ND-34 — the switcher', () => {
  test('lists projects with a thread, most recent message first', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/dashboard');
    await page.getByTestId('chat-launcher').click();

    const rows = page.getByTestId('chat-switcher-project');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });

    // The two seeded projects lead the list, newest first. Everything after
    // them has no messages and sorts by name (§7.1a-i — "a project with no
    // messages sorts last; it has nothing to return to").
    await expect(rows.nth(0)).toHaveAttribute('data-project-id', PROJECT_QA_A);
    await expect(rows.nth(1)).toHaveAttribute('data-project-id', PROJECT_TEST);
  });

  test('the launcher badge sums unread BEFORE the panel is opened', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/dashboard');

    // ⚠️ ASSERTED WHILE THE PANEL IS CLOSED, and that is the whole point of the
    // badge rather than an accident of ordering. It exists to tell someone who
    // is not looking at chat that there is something to look at; once the panel
    // is open the count is on the rows themselves and the launcher shows a
    // close control instead.
    //
    // The first version of this test clicked the launcher and then looked for
    // the badge. It failed, and the TEST was what was wrong — the per-project
    // counts either side of it were already correct.
    await expect(page.getByTestId('chat-launcher-badge')).toHaveText('2', { timeout: 20_000 });
  });

  test('each thread carries its own unread count', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/dashboard');
    await page.getByTestId('chat-launcher').click();

    const qaA = page.locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_QA_A}"]`);
    await expect(qaA).toBeVisible({ timeout: 20_000 });
    await expect(qaA).toHaveAttribute('data-unread', '1');
    await expect(qaA.getByTestId('chat-switcher-unread')).toHaveText('1');
  });

  test('A-C26 — choosing a project does NOT navigate', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/dashboard/contacts');
    const before = page.url();

    await page.getByTestId('chat-launcher').click();
    await page
      .locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_QA_A}"]`)
      .click();

    await expect(page.getByTestId('chat-thread')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('chat-panel-title')).toHaveText(PROJECT_QA_A_NAME);
    expect(page.url()).toBe(before);
  });

  test('opening a thread clears ITS unread and leaves the other alone', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/dashboard');
    await page.getByTestId('chat-launcher').click();

    await page
      .locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_QA_A}"]`)
      .click();
    await expect(page.getByTestId('chat-thread')).toBeVisible({ timeout: 20_000 });

    // Back to the list — which refetches, so this reads the DATABASE's answer
    // and not a number the client decremented for itself.
    await page.getByTestId('chat-back').click();

    const qaA = page.locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_QA_A}"]`);
    await expect(qaA).toHaveAttribute('data-unread', '0', { timeout: 20_000 });

    // A-C4's shape: unread is PER THREAD. Reading one must not clear the other,
    // which is the assertion a build keyed on project_id would fail.
    const other = page.locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_TEST}"]`);
    await expect(other).toHaveAttribute('data-unread', '1');
  });
});
