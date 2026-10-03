import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S127 item 4b — the desktop single view (A-2 … A-5).
//   A-2  a tile opens VIEW mode; markup is a button.
//   A-3  the photo is fitted to the viewport HEIGHT.
//   A-4  date, time and who took it (the /m formatter).
//   A-5  previous / next and the arrow keys — WITHOUT re-running the server
//        page per photo: counted as zero RSC requests while moving.

const OWNER = 'josh+test50@worthprop.com';
const BUCKET = 'project-files';
const RUN = `s127-view-${Date.now()}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const admin = adminClient();
let projectId = '';
const seeded: { id: string; path: string }[] = [];

test.beforeAll(async () => {
  const { data: asg, error } = await admin
    .from('project_assignments')
    .select('project_id, created_at, projects!inner(is_deleted, company_id)')
    .eq('member_id', CREW_MEMBER)
    .eq('is_deleted', false)
    .eq('projects.is_deleted', false)
    .eq('projects.company_id', COMPANY_A)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !asg) throw new Error(`no project: ${error?.message}`);
  projectId = asg.project_id as string;
  const { data: owner } = await admin
    .from('profiles')
    .select('user_id')
    .eq('email', OWNER)
    .single();
  for (const name of ['a', 'b', 'c']) {
    const path = `${COMPANY_A}/${projectId}/${RUN}-${name}.png`;
    const up = await admin.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' });
    if (up.error) throw new Error(up.error.message);
    const { data, error: e } = await admin
      .from('files')
      .insert({
        company_id: COMPANY_A,
        project_id: projectId,
        category: 'photos',
        file_name: `${RUN}-${name}.png`,
        file_path: path,
        file_size: PNG.length,
        mime_type: 'image/png',
        created_by: owner!.user_id,
      })
      .select('id')
      .single();
    if (e || !data) throw new Error(e?.message);
    seeded.push({ id: data.id as string, path });
  }
});

test.afterAll(async () => {
  if (!seeded.length) return;
  await admin
    .from('files')
    .delete()
    .in(
      'id',
      seeded.map((s) => s.id)
    );
  await admin.storage.from(BUCKET).remove(seeded.map((s) => s.path));
});

test('tile → view mode; fitted to height; taken + by; prev/next + arrows without a server re-render', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signInAs(page, OWNER);
  await page.goto(`/dashboard/projects/${projectId}/photos`);
  const first = seeded[1];
  await page.locator(`a[href$="/photos/${first.id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/photos/${first.id}$`));

  const view = page.getByTestId('photo-view');
  await expect(view).toHaveAttribute('data-file-id', first.id);
  await expect(page.getByTestId('photo-view-markup')).toHaveAttribute(
    'href',
    `/dashboard/projects/${projectId}/files/${first.id}/markup?from=photos`
  );
  // A-3: fitted to the viewport HEIGHT. The browser normalises the calc() it
  // reports (CI run 37116585932 received "calc(-240px + 100vh)"), so the two
  // terms are asserted, not the spelling. _Superseded, quoted:_
  // `expect(maxH).toBe('calc(100vh - 240px)');`
  const maxH = await page
    .getByTestId('photo-view-image')
    .evaluate((el) => (el as HTMLElement).style.maxHeight.replace(/\s+/g, ''));
  expect(maxH).toMatch(/^calc\(/);
  expect(maxH).toContain('100vh');
  expect(maxH).toContain('-240px');
  await expect(page.getByTestId('photo-view-taken')).not.toHaveText('—');
  await expect(page.getByTestId('photo-view-by')).not.toHaveText('—');

  let rsc = 0;
  const rscUrls: string[] = [];
  page.on('request', (r) => {
    if (r.headers()['rsc'] === '1') {
      rsc += 1;
      rscUrls.push(`${r.url()} prefetch=${r.headers()['next-router-prefetch'] ?? '-'}`);
    }
  });
  const startId = await view.getAttribute('data-file-id');
  await page.getByTestId('photo-view-next').click();
  const afterNext = await view.getAttribute('data-file-id');
  expect(afterNext).not.toBe(startId);
  await expect(page).toHaveURL(new RegExp(`/photos/${afterNext}$`));
  await page.keyboard.press('ArrowLeft');
  await expect(view).toHaveAttribute('data-file-id', startId!);
  await page.keyboard.press('ArrowRight');
  await expect(view).toHaveAttribute('data-file-id', afterNext!);
  expect(rsc, `moving between photos must not re-run the server page: ${rscUrls.join(' | ')}`).toBe(
    0
  );
});
