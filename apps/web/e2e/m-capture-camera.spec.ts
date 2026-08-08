import { test, expect, type Page } from '@playwright/test';
import { adminClient } from './hub-fixture';

// M6M §6 — CAMERA-FIRST CAPTURE. A-20, A-20b, A-20c, A-20d, A-21, A-21b,
// A-21c, A-21c2.
//
// ---------------------------------------------------------------------------
// THE ONE THING THAT MAKES THIS SUITE DIFFERENT FROM A UI SUITE
// ---------------------------------------------------------------------------
// Almost every assertion here is about an ATTRIBUTE or an ORDER, not about
// pixels — because §6's rules are all about what happens between the tap and
// the shutter, and between the shutter and the insert:
//
//   `capture="environment"` present   → the phone opens the CAMERA (A-20)
//   the control is not a link         → nothing navigates on the tap (A-21c2)
//   the prompt renders AFTER a file   → never before (A-21)
//   no prompt when context exists     → passed through unseen (A-21b)
//
// A screenshot proves none of those. The DOM does.
//
// ⚠️ WHY THE SHUTTER IS SIMULATED. Playwright cannot open a phone camera; it
// sets files on the input. That is exactly the right seam: the browser's job is
// to honour `capture="environment"`, and the app's job is everything after a
// File exists. These tests own the second half and assert the ATTRIBUTE for the
// first, which is the only part the app controls.

const CREW = 'josh+crew@worthprop.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'FrameFocusTest!2026';
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

/** A real 8x8 PNG — `uploadFile` infers the mime from the bytes/name. */
const PNG_8 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=';

function shot(name = 'shot.png') {
  return { name, mimeType: 'image/png', buffer: Buffer.from(PNG_8, 'base64') };
}

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

// Photos created here are real `files` rows in a real bucket. Removed at the
// end, for the reason TECH_DEBT #144 exists.
test.afterAll(async () => {
  const admin = adminClient();
  const { data } = await admin
    .from('files')
    .select('id, file_path')
    .eq('project_id', PROJECT)
    .like('file_name', 'shot%');
  const paths = (data ?? []).map((f) => f.file_path).filter(Boolean) as string[];
  if (paths.length > 0) await admin.storage.from('project-files').remove(paths);
  if ((data ?? []).length > 0) {
    await admin.from('files').delete().in('id', (data ?? []).map((f) => f.id));
  }
  console.log(`[m-capture-camera cleanup] files=${(data ?? []).length}`);
});

// ===========================================================================
// A-20 / A-21c2 — the tab-bar control opens the camera and navigates NOWHERE
// ===========================================================================
test.describe('A-20 / A-21c2 · the tab-bar camera', () => {
  test('is a file input with capture="environment", not a picker', async ({ page }) => {
    await page.goto('/m/timeclock');

    const input = page.getByTestId('m-camera-input');
    await expect(input).toHaveAttribute('type', 'file');
    await expect(input).toHaveAttribute('accept', 'image/*');
    // THE ATTRIBUTE IS THE CRITERION. Without it the phone shows a source
    // picker; with it, it opens the camera. A-20 in one assertion.
    await expect(input).toHaveAttribute('capture', 'environment');
  });

  test('A-21c2 · it is NOT a link, and tapping navigates nowhere', async ({ page }) => {
    await page.goto('/m/timeclock');
    const before = page.url();

    // The control must not be an anchor — a build that routed to /m/capture
    // first would put a navigation between the tap and the camera, breaking
    // A-20's "opens the camera directly".
    const tag = await page.getByTestId('m-camera').evaluate((n) => n.tagName.toLowerCase());
    expect(tag).not.toBe('a');
    await expect(page.getByTestId('m-camera')).not.toHaveAttribute('href', /./);

    // And tapping it really does not move. (Clicking a label opens the OS file
    // dialog, which Playwright suppresses; the URL is what we assert.)
    await page.getByTestId('m-camera').click();
    expect(page.url()).toBe(before);
  });

  test('§6 · a secondary control switches to the photo library', async ({ page }) => {
    await page.goto('/m/timeclock');
    const lib = page.getByTestId('m-camera-library-input');
    await expect(lib).toHaveAttribute('accept', 'image/*');
    // The WHOLE difference between primary and secondary: no `capture`.
    await expect(lib).not.toHaveAttribute('capture', /./);
  });
});

