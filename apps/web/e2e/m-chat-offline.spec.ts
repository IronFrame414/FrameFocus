import { test, expect } from '@playwright/test';
import { teardownChat } from './chat-fixture';

// CHUNK 7 — ND-24 offline. A-C20's behavioural half, and A-C21.
//
// ⚠️ THIS IS THE FIRST TIME THE FAILURE PATH HAS EVER RENDERED. Slice 3 built
// the unsent bubble and the retry; nothing exercised them, because nothing took
// the network away. S126's ruling sweep listed it as sequence-blind — the code
// existed and no test performed the sequence a human performs.
//
// Playwright is the only harness that can: the [live] vitest config is
// `environment: 'node'` with a bare supabase-js client and cannot simulate
// offline; a unit test with fakes can prove a queue reorders but never that the
// amber strip rendered.

const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

// The retry test SUCCEEDS on purpose, so this file really does write a message.
// Without teardown it leaves rows behind and invalidates the 0/0/0/0 claim the
// chat tables have carried since slice 1 — which is exactly how the first
// version of this suite left a stray notifications row.
test.beforeAll(async () => {
  await teardownChat([PROJECT]);
});

test.afterAll(async () => {
  await teardownChat([PROJECT]);
});

async function openChat(page: import('@playwright/test').Page) {
  await page.goto(`/m/p/${PROJECT}?chat=1`);
  await expect(page.getByTestId('m-chat-overlay')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: 20_000 });
}

test.describe('ND-24 — chat fails VISIBLY, and does not queue', () => {
  test('A-C21 — a failed message is never displayed as sent', async ({ page, context }) => {
    await openChat(page);

    const body = `offline attempt ${Date.now()}`;
    await context.setOffline(true);
    await page.getByTestId('chat-composer-input').fill(body);
    await page.getByTestId('chat-send').click();

    // The failed message STAYS VISIBLE, visually distinct, with an explicit
    // retry (§7.3). It is not removed, and it is not shown as sent.
    const failed = page.getByTestId('chat-message-failed');
    await expect(failed).toHaveCount(1, { timeout: 20_000 });
    await expect(failed).toContainText(body);
    await expect(page.getByTestId('chat-retry')).toBeVisible();

    // ⚠️ AND IT IS NOT IN THE SENT LIST. This is A-C21 exactly: a build that
    // optimistically appended to `messages` would render it identically to a
    // delivered message and pass any "the text is on screen" assertion.
    await expect(page.getByTestId('chat-message').filter({ hasText: body })).toHaveCount(0);

    await context.setOffline(false);
  });

  test('A-C20 — the send is NOT enqueued to the M6M offline queue', async ({ page, context }) => {
    await openChat(page);

    await context.setOffline(true);
    await page.getByTestId('chat-composer-input').fill(`not queued ${Date.now()}`);
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-message-failed')).toHaveCount(1, { timeout: 20_000 });

    // The queue is IndexedDB-backed. Reading it directly is the only way to
    // assert non-enrolment: an error on screen proves the send failed, not that
    // nothing was queued, and A-C20 is specifically about the absence of
    // enrolment — "a build that 'helpfully' reuses the queue fails".
    const queued = await page.evaluate(async () => {
      const dbs = await (indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string }>> })
        .databases?.();
      if (!dbs) return { checked: false, names: [] as string[], rows: -1 };
      const names = dbs.map((d) => d.name ?? '').filter(Boolean);
      let rows = 0;
      for (const name of names) {
        rows += await new Promise<number>((resolve) => {
          const req = indexedDB.open(name);
          req.onerror = () => resolve(0);
          req.onsuccess = () => {
            const db = req.result;
            let total = 0;
            const stores = Array.from(db.objectStoreNames);
            if (stores.length === 0) {
              db.close();
              resolve(0);
              return;
            }
            const tx = db.transaction(stores, 'readonly');
            let pending = stores.length;
            for (const store of stores) {
              const countReq = tx.objectStore(store).count();
              countReq.onsuccess = () => {
                total += countReq.result;
                if (--pending === 0) {
                  db.close();
                  resolve(total);
                }
              };
              countReq.onerror = () => {
                if (--pending === 0) {
                  db.close();
                  resolve(total);
                }
              };
            }
          };
        });
      }
      return { checked: true, names, rows };
    });

    // If the browser cannot enumerate databases the test would pass vacuously,
    // so that case is failed rather than skipped.
    expect(queued.checked, 'indexedDB.databases() unavailable — assertion would be vacuous').toBe(
      true
    );
    expect(queued.rows, `offline stores hold rows: ${queued.names.join(', ')}`).toBe(0);

    await context.setOffline(false);
  });

  test('retry succeeds once the network is back', async ({ page, context }) => {
    await openChat(page);

    const body = `retried ${Date.now()}`;
    await context.setOffline(true);
    await page.getByTestId('chat-composer-input').fill(body);
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-retry')).toBeVisible({ timeout: 20_000 });

    await context.setOffline(false);
    await page.getByTestId('chat-retry').click();

    // Now it IS sent — the failed bubble is gone and a real message exists.
    await expect(page.getByTestId('chat-message').filter({ hasText: body })).toHaveCount(1, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('chat-message-failed')).toHaveCount(0);
  });
});
