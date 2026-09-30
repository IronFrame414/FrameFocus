import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S121 Part 4 — the timesheets queue and the WEEK SHEET. ⚠️ PAYROLL.
//
//   4-A  the WHOLE ROW opens the day breakdown; the checkbox and "Approve week"
//        stay themselves (a click on them does not toggle the row).
//   4-B  "Details" opens a SHEET carrying the member's whole week — every day,
//        every segment — with approval inside it.
//   4-C  the owner SPLITS a segment of an APPROVED day from the sheet: two
//        halves, the day back to pending, the "hours changed" pop-up, and its
//        Approve re-approves. An overlapping ADD is refused with the database's
//        sentence, and nothing is written.
//   4-D  a PM sees the sheet and can approve, but has NO edit controls.
// Every outcome is read back with the service role. Fixture: the week of
// 2020-01-06 (no real time), a disposable project `S121TSE`, Casey Crew.

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const MARKER = 'S121TSE';
const WEEK = '2020-01-06';
const admin = adminClient();
let projectId = '';
let monday = '';
let tuesday = '';
let mondayAfternoon = '';
const T = (hhmm: string, day = '2020-01-06') => `${day}T${hhmm}:00.000Z`;

async function sweep() {
  const { data: ss } = await admin
    .from('time_clock_sessions')
    .select('id')
    .eq('member_id', CREW_MEMBER)
    .gte('clock_in', '2020-01-01T00:00:00Z')
    .lt('clock_in', '2020-02-01T00:00:00Z');
  const sIds = (ss ?? []).map((s) => s.id as string);
  if (sIds.length) {
    await admin.from('time_edit_logs').delete().in('session_id', sIds);
    await admin.from('time_segments').delete().in('session_id', sIds);
    await admin.from('time_session_rate_snapshots').delete().in('session_id', sIds);
    await admin.from('time_clock_sessions').delete().in('id', sIds);
  }
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  for (const p of ps ?? []) {
    await admin.from('projects').delete().eq('id', p.id);
  }
}

async function session(day: string): Promise<{ id: string; afternoon: string }> {
  const { data: s, error } = await admin
    .from('time_clock_sessions')
    .insert({ company_id: COMPANY_A, member_id: CREW_MEMBER, clock_in: T('08:00', day), clock_out: T('17:00', day), status: 'pending' })
    .select('id')
    .single();
  if (error) throw new Error(`session: ${error.message}`);
  const { data: segs, error: sErr } = await admin
    .from('time_segments')
    .insert([
      { company_id: COMPANY_A, session_id: s!.id, segment_type: 'work', project_id: projectId, note: 'framing', segment_start: T('08:00', day), segment_end: T('12:00', day) },
      { company_id: COMPANY_A, session_id: s!.id, segment_type: 'break', segment_start: T('12:00', day), segment_end: T('12:30', day) },
      { company_id: COMPANY_A, session_id: s!.id, segment_type: 'work', project_id: projectId, note: 'cleanup', segment_start: T('12:30', day), segment_end: T('16:00', day) },
    ])
    .select('id, segment_start');
  if (sErr) throw new Error(`segments: ${sErr.message}`);
  const pm = (segs ?? []).find((r) => new Date(r.segment_start as string).toISOString() === T('12:30', day))!;
  return { id: s!.id as string, afternoon: pm.id as string };
}

async function status(id: string) {
  const { data } = await admin.from('time_clock_sessions').select('status').eq('id', id).single();
  return (data as { status: string | null }).status;
}
async function segmentCount(id: string) {
  const { count } = await admin
    .from('time_segments')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', id)
    .eq('is_deleted', false);
  return count ?? -1;
}