// ===========================================================================
// A-20b — EVERY field image input is camera-first with a gallery secondary
// ===========================================================================
// "A-20 tested one of four call sites — too narrow to fail if the other three
// regress." So all four are named here explicitly.
test.describe('A-20b · every field image input, not just the tab bar', () => {
  const CASES = [
    { what: 'tab bar', url: '/m/timeclock', camera: 'm-camera-input', library: 'm-camera-library-input', open: null },
    { what: 'daily log', url: '/m/logs/new', camera: 'm-log-photo-input', library: 'm-log-photo-library', open: null },
    {
      what: 'safety incident',
      url: `/m/p/${PROJECT}/safety/new`,
      camera: 'm-incident-photo-input',
      library: 'm-incident-photo-library',
      // M-19's form is an accordion and a CLOSED row renders no children — the
      // inputs are absent from the DOM, not merely hidden. So the row has to be
      // opened before there is anything to assert on. (That the inputs are
      // unmounted rather than display:none is why this needs a click and the
      // other three do not.)
      open: 'm-incident-row-photos',
    },
  ] as const;

  for (const c of CASES) {
    test(`${c.what} opens the camera by default`, async ({ page }) => {
      await page.goto(c.url);
      if (c.open) await page.getByTestId(c.open).click();
      const cam = page.getByTestId(c.camera);
      const input = (await cam.evaluate((n) => n.tagName.toLowerCase())) === 'input'
        ? cam
        : cam.locator('input[type=file]');
      await expect(input).toHaveAttribute('capture', 'environment');
    });

    test(`${c.what} offers the gallery as the secondary control`, async ({ page }) => {
      await page.goto(c.url);
      if (c.open) await page.getByTestId(c.open).click();
      const lib = page.getByTestId(c.library);
      const input = (await lib.evaluate((n) => n.tagName.toLowerCase())) === 'input'
        ? lib
        : lib.locator('input[type=file]');
      await expect(input).toHaveAttribute('accept', 'image/*');
      await expect(input).not.toHaveAttribute('capture', /./);
    });
  }

  test('delivery damage — the fourth call site', async ({ page }) => {
    // Reached only once a line records damage, so the form has to be driven a
    // little further than the other three — an orderless check-in with one
    // damaged unit, the same path `m-capture.spec.ts` uses for A-19.
    await page.goto(`/m/p/${PROJECT}/deliveries/check-in`);
    await page.getByTestId('m-checkin-orderless').click();
    await page.getByTestId('m-checkin-vendor').fill('QA A-20b vendor');
    await page.getByTestId('m-checkin-desc').fill('QA A-20b line');
    await page.getByTestId('m-received-0-plus').click();
    await page.getByTestId('m-damaged-0-plus').click();
    await expect(page.getByTestId('m-damage-photo-strip')).toBeVisible();

    const cam = page.getByTestId('m-damage-photo-0');
    await expect(cam).toHaveAttribute('capture', 'environment');

    const lib = page.getByTestId('m-damage-photo-library-0').locator('input[type=file]');
    await expect(lib).not.toHaveAttribute('capture', /./);
  });
});

// ===========================================================================
// A-21 / A-21b — WHEN the project is asked for
// ===========================================================================
test.describe('A-21 / A-21b · the project prompt comes after the shot, or not at all', () => {
  test('A-21 · with NO project in context, the prompt appears AFTER the shutter', async ({
    page,
  }) => {
    await page.goto('/m/timeclock');

    // ⚠️ THE "BEFORE" HALF IS THE CRITERION. §6: the app asks "AFTER the shot
    // is taken, NEVER BEFORE". A build that asked first would satisfy every
    // other assertion in this file.
    await expect(page.getByTestId('m-capture-project-prompt')).toHaveCount(0);
    expect(page.url()).toContain('/m/timeclock');

    await page.getByTestId('m-camera-input').setInputFiles(shot());

    await expect(page).toHaveURL(/\/m\/capture$/, { timeout: 30_000 });
    await expect(page.getByTestId('m-capture-project-prompt')).toBeVisible();
  });

  test('A-21b · with a project in context, it files with NO prompt at all', async ({ page }) => {
    // Taken from inside a project — §6's "the route may be passed through
    // without being seen".
    await page.goto(`/m/p/${PROJECT}/punch`);
    await page.getByTestId('m-camera-input').setInputFiles(shot());

    await expect(page.getByTestId('m-capture-confirmation')).toBeVisible({ timeout: 60_000 });
    // Never asked.
    await expect(page.getByTestId('m-capture-project-prompt')).toHaveCount(0);
  });
});

