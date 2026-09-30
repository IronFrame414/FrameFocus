import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S118 item 11 — the material sign-out, on BOTH surfaces (PARITY), through the
// SHARED upload queue (runUploadBatch + UploadBatchList — its own surface
// proof, #2-s180u):
//
//   /m (crew)    fills sections 1–4, WP-signs; the record waits for photos —
//                ⚠️ no receiver-signature control exists until a release photo
//                does (no skip); 2 release photos through the queue; the
//                receiving party signs on this device → OPEN, acknowledgement
//                shown, PDF generated.
//   /m (crew)    the Field hub's Sign-outs tile badges it; the field adds a
//                return photo but has NO close control.
//   desktop      overdue shows on the list and on the Field landing strip; the
//   (owner)      owner records the return (damage occurred) → damaged_on_return,
//                both photo sets side by side, a new PDF.
// Every outcome is read back with the service role.
//
// ⚠️ [S121 Part 3, RULED Josh 2026-09-30] THE /m FLOW IS REWRITTEN IN PLACE.
// Page 1 now carries the WHOLE release: a job PICKER over open assigned jobs;
// no "Vehicle / unit #", no "Your title"; the employee signs AS THEMSELVES
// (name locked — the DB trigger is the rule); ONE required release photo; the
// receiving party signs DIRECTLY UNDER; one Save → open. The return records
// two photos + where it was put. Superseded steps are quoted where they were.

const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const RUN = `S118SO-${Date.now()}`;
const admin = adminClient();
let projectId = '';
let signoutId = '';

// A real 1×1 PNG, so the image pipeline and the PDF embed see a decodable image.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });

async function record() {
  const { data } = await admin.from('material_signouts').select('*').eq('id', signoutId).single();
  return data as Record<string, unknown>;
}

/** [S121 3-C] The release signature: the name is LOCKED to the signer. */
async function signLocked(page: Page, prefix: string) {
  await page.getByTestId(`${prefix}-consent`).check();
  await page.getByTestId(`${prefix}-submit`).click();
}

async function typeSignature(page: Page, prefix: string, name: string) {
  await page.getByTestId(`${prefix}-name`).fill(name);
  await page.getByTestId(`${prefix}-typed`).fill(name);
  await page.getByTestId(`${prefix}-consent`).check();
  await page.getByTestId(`${prefix}-submit`).click();
}

test.beforeAll(async () => {
  const { data: asg, error } = await admin
    .from('project_assignments')
    .select('project_id, created_at, projects!inner(is_deleted, company_id, status)')
    .eq('member_id', CREW_MEMBER)
    .eq('is_deleted', false)
    .eq('projects.is_deleted', false)
    .eq('projects.company_id', COMPANY_A)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error || !asg) throw new Error(`no Company A project assigned to crew: ${error?.message}`);
  projectId = asg.project_id as string;
});

test.afterAll(async () => {
  const { data } = await admin
    .from('material_signouts')
    .select('id, pdf_file_id')
    .like('material_type', `${RUN}%`);
  for (const s of (data ?? []) as { id: string; pdf_file_id: string | null }[]) {
    const { data: ph } = await admin.from('material_signout_photos').select('file_id').eq('signout_id', s.id);
    const fileIds = [...(ph ?? []).map((p) => p.file_id as string), ...(s.pdf_file_id ? [s.pdf_file_id] : [])];
    await admin.from('material_signout_photos').delete().eq('signout_id', s.id);
    await admin.from('material_signouts').delete().eq('id', s.id);
    if (fileIds.length) {
      const { data: fs } = await admin.from('files').select('file_path').in('id', fileIds);
      const paths = (fs ?? []).map((f) => f.file_path as string);
      if (paths.length) await admin.storage.from('project-files').remove(paths);
      await admin.from('files').delete().in('id', fileIds);
    }
  }
  const { count } = await admin
    .from('material_signouts')
    .select('id', { count: 'exact', head: true })
    .like('material_type', `${RUN}%`);
  expect(count, 'sign-out fixtures left behind').toBe(0);
});