test.beforeAll(async () => {
  await sweep();
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', COMPANY_A)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', COMPANY_A)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .single();
  const { data: p, error } = await admin
    .from('projects')
    .insert({
      company_id: COMPANY_A,
      contact_id: contact!.id,
      project_number: `PRJ-${MARKER}`,
      name: `${MARKER} project`,
      status: 'active',
      project_internal_seq: (seqRow!.project_internal_seq as number) + 8400,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project: ${error.message}`);
  projectId = p!.id as string;
  const m = await session('2020-01-06');
  const t = await session('2020-01-07');
  monday = m.id;
  mondayAfternoon = m.afternoon;
  tuesday = t.id;
});

test.afterAll(async () => {
  await sweep();
});

async function openQueue(page: Page, email: string) {
  await signInAs(page, email);
  await page.goto(`/dashboard/timeclock/timesheets?week=${WEEK}`);
  await expect(page.getByTestId(`ts-row-${CREW_MEMBER}`)).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('S121 Part 4 · timesheets', () => {
  test('4-A · the whole row opens the days; the checkbox and Approve week stay themselves', async ({ page }) => {
    await openQueue(page, OWNER);
    const row = page.getByTestId(`ts-row-${CREW_MEMBER}`);
    const days = page.getByTestId(`ts-days-${CREW_MEMBER}`);
    await expect(days).toHaveCount(0);
    // A click on the far right of the row, over the OT/status cells — outside
    // the old clickable strip (left edge to "Paid hrs").
    const box = (await row.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.62, box.y + box.height / 2);
    await expect(days).toBeVisible();
    await expect(days.getByTestId('ts-day-details')).toHaveCount(2);

    // The checkbox selects and does NOT toggle the row.
    await page.getByTestId(`ts-select-${CREW_MEMBER}`).check();
    await expect(page.getByTestId(`ts-select-${CREW_MEMBER}`)).toBeChecked();
    await expect(days).toBeVisible();
    await page.getByTestId(`ts-select-${CREW_MEMBER}`).uncheck();
    await expect(days).toBeVisible();
    // Approve week is still a button that approves (and does not toggle).
    await expect(page.getByTestId(`ts-approve-week-${CREW_MEMBER}`)).toBeVisible();
  });

  test('4-B / 4-C · Details opens the week sheet; the owner splits an APPROVED day → pending, pop-up, re-approve', async ({ page }) => {
    await admin
      .from('time_clock_sessions')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', monday);
    expect(await status(monday)).toBe('approved');
    await openQueue(page, OWNER);
    await page.getByTestId(`ts-details-${CREW_MEMBER}`).click();
    const sheet = page.getByTestId('ts-week-sheet');
    await expect(sheet).toBeVisible();
    // The WHOLE week: both days, every segment.
    await expect(sheet.getByTestId('ts-day-2020-01-06')).toBeVisible();
    await expect(sheet.getByTestId('ts-day-2020-01-07')).toBeVisible();
    expect(await segmentCount(monday)).toBe(3);
    await expect(sheet.getByTestId('ts-sheet-segment')).toHaveCount(6);

    // Split Monday's afternoon (12:30–16:00) at 14:00.
    const mondaySection = sheet.getByTestId('ts-day-2020-01-06');
    await mondaySection.getByTestId('ts-sheet-split').nth(2).click();
    await page.getByTestId('ts-split-at').fill('2020-01-06T14:00');
    await page.getByTestId('ts-edit-note').fill('second half');
    await page.getByTestId('ts-editor-save').click();

    await expect(page.getByTestId('ts-reopened')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('ts-reopened')).toContainText('back to pending');
    await expect.poll(() => segmentCount(monday)).toBe(4);
    expect(await status(monday)).toBe('pending');
    const { data: halves } = await admin
      .from('time_segments')
      .select('id, segment_start, segment_end')
      .eq('session_id', monday)
      .gte('segment_start', T('12:30'))
      .order('segment_start', { ascending: true });
    const ms = (halves ?? []).map((h) => new Date(h.segment_end as string).getTime() - new Date(h.segment_start as string).getTime());
    expect(ms.reduce((a, b) => a + b, 0), 'the halves sum to the original 3h30m').toBe(3.5 * 3_600_000);
    expect((halves ?? [])[0].id).toBe(mondayAfternoon);

    // The pop-up's Approve re-approves.
    await page.getByTestId('ts-reopened-approve').click();
    await expect.poll(() => status(monday)).toBe('approved');
  });

  test('4-C · an OVERLAPPING add is refused with the database’s sentence; nothing is written', async ({ page }) => {
    await openQueue(page, OWNER);
    await page.getByTestId(`ts-details-${CREW_MEMBER}`).click();
    const tue = page.getByTestId('ts-week-sheet').getByTestId('ts-day-2020-01-07');
    await tue.getByTestId('ts-sheet-add').click();
    await page.getByTestId('ts-edit-type').selectOption('shop');
    await page.getByTestId('ts-edit-start').fill('2020-01-07T15:00');
    await page.getByTestId('ts-edit-end').fill('2020-01-07T16:30');
    await page.getByTestId('ts-edit-note').fill('overlap');
    await page.getByTestId('ts-editor-save').click();
    await expect(page.getByTestId('ts-editor-error')).toContainText('overlaps another segment');
    expect(await segmentCount(tuesday)).toBe(3);

    // A GAP is allowed (16:30–17:00 after the chain ends at 16:00).
    await page.getByTestId('ts-edit-start').fill('2020-01-07T16:30');
    await page.getByTestId('ts-edit-end').fill('2020-01-07T17:00');
    await page.getByTestId('ts-editor-save').click();
    await expect.poll(() => segmentCount(tuesday)).toBe(4);
  });

  test('4-D · a PM sees the sheet and may approve, but has NO edit controls', async ({ page }) => {
    await openQueue(page, PM);
    await page.getByTestId(`ts-details-${CREW_MEMBER}`).click();
    const sheet = page.getByTestId('ts-week-sheet');
    await expect(sheet.getByTestId('ts-sheet-segment').first()).toBeVisible();
    await expect(sheet.getByTestId('ts-sheet-segment')).toHaveCount(8);
    await expect(sheet.getByTestId('ts-sheet-edit')).toHaveCount(0);
    await expect(sheet.getByTestId('ts-sheet-split')).toHaveCount(0);
    await expect(sheet.getByTestId('ts-sheet-add')).toHaveCount(0);
    // Tuesday is pending (the add above reopened nothing — it was pending).
    await expect(sheet.getByTestId('ts-sheet-approve-day')).toHaveCount(1);
  });
});
