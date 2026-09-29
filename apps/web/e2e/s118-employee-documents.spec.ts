import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S118 item 16 — employee documents on the screens. The database rules are
// proved per role in test/s118-employee-documents.live.ts; this spec proves
// the SURFACES: the Owner/Admin notice (not dismissible) and the upload through
// the shared queue on desktop, the employee's own read on /m (PARITY: /m is
// required), a PM refused the page, and the project Files/Photos pages
// showing none of it. Every outcome is counted with the service role.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const BUCKET = 'employee-documents';
const RUN = `S118E-${Date.now()}`;
const admin = adminClient();

const who = { crewProfile: '', crewMember: '', foremanMember: '', ownerUser: '' };
const seeded: { id: string; path: string }[] = [];

async function memberFor(email: string) {
  const { data: p } = await admin
    .from('profiles')
    .select('id, user_id')
    .eq('email', email)
    .single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', p!.id)
    .single();
  return { profileId: p!.id as string, userId: p!.user_id as string, memberId: m!.id as string };
}

async function seedDoc(memberId: string, name: string) {
  const path = `${COMPANY_A}/${memberId}/${RUN}-${name}`;
  const up = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from('%PDF-1.4 e2e'), { contentType: 'application/pdf' });
  if (up.error) throw new Error(`seed object: ${up.error.message}`);
  const { data, error } = await admin
    .from('employee_documents')
    .insert({
      company_id: COMPANY_A,
      member_id: memberId,
      file_name: `${RUN} ${name}`,
      file_path: path,
      file_size: 12,
      mime_type: 'application/pdf',
      created_by: who.ownerUser,
      updated_by: who.ownerUser,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed row: ${error.message}`);
  seeded.push({ id: data!.id as string, path });
}

async function countRun(memberId: string): Promise<number> {
  const { count } = await admin
    .from('employee_documents')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
    .like('file_name', `${RUN}%`);
  return count ?? 0;
}

test.beforeAll(async () => {
  const crew = await memberFor(CREW);
  const foreman = await memberFor(FOREMAN);
  const owner = await memberFor(OWNER);
  who.crewProfile = crew.profileId;
  who.crewMember = crew.memberId;
  who.foremanMember = foreman.memberId;
  who.ownerUser = owner.userId;
  await seedDoc(who.crewMember, 'crew-handbook.pdf');
  await seedDoc(who.foremanMember, 'foreman-handbook.pdf');
});

test.afterAll(async () => {
  const { data } = await admin
    .from('employee_documents')
    .select('id, file_path')
    .like('file_name', `${RUN}%`);
  const rows = (data ?? []) as { id: string; file_path: string }[];
  if (rows.length) {
    await admin.storage.from(BUCKET).remove(rows.map((r) => r.file_path));
    await admin
      .from('employee_documents')
      .delete()
      .in(
        'id',
        rows.map((r) => r.id)
      );
  }
  const { count } = await admin
    .from('employee_documents')
    .select('id', { count: 'exact', head: true })
    .like('file_name', `${RUN}%`);
  expect(count, 'employee-document fixtures left behind').toBe(0);
});

test.describe('S118 item 16 · employee documents', () => {
  test.setTimeout(150_000);

  test('Owner: the notice sits at the top, cannot be dismissed, and 2 files upload through the shared queue', async ({
    page,
  }) => {
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/team/${who.crewProfile}/documents`);
    const notice = page.getByTestId('employee-docs-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('can see everything filed here');
    // Not dismissible: no control inside the notice.
    await expect(notice.locator('button, a, [role="button"]')).toHaveCount(0);
    // At the TOP of the upload area: the notice precedes the upload control in the panel.
    const order = await page.getByTestId('employee-docs').evaluate((panel) => {
      const n = panel.querySelector('[data-testid="employee-docs-notice"]')!;
      const a = panel.querySelector('[data-testid="employee-docs-add"]')!;
      return Boolean(n.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order, 'the notice must come before the upload control').toBe(true);

    const before = await countRun(who.crewMember);
    await page.getByTestId('employee-docs-input').setInputFiles([
      { name: `${RUN}-a.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF a') },
      { name: `${RUN}-b.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF b') },
    ]);
    await expect.poll(() => countRun(who.crewMember), { timeout: 30_000 }).toBe(before + 2);
    await expect(
      page.getByTestId('employee-doc').filter({ hasText: `${RUN}-a.pdf` })
    ).toBeVisible();
    // Objects landed in the private bucket under THIS person.
    const { data: objs } = await admin.storage
      .from(BUCKET)
      .list(`${COMPANY_A}/${who.crewMember}`, { search: `${RUN}-` });
    expect((objs ?? []).filter((o) => /-a\.pdf$|-b\.pdf$/.test(o.name))).toHaveLength(2);
  });

  test('a PM is refused the documents page (redirected away, nothing rendered)', async ({
    page,
  }) => {
    await signInAs(page, PM);
    await page.goto(`/dashboard/team/${who.crewProfile}/documents`);
    await expect(page).not.toHaveURL(/\/documents$/);
    await expect(page.getByTestId('employee-docs')).toHaveCount(0);
  });

  test("/m — the employee reads their OWN documents on the phone, and ZERO of a coworker's", async ({
    page,
  }) => {
    await signInAs(page, CREW);
    await page.goto('/m/account');
    const mine = page.getByTestId('my-doc');
    await expect(mine.filter({ hasText: `${RUN} crew-handbook.pdf` })).toBeVisible();
    await expect(page.getByTestId('my-docs')).not.toContainText('foreman-handbook');
  });

  test('project Files and Photos pages never list an employee document', async ({ page }) => {
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('company_id', COMPANY_A)
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    await signInAs(page, OWNER);
    for (const tab of ['files', 'photos']) {
      await page.goto(`/dashboard/projects/${project!.id}/${tab}`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText(RUN);
    }
  });
});