// ===========================================================================
// A-20c — where the photo lands
// ===========================================================================
test.describe('A-20c · the photo lands in project-files with category photos', () => {
  test('a shot taken in context is a photos-category row on that project', async ({ page }) => {
    await page.goto(`/m/p/${PROJECT}/punch`);
    await page.getByTestId('m-camera-input').setInputFiles(shot('shot-a20c.png'));
    await expect(page.getByTestId('m-capture-confirmation')).toBeVisible({ timeout: 60_000 });

    const admin = adminClient();
    const { data } = await admin
      .from('files')
      .select('project_id, category, file_path')
      .eq('project_id', PROJECT)
      .eq('file_name', 'shot-a20c.png')
      .limit(1);

    expect(data ?? [], 'the capture wrote no files row').toHaveLength(1);
    expect(data![0].category).toBe('photos');
    // The bucket is implied by the path convention `{company_id}/...` that
    // `uploadFile` builds for `project-files`.
    expect(data![0].file_path).toBeTruthy();
  });
});

// ===========================================================================
// A-21c — the shot is HELD until a project exists
// ===========================================================================
// "A photo is never submitted without a project_id. For every non-owner/admin
// role the DB rejects a project-less insert (§7a), so the shot is held
// client-side until a project is chosen."
test.describe('A-21c · nothing is written before a project is chosen', () => {
  test('sitting on the prompt writes no files row; choosing writes exactly one', async ({
    page,
  }) => {
    await signInAs(page, CREW);
    const admin = adminClient();

    const countRows = async () => {
      const { count } = await admin
        .from('files')
        .select('id', { count: 'exact', head: true })
        .eq('file_name', 'shot-a21c.png');
      return count ?? 0;
    };

    expect(await countRows()).toBe(0);

    await page.goto('/m/timeclock');
    await page.getByTestId('m-camera-input').setInputFiles(shot('shot-a21c.png'));
    await expect(page.getByTestId('m-capture-project-prompt')).toBeVisible({ timeout: 30_000 });

    // THE ASSERTION: the shutter has fired, the screen is up, and the database
    // is still untouched. The photo exists only in the browser.
    expect(await countRows(), 'a row was written before a project was chosen').toBe(0);

    await page.getByTestId(`m-capture-project-${PROJECT}`).click();
    await page.getByTestId('m-capture-save').click();
    await expect(page.getByTestId('m-capture-confirmation')).toBeVisible({ timeout: 60_000 });

    expect(await countRows()).toBe(1);
  });
});

// ===========================================================================
// A-20d — the OFFLINE path goes through uploadFile
// ===========================================================================
// "A queued offline photo uploads through uploadFile, so a HEIC capture is
// stored as JPEG after sync." The HEIC half needs a real HEIC and a real
// conversion; what is asserted here is the half that makes it possible — the
// queue entry is a `photo` entity, whose executor calls `uploadFile`, and the
// offline user is told in the SAME confirmation.
test.describe('A-20d / §6 · offline queues, and says so in one confirmation', () => {
  test('offline, the shot is queued and the confirmation says it will upload later', async ({
    page,
    context,
  }) => {
    // THE APP IS OFFLINE; THE TRANSPORT IS NOT — the m-shell.spec.ts pattern.
    // A real `context.setOffline(true)` fails here for a reason that has
    // nothing to do with A-20d: the shutter ends in `router.push('/m/capture')`
    // and M-22 is a server component, so the navigation is an RSC fetch with no
    // service-worker route cache behind it. The claim under test is what the
    // CONFIRMATION says, and both halves of the code path key on
    // `navigator.onLine` — `capture-screen`'s `if (!navigator.onLine)` and
    // `syncOnce`'s `() => navigator.onLine` — so stubbing that flag exercises
    // the identical branch. `addInitScript`, because a full document load
    // discards anything evaluated into the previous one.
    await context.addInitScript(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    });
    await page.goto(`/m/p/${PROJECT}/punch`);

    await page.getByTestId('m-camera-input').setInputFiles(shot('shot-offline.png'));

    const confirmation = page.getByTestId('m-capture-confirmation');
    await expect(confirmation).toBeVisible({ timeout: 30_000 });

    // §6: "the user is told it will upload later — IN THE SAME CONFIRMATION,
    // not a separate alert." So the queued line must live INSIDE the
    // confirmation block, not beside it.
    await expect(confirmation.getByTestId('m-capture-queued')).toBeVisible();
    await expect(confirmation).toContainText(/upload automatically/i);

    // Left queued on purpose: draining would upload a real object and insert a
    // real `files` row on every run. The queue is this context's IndexedDB and
    // is not part of the saved storageState, so it dies with the context.
  });
});
