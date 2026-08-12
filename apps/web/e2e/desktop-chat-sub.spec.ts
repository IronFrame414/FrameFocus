import { test, expect, type Page } from '@playwright/test';
import { OWNER, CREW, PROJECT_QA_A, signIn, teardownChat } from './chat-fixture';

// CHUNK 5 — the SUB THREAD on desktop. A-C2, A-C7, §7.1e, §7.4.
//
// ⚠️ THE PREDICTION BELOW CAME TRUE. Kept, because it is the record of a gap
// being called before it was closed rather than after.
//
// _Original, quoted rather than rewritten:_ "A SUBCONTRACTOR SIGNING INTO
// /dashboard IS OBSERVABLE ONLY BECAUSE `DASHBOARD_ROLES` IS ENFORCED NOWHERE.
// The constant exists in packages/shared/constants/roles.ts and excludes
// subcontractor and client, and a repo-wide grep finds no code consulting it.
// That is a pre-existing gap recorded by S126's sweep, not something this slice
// introduced — and it is why the sub's real surface is mobile (A-C50 links
// there). **If the gate is ever enforced, the last test in this file is the one
// that will start failing, and its failure will be correct.**"
//
// Ruling A [Josh, S131] enforced it. The last test is gone from this file and
// lives at `m-chat-sub.spec.ts` — see the note where it used to be. What
// remains here drives CREW and OWNER, who still reach the dashboard, so this
// file is still chunk 5 and still covers §7.1e's segment rules.
/** kitchen test — no assigned sub with a profile. ND-25's negative. */
const PROJECT_NO_SUB = '6c395b31-cd45-4683-bb6a-cc4895488692';

test.beforeAll(async () => {
  await teardownChat([PROJECT_QA_A, PROJECT_NO_SUB]);
});

test.afterAll(async () => {
  await teardownChat([PROJECT_QA_A, PROJECT_NO_SUB]);
});

async function openProject(page: Page, projectId: string) {
  await page.getByTestId('chat-launcher').click();
  await page
    .locator(`[data-testid="chat-switcher-project"][data-project-id="${projectId}"]`)
    .click();
}

test.describe('§7.1e / A-C2 — the segmented control', () => {
  test('a project WITH a profiled sub renders two segments', async ({ page }) => {
    await signIn(page, CREW);
    await page.goto('/dashboard');
    await openProject(page, PROJECT_QA_A);

    await expect(page.getByTestId('chat-thread-segments')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('chat-segment-crew')).toBeVisible();
    await expect(page.getByTestId('chat-segment-sub')).toBeVisible();
  });

  test('⚠️ a project WITHOUT one renders NO control at all — not a disabled segment', async ({
    page,
  }) => {
    // A-C2's trailing clause, and the half that makes it able to fail: the two
    // arms must hold IN THE SAME BUILD. A chat that forgot sub threads entirely
    // would pass the negative alone.
    await signIn(page, OWNER);
    await page.goto('/dashboard');
    await openProject(page, PROJECT_NO_SUB);

    await expect(page.getByTestId('chat-thread')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('chat-thread-segments')).toHaveCount(0);
    await expect(page.getByTestId('chat-segment-sub')).toHaveCount(0);
  });
});

test.describe('§7.4 / A-C7 — crew read the sub thread and cannot post', () => {
  test('the composer is ABSENT FROM THE DOM, and a banner explains why', async ({ page }) => {
    await signIn(page, CREW);
    await page.goto('/dashboard');
    await openProject(page, PROJECT_QA_A);

    // Crew thread first: the composer IS there, so the assertion below is about
    // this thread rather than about a composer that never renders anywhere.
    await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('chat-segment-sub').click();

    // M6M D-54 — a hidden button is not a permission. `toHaveCount(0)` and not
    // `not.toBeVisible()`: a disabled or CSS-hidden composer would pass the
    // latter and fail the criterion.
    await expect(page.getByTestId('chat-readonly-banner')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('chat-composer-input')).toHaveCount(0);
    await expect(page.getByTestId('chat-send')).toHaveCount(0);
    await expect(page.getByTestId('chat-mention-button')).toHaveCount(0);

    const banner = await page.getByTestId('chat-readonly-banner').innerText();
    // §7.4's three requirements: say they cannot post, say WHY, and do not
    // scold. The "why" is the one a build drops — a crew member who does not
    // know the sub audience is the reason will file it as a bug.
    expect(banner.toLowerCase()).toContain('read-only');
    expect(banner.toLowerCase()).toContain('subcontractor');
  });

  test('and they can still READ what is in it', async ({ page }) => {
    // Post as the Owner first, so there is something for crew to fail to
    // interact with but succeed in seeing.
    await signIn(page, OWNER);
    await page.goto('/dashboard');
    await openProject(page, PROJECT_QA_A);
    await page.getByTestId('chat-segment-sub').click();
    const body = `owner to subs ${Date.now()}`;
    await page.getByTestId('chat-composer-input').fill(body);
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-message').filter({ hasText: body })).toHaveCount(1, {
      timeout: 20_000,
    });

    await signIn(page, CREW);
    await page.goto('/dashboard');
    await openProject(page, PROJECT_QA_A);
    await page.getByTestId('chat-segment-sub').click();
    await expect(page.getByTestId('chat-message').filter({ hasText: body })).toHaveCount(1, {
      timeout: 20_000,
    });
  });
});

// ---------------------------------------------------------------------------
// ⚠️ MOVED TO `m-chat-sub.spec.ts` [RULING A, S131] — NOT DELETED.
// ---------------------------------------------------------------------------
// `the subcontractor identity › sees the SUB thread only` lived here and signed
// in as the sub at `/dashboard`. **It could only ever run because of the bug
// this file's own header describes** — `DASHBOARD_ROLES` excluded
// `subcontractor` and nothing enforced it. Ruling A enforces it, so the sub is
// now redirected to `/m/projects` and the test would fail. That failure is
// CORRECT, and it was anticipated when the ruling was made.
//
// The assertions were never about the dashboard — they are about the sub
// THREAD: two assigned projects and no others, no segment control because one
// segment is not a control (§7.1e), and a composer that works. All of it moved
// to `/m`, which is where subs actually live, so slice 4's completion condition
// survives the routing fix intact.
//
// Everything ABOVE this line is unchanged: those tests drive crew and owner,
// both of which still reach the dashboard.