test.describe.serial('S118 item 11 · the material sign-out, both surfaces', () => {
  test.setTimeout(180_000);

  test('/m — crew signs material out: photos first (no skip), then the receiver signs on the phone', async ({
    page,
  }) => {
    await signInAs(page, CREW);
    await page.goto(`/m/p/${projectId}/signouts`);
    await page.getByTestId('signout-new').click();
    await page.waitForURL(/\/signouts\/new$/);

    // [S121 3-A] The job is a picker, defaulted to the project it was opened
    // from, offering EXACTLY the crew member's assigned open jobs.
    const job = page.getByTestId('so-job');
    await expect(job).toHaveValue(projectId);
    const offered = (await job.locator('option').evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).value).filter(Boolean)
    )).sort();
    const { data: asg } = await admin
      .from('project_assignments')
      .select('project_id, projects!inner(status, is_deleted, company_id)')
      .eq('member_id', CREW_MEMBER)
      .eq('is_deleted', false)
      .eq('projects.is_deleted', false)
      .eq('projects.company_id', COMPANY_A)
      .in('projects.status', ['active', 'on_hold']);
    const expected = [...new Set((asg ?? []).map((a) => a.project_id as string))].sort();
    expect(expected.length, 'non-vacuous: the crew member has open jobs').toBeGreaterThan(0);
    expect(offered).toEqual(expected);
    // _Superseded [S118]:_ a free-text "Project / job name" (so-job-name).
    await expect(page.getByTestId('so-job-name')).toHaveCount(0);
    // [S121 3-B / 3-C] Removed from the form.
    await expect(page.getByTestId('so-receiver-vehicle')).toHaveCount(0);
    await expect(page.getByTestId('so-released-title')).toHaveCount(0);

    await page.getByTestId('so-material').fill(`${RUN} porcelain tile`);
    await page.getByTestId('so-quantity').fill('14 boxes');
    await page.getByTestId('so-expected-return').fill('2026-10-06');
    await page.getByTestId('so-receiver-company').fill('Acme Tile Co');
    await page.getByTestId('so-receiver-driver').fill('Pat Driver');
    await page.getByTestId('so-cond-minor_damage').check();

    // Each missing piece is named, in page order.
    await page.getByTestId('so-save').click();
    await expect(page.getByTestId('so-error')).toHaveText('Sign as the person releasing the material.');

    // [S121 3-C] The employee signs AS THEMSELVES: the name is fixed.
    const { data: crewProfile } = await admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('email', CREW)
      .single();
    const crewName = [crewProfile!.first_name, crewProfile!.last_name].filter(Boolean).join(' ');
    await page.getByTestId('so-sign-release').click();
    const nameInput = page.getByTestId('so-release-sig-name');
    await expect(nameInput).toHaveValue(crewName);
    await expect(nameInput).toHaveAttribute('readonly', '');
    await expect(page.getByTestId('so-release-sig-typed')).toHaveAttribute('readonly', '');
    // Both name fields stay 16px (S120 5-A).
    expect(await nameInput.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    await signLocked(page, 'so-release-sig');
    await expect(page.getByTestId('so-release-signed')).toContainText(crewName);

    await page.getByTestId('so-save').click();
    await expect(page.getByTestId('so-error')).toHaveText('Add a photo of the material going out.');
    await page
      .getByTestId('so-release-photo-library')
      .setInputFiles([png(`${RUN}-r1.png`), png(`${RUN}-r2.png`)]);
    await expect(page.getByTestId('so-release-photo-count')).toHaveText('2 photo(s) added');

    await page.getByTestId('so-save').click();
    await expect(page.getByTestId('so-error')).toHaveText('The receiving party must sign.');

    // [S121 3-E] The receiving party signs on PAGE 1, directly under.
    // _Superseded [S118]:_ "⚠️ No release photo yet → the receiver's control
    // does not exist at all" on the RECORD page (so-photo-first), then
    // so-release-input, then so-receiver-open on the record page.
    await page.getByTestId('so-receiver-open').click();
    await page.getByTestId('so-receiver-title').fill('Driver / Acme Tile Co');
    await expect(page.getByTestId('so-receipt-sig-consent-text')).toHaveText(
      'By signing above, the receiving party acknowledges responsibility for the listed material while in their possession and agrees to return it in the same or better condition.'
    );
    await typeSignature(page, 'so-receipt-sig', 'Pat Driver');
    await expect(page.getByTestId('so-receipt-signed')).toContainText('Pat Driver');
    await page.getByTestId('so-save').click();

    await page.waitForURL(/\/signouts\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    signoutId = page.url().split('/').pop()!;
    await expect(page.getByTestId('so-status')).toHaveAttribute('data-status', 'open', { timeout: 30_000 });
    await expect(page.getByTestId('so-ack')).toBeVisible();
    await expect(page.getByTestId('so-photos-release-photo')).toHaveCount(2);
    const r = await record();
    expect(r).toMatchObject({
      status: 'open',
      project_id: projectId,
      condition_at_release: 'minor_damage',
      released_signer_name: crewName,
      released_signature_type: 'type',
      receiver_signer_name: 'Pat Driver',
      receiver_title: 'Driver / Acme Tile Co',
      receiver_vehicle: null,
      released_title: null,
    });
    const { data: rel } = await admin
      .from('material_signout_photos')
      .select('stage, file:files!material_signout_photos_file_id_fkey(category)')
      .eq('signout_id', signoutId);
    expect(rel).toHaveLength(2);
    for (const ph of rel as unknown as { stage: string; file: { category: string } }[]) {
      expect(ph.stage).toBe('release');
      expect(ph.file.category, 'category, never MIME').toBe('material_signout');
    }
    await expect.poll(async () => (await record()).pdf_file_id, { timeout: 30_000 }).not.toBeNull();
  });

  test('/m — the Field tile badges it; the field adds a RETURN photo and has no close control', async ({
    page,
  }) => {
    await signInAs(page, CREW);
    await page.goto(`/m/field?project=${projectId}`);
    const tile = page.getByTestId('m-field-tile-signouts');
    await expect(tile).toHaveAttribute('href', `/m/p/${projectId}/signouts`);
    await expect(tile).not.toHaveText(/^\s*Sign-outs\s*$/); // a badge is rendered
    await tile.click();
    await expect(page.locator(`[data-testid="signout-row"][href$="${signoutId}"]`)).toHaveAttribute('data-status', 'open');
    await page.goto(`/m/p/${projectId}/signouts/${signoutId}`);
    await expect(page.getByTestId('so-release-input')).toHaveCount(0); // the release set is frozen
    await page.getByTestId('so-return-input').setInputFiles([png(`${RUN}-ret1.png`)]);
    await expect(page.getByTestId('so-photos-return-photo')).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId('so-close-open')).toHaveCount(0);
  });

  test('desktop — overdue surfaces on the list and the Field landing; the owner records the return', async ({
    page,
  }) => {
    // Make it overdue (the rule is derived from the date, never stored).
    await admin.from('material_signouts').update({ expected_return_date: '2026-01-02' }).eq('id', signoutId);
    await signInAs(page, OWNER);
    await page.goto(`/dashboard/field-ops/${projectId}/daily-logs`);
    await expect(page.getByTestId('signout-attention')).toBeVisible();
    await page.goto(`/dashboard/field-ops/${projectId}/signouts`);
    const row = page.locator(`[data-testid="signout-row"][href$="${signoutId}"]`);
    await expect(row).toHaveAttribute('data-overdue', 'true');
    await row.click();
    await page.waitForURL(new RegExp(`/signouts/${signoutId}$`));
    await expect(page.getByTestId('so-overdue')).toBeVisible();
    await expect(page.getByTestId('so-photos-release-photo')).toHaveCount(2);
    await expect(page.getByTestId('so-photos-return-photo')).toHaveCount(1);
    const firstPdf = (await record()).pdf_file_id;

    await page.getByTestId('so-close-open').click();
    await page.getByTestId('so-ret-time').fill('15:45');
    await page.getByTestId('so-ret-damage_occurred').check();
    await page.getByTestId('so-ret-notes').fill('Two boxes crushed');
    // [S121 3-D + 3-F] Came back → the evidence step. The crew's return photo
    // is the MATERIAL photo; the location photo and the note are still owed,
    // and the close says exactly which is missing.
    await expect(page.getByTestId('so-ret-evidence')).toBeVisible();
    await typeSignature(page, 'so-return-sig', 'Office Tester');
    await expect(page.getByText('Add a photo of where you put the material.')).toBeVisible();
    await expect(page.getByTestId('so-status')).toHaveAttribute('data-status', 'open');
    await page.getByTestId('so-return_location-input').setInputFiles([png(`${RUN}-where.png`)]);
    await expect(page.getByTestId('so-photos-return_location-photo')).toHaveCount(1, { timeout: 60_000 });
    // The close step keeps its state across the photo refresh.
    await expect(page.getByTestId('so-ret-evidence')).toBeVisible();
    await page.getByTestId('so-ret-where').fill('Shop rack B, top shelf');
    await typeSignature(page, 'so-return-sig', 'Office Tester');
    await expect(page.getByTestId('so-status')).toHaveAttribute('data-status', 'damaged_on_return', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('so-return')).toBeVisible();
    await expect(page.getByTestId('so-overdue')).toHaveCount(0); // closed is never overdue
    await expect.poll(async () => (await record()).pdf_file_id, { timeout: 30_000 }).not.toBe(firstPdf);
    const r = await record();
    expect(r).toMatchObject({
      status: 'damaged_on_return',
      condition_at_return: 'damage_occurred',
      return_notes: 'Two boxes crushed',
      return_signer_name: 'Office Tester',
      return_location_note: 'Shop rack B, top shelf',
      not_returned_reason: null,
    });
    const { data: pdf } = await admin.from('files').select('category, mime_type').eq('id', r.pdf_file_id as string).single();
    expect(pdf).toMatchObject({ category: 'material_signout', mime_type: 'application/pdf' });
    const { count: stale } = await admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('id', firstPdf as string);
    expect(stale, 'one current PDF: the first was replaced').toBe(0);
  });
});
