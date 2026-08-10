import { test, expect } from '@playwright/test';
import { PROJECT_QA_A, signIn, teardownChat } from './chat-fixture';

// ============================================================================
// THE SUB THREAD, AS THE SUBCONTRACTOR — MOVED HERE FROM DESKTOP [S131].
// A-C2, A-C7, §7.1e, §7.4.
// ============================================================================
//
// ⚠️ THIS TEST USED TO LIVE IN `desktop-chat-sub.spec.ts` AND COULD ONLY RUN
// THERE BECAUSE OF A BUG. Slice 4's own header said so: a subcontractor
// signing into `/dashboard` was observable only because `DASHBOARD_ROLES` was
// enforced nowhere. Ruling A [S131] enforces it, so that test would now fail —
// and its failure would be CORRECT.
//
// It is moved rather than deleted. The assertions are about the sub THREAD, not
// about the dashboard: that a sub sees their assigned projects and no others,
// gets no segment control because one segment is not a control, and can post.
// Deleting them would have cost slice 4's completion condition to fix a routing
// bug they never depended on. The surface changed; the criteria did not.
//
// Runs in the `chromium-auth` project (402x874, the M6M §2 canvas), whose
// stored owner session is cleared below so the sub can sign in.

const SUB = 'josh+qa-sub@worthprop.com';

test.use({ storageState: { cookies: [], origins: [] } });

test.afterAll(async () => {
  await teardownChat([PROJECT_QA_A]);
});

test.describe('the subcontractor identity, on /m', () => {
  test('sees the SUB thread only — no crew segment, and a composer they can use', async ({
    page,
  }) => {
    await signIn(page, SUB, /\/m\/projects/);

    // The chat overlay, opened from the tab bar (ND-33 / A-C35).
    await page.getByTestId('m-tab-chat').click();
    await expect(page.getByTestId('m-chat-overlay')).toBeVisible({ timeout: 20_000 });

    // Their switcher is their two assigned projects and nothing else. The crew
    // thread is not merely hidden — RLS refuses it (ND-19, the one absolute),
    // and that half is asserted properly in `s126-chat-sub.live.ts`.
    const rows = page.getByTestId('chat-switcher-project');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    await expect(rows).toHaveCount(2);

    await page
      .locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_QA_A}"]`)
      .click();
    await expect(page.getByTestId('chat-thread')).toBeVisible({ timeout: 20_000 });

    // One segment is not a control (§7.1e), so there is none.
    await expect(page.getByTestId('chat-thread-segments')).toHaveCount(0);

    // And they CAN post — the sub thread is theirs.
    await expect(page.getByTestId('chat-composer-input')).toBeVisible();
    const body = `sub speaking ${Date.now()}`;
    await page.getByTestId('chat-composer-input').fill(body);
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-message').filter({ hasText: body })).toHaveCount(1, {
      timeout: 20_000,
    });
  });
});
