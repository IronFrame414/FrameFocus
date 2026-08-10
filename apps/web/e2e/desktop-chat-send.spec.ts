import { test, expect } from '@playwright/test';
import { OWNER, PROJECT_QA_A, signIn, teardownChat } from './chat-fixture';

// CHUNK 3 of 4 — sending, and the two surfaces rendering the same thread.

test.beforeAll(async () => {
  await teardownChat([PROJECT_QA_A]);
});

test.afterAll(async () => {
  await teardownChat([PROJECT_QA_A]);
});

test.describe('the send path, through the panel', () => {
  test('a sent message renders in the thread', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/dashboard');
    await page.getByTestId('chat-launcher').click();

    // No thread and no messages exist yet — the thread is created lazily by
    // opening it, which is the real path rather than a seeded row.
    await page
      .locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_QA_A}"]`)
      .click();
    await expect(page.getByTestId('chat-empty')).toBeVisible({ timeout: 20_000 });

    const body = `slice 3 send check ${Date.now()}`;
    await page.getByTestId('chat-composer-input').fill(body);
    await page.getByTestId('chat-send').click();

    const message = page.getByTestId('chat-message').filter({ hasText: body });
    await expect(message).toHaveCount(1, { timeout: 20_000 });
    // Attributed, and attributed to the sender — a build that rendered every
    // bubble left would still show the text.
    await expect(message).toContainText('You');

    // The composer clears only on success, so a message still sitting in the
    // input is a send that did not happen.
    await expect(page.getByTestId('chat-composer-input')).toHaveValue('');
    // ND-24 / A-C21 — nothing is left in the pending or failed state.
    await expect(page.getByTestId('chat-message-sending')).toHaveCount(0);
    await expect(page.getByTestId('chat-message-failed')).toHaveCount(0);
  });

  test('A-C28 — the project Chat tab shows the same thread', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto('/dashboard');
    await page.getByTestId('chat-launcher').click();
    await page
      .locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_QA_A}"]`)
      .click();
    await expect(page.getByTestId('chat-thread')).toBeVisible({ timeout: 20_000 });

    const body = `written in the panel ${Date.now()}`;
    await page.getByTestId('chat-composer-input').fill(body);
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-message').filter({ hasText: body })).toHaveCount(1, {
      timeout: 20_000,
    });

    // Same thread, other surface. Both render through ChatThreadView; if they
    // did not, this is where the two would disagree — #129's failure was
    // exactly a message that existed on one surface and not the other.
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}/chat`);
    await expect(page.getByTestId('chat-message').filter({ hasText: body })).toHaveCount(1, {
      timeout: 20_000,
    });
  });

  test('the Chat tab is reachable from the project tab strip', async ({ page }) => {
    await signIn(page, OWNER);
    await page.goto(`/dashboard/projects/${PROJECT_QA_A}`);

    await page.getByRole('link', { name: 'Chat', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/projects/${PROJECT_QA_A}/chat$`));
    await expect(page.getByTestId('chat-thread')).toBeVisible({ timeout: 20_000 });
  });
});
