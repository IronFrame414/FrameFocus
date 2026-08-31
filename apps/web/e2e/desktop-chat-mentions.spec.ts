import { test, expect, type Page } from '@playwright/test';
import { OWNER, PROJECT_QA_A, signIn, teardownChat } from './chat-fixture';

// CHUNK 4 of 4 — the `@` affordance and the mention picker. §5.1, §7.5, A-C10.
//
// The postable set for QA A's CREW thread, derived from the live roster and
// project_assignments rather than assumed:
//
//   Dave Whitfield  owner          by role      <- the viewer, so self-excluded
//   QA Admin A    admin            by role
//   Casey Crew    crew_member      assigned
//   QA Foreman A  foreman          assigned
//   Pat Manager   project_manager  assigned
//   QA Sub A      subcontractor    EXCLUDED — never in a crew thread (ND-19)
//   QA Client A   client           EXCLUDED — no chat at all (ND-27)

test.beforeAll(async () => {
  await teardownChat([PROJECT_QA_A]);
});

test.afterAll(async () => {
  await teardownChat([PROJECT_QA_A]);
});

async function openThread(page: Page) {
  await signIn(page, OWNER);
  await page.goto('/dashboard');
  await page.getByTestId('chat-launcher').click();
  await page
    .locator(`[data-testid="chat-switcher-project"][data-project-id="${PROJECT_QA_A}"]`)
    .click();
  await expect(page.getByTestId('chat-thread')).toBeVisible({ timeout: 20_000 });
}

test.describe('§5.1 — the `@` affordance', () => {
  test('the Mention button is visible next to Send, not hidden behind a shortcut', async ({
    page,
  }) => {
    await openThread(page);

    const mention = page.getByTestId('chat-mention-button');
    const send = page.getByTestId('chat-send');
    await expect(mention).toBeVisible();
    await expect(send).toBeVisible();

    // "Prominent, not a hidden keyboard shortcut" is a geometry claim, so it is
    // asserted as one: a real labelled control, on the same row as Send. The
    // whole delivery guarantee of chat rests on someone noticing this button.
    const m = await mention.boundingBox();
    const s = await send.boundingBox();
    expect(m).not.toBeNull();
    expect(s).not.toBeNull();
    expect(m!.width).toBeGreaterThan(60);
    expect(m!.height).toBeGreaterThan(28);
    expect(Math.abs(m!.y - s!.y)).toBeLessThan(12);

    await expect(page.getByTestId('chat-mention-hint')).toContainText('Only');
    await expect(page.getByTestId('chat-mention-hint')).toContainText('notify');
  });

  test('the button opens the picker over the POSTABLE set', async ({ page }) => {
    await openThread(page);
    await page.getByTestId('chat-mention-button').click();

    const picker = page.getByTestId('chat-mention-picker');
    await expect(picker).toBeVisible();

    const options = page.getByTestId('chat-mention-option');
    await expect(options).toHaveCount(4, { timeout: 20_000 });

    const text = await picker.innerText();
    expect(text).toContain('Casey Crew');
    expect(text).toContain('Pat Manager');
    expect(text).toContain('QA Admin A');
    expect(text).toContain('QA Foreman A');

    // A-C10's shape on the crew thread: a subcontractor is never postable here,
    // and neither is a client. Offering either would produce a notification for
    // a message its recipient cannot read.
    expect(text).not.toContain('QA Sub A');
    expect(text).not.toContain('QA Client A');
    // §5.1 — self-mention notifies nobody, so the viewer is not offered.
    // The viewer is the owner (josh+test50), whose profile name is 'Dave Whitfield'
    // [S176 fixture rename]. Assert the CURRENT name, or self-exclusion passes
    // vacuously against a name the fixture no longer has (S157).
    expect(text).not.toContain('Dave Whitfield');
  });

  test('typing `@` opens the picker and filters as you type', async ({ page }) => {
    await openThread(page);

    const input = page.getByTestId('chat-composer-input');
    await input.click();
    await input.type('morning @');
    await expect(page.getByTestId('chat-mention-picker')).toBeVisible();

    await input.type('cas');
    await expect(page.getByTestId('chat-mention-option')).toHaveCount(1);
    await expect(page.getByTestId('chat-mention-option').first()).toContainText('Casey Crew');
  });

  test('choosing someone inserts a token the parser can read back', async ({ page }) => {
    await openThread(page);

    const input = page.getByTestId('chat-composer-input');
    await input.click();
    await input.type('can you check this @');
    await page.getByTestId('chat-mention-option').filter({ hasText: 'Casey Crew' }).click();

    // `casey` — the short unambiguous form, not `Casey Crew` and not a
    // display name. What the picker inserts must be what the parser resolves.
    await expect(input).toHaveValue('can you check this @casey ');
  });

  test('⚠️ typing CONTINUES after the inserted token', async ({ page }) => {
    await openThread(page);

    const input = page.getByTestId('chat-composer-input');
    await input.click();
    await input.type('on it — @');
    await page.getByTestId('chat-mention-option').filter({ hasText: 'Casey Crew' }).click();
    await input.type('can you count what is left?');

    // This is the assertion the previous version of this file did not have, and
    // the defect it would have caught was real: the caret was restored in a
    // requestAnimationFrame, so the FIRST character typed after choosing a name
    // landed at index 0 and the rest landed after the token —
    //     "con it — @caseyan you count what is left?"
    // Every other mention test passed, because none of them typed afterwards.
    // It was found by screenshotting the panel and reading it.
    await expect(input).toHaveValue('on it — @casey can you count what is left?');
  });

  test('a mention sends, and the composer reports nothing unresolved', async ({ page }) => {
    await openThread(page);

    const input = page.getByTestId('chat-composer-input');
    await input.click();
    await input.type('@');
    await page.getByTestId('chat-mention-option').filter({ hasText: 'Pat Manager' }).click();
    await input.type('please review the framing');
    await page.getByTestId('chat-send').click();

    await expect(
      page.getByTestId('chat-message').filter({ hasText: 'please review the framing' })
    ).toHaveCount(1, { timeout: 20_000 });

    // The notice only appears for tokens that matched nobody. Its ABSENCE here
    // is what says the inserted token actually resolved — a picker that
    // inserted a display name would send fine and silently notify no one.
    await expect(page.getByTestId('chat-composer-notice')).toHaveCount(0);
  });
});
