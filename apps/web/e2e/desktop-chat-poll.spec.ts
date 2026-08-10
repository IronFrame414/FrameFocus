import { test, expect, type Page } from '@playwright/test';
import { OWNER, PROJECT_QA_A, signIn, teardownChat } from './chat-fixture';
import { adminClient, COMPANY_A } from './hub-fixture';

// A-C39's COMPONENT WIRING, and §7.2's load-older control.
//
// ⚠️ WHY THIS FILE EXISTS AT ALL. `lib/chat/poll.ts` is thoroughly unit-tested
// against injectable timers — start, stop, hidden document, listener removal,
// idempotency, mid-flight drop. NONE of that proves the thing that CALLS it is
// wired up. A-C39's failure is invisible: nothing on screen is wrong while a
// backgrounded tab polls all day, which is exactly why a unit test on the
// controller is not sufficient.
//
// The interval is 12s, so these tests are slow on purpose. A shorter interval
// would mean testing a different transport than the one that ships.

const POLL_MS = 12_000;
const TOTAL = 30;

async function seedHistory(): Promise<void> {
  const admin = adminClient();
  await teardownChat([PROJECT_QA_A]);

  const { data: thread } = await admin
    .from('chat_threads')
    .insert({ company_id: COMPANY_A, project_id: PROJECT_QA_A, kind: 'crew' })
    .select('id')
    .single();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', OWNER)
    .single();

  // created_at spaced explicitly: the paging keys on it, and rows inserted in
  // one statement can share a microsecond, which makes the page boundary
  // meaningless.
  const base = new Date('2026-08-01T09:00:00Z').getTime();
  await admin.from('chat_messages').insert(
    Array.from({ length: TOTAL }, (_, i) => ({
      company_id: COMPANY_A,
      thread_id: (thread as { id: string }).id,
      author_profile_id: (profile as { id: string }).id,
      body: `history ${String(i).padStart(2, '0')}`,
      created_at: new Date(base + i * 60_000).toISOString(),
    }))
  );
}

async function openThread(page: Page) {
  await signIn(page, OWNER);
  await page.goto('/dashboard');
  await page.getByTestId('chat-launcher').click();
  await page
    .locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_QA_A}"]`)
    .click();
  await expect(page.getByTestId('chat-thread')).toBeVisible({ timeout: 20_000 });
}

/** Counts poll requests — GETs only, so a send does not inflate the tally. */
function countPolls(page: Page): () => number {
  let n = 0;
  page.on('request', (r) => {
    if (r.method() === 'GET' && r.url().includes('/api/chat/messages') && r.url().includes('since='))
      n += 1;
  });
  return () => n;
}

test.beforeEach(async () => {
  await seedHistory();
});

test.afterAll(async () => {
  await teardownChat([PROJECT_QA_A]);
});

test.describe('§7.2 — load-older, in a browser', () => {
  test('the control appears on a LONG thread and fetches the rest', async ({ page }) => {
    await openThread(page);

    // 30 messages, panel page size 25 — so the first page is short of the
    // thread and the control must offer itself. Slice 3 asserted the opposite
    // case (absent on a one-message thread); this is the half that was missing.
    await expect(page.getByTestId('chat-load-older')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('chat-message')).toHaveCount(25);
    await expect(page.getByTestId('chat-message').filter({ hasText: 'history 00' })).toHaveCount(0);

    await page.getByTestId('chat-load-older').click();

    await expect(page.getByTestId('chat-message')).toHaveCount(TOTAL, { timeout: 20_000 });
    await expect(page.getByTestId('chat-message').filter({ hasText: 'history 00' })).toHaveCount(1);

    // A short page means the start of the thread — the control must retire
    // rather than offering a fetch that can only return nothing.
    await expect(page.getByTestId('chat-load-older')).toHaveCount(0);
  });
});

test.describe('A-C39 — the poll runs only while the thread is open', () => {
  // ⚠️ 90s, AND THE ARITHMETIC IS WHY. Playwright's default is 30s and two of
  // these tests need roughly 45: opening the thread costs ~10-15s (sign-in,
  // navigation, panel, first page), then each observation window is a FULL
  // interval plus slack — and both tests need TWO of them, one to establish the
  // poll is running and one to watch it stop.
  //
  // Written at the default, both failed as `waitForTimeout` timeouts on the
  // SECOND window, which is the half that carries the assertion: "stops dead
  // when the panel closes" and "becoming visible resumes it" never executed at
  // all. A timeout there reads exactly like a hang, and the first window's
  // assertion had already passed — so the failure looked like the build and was
  // the budget.
  //
  // The fix is the timeout and NOT a shorter POLL_MS: dropping the interval
  // would test a transport that does not ship (ND-26 rules twelve seconds).
  test.describe.configure({ timeout: 90_000 });

  test('⚠️ it polls while open, and STOPS DEAD when the panel closes', async ({ page }) => {
    const polls = countPolls(page);
    await openThread(page);

    // One interval with the thread open: the poll must fire.
    await page.waitForTimeout(POLL_MS + 3_000);
    const whileOpen = polls();
    expect(whileOpen, 'the poll never fired with a thread open').toBeGreaterThanOrEqual(1);

    // Close the panel entirely.
    await page.getByTestId('chat-launcher').click();
    await expect(page.getByTestId('chat-panel')).toHaveCount(0);
    const atClose = polls();

    // ⚠️ THE ASSERTION THAT MATTERS. A backgrounded poll costs money and shows
    // nothing wrong on screen, so this is the only place the failure is
    // observable at all.
    await page.waitForTimeout(POLL_MS + 3_000);
    expect(polls(), 'the poll kept running after the panel closed').toBe(atClose);
  });

  test('a HIDDEN document halts it, and becoming visible resumes it', async ({ page }) => {
    const polls = countPolls(page);
    await openThread(page);

    // The controller listens to `visibilitychange` and reads
    // `document.visibilityState`. Both are overridden here, because Playwright
    // cannot really background a tab it is driving.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    const atHide = polls();
    await page.waitForTimeout(POLL_MS + 3_000);
    expect(polls(), 'a hidden tab must not poll').toBe(atHide);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await page.waitForTimeout(POLL_MS + 3_000);
    expect(polls(), 'becoming visible must resume the poll').toBeGreaterThan(atHide);
  });

  test('switching project does not leave the previous thread polling', async ({ page }) => {
    // Two threads open in succession must not mean two timers. The unit suite
    // proves start() is idempotent; this proves the component tears the old one
    // down rather than mounting a second.
    const polls = countPolls(page);
    await openThread(page);
    await page.getByTestId('chat-back').click();
    await expect(page.getByTestId('chat-switcher')).toBeVisible();

    const atList = polls();
    await page.waitForTimeout(POLL_MS + 3_000);
    expect(polls(), 'the thread kept polling after returning to the list').toBe(atList);
  });
});
