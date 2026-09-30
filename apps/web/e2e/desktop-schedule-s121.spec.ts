import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';
import { signInAs } from './sign-in-as';

// S121 Part 5 — the desktop schedule, on a disposable project (`S121SCH`) so
// the only bars on screen are the fixture's.
//
//   5-H  a multi-day task is ONE connected bar per person per week; across the
//        week boundary it continues (› then ‹ on the next week)
//   5-B  Gantt: ONE bar per task, every name on it (ASK-2)
//   5-C  the calendar: ONE bar per PERSON (Q20)
//   5-D  click a day → the sheet in Josh's order; the start is the day clicked;
//        the overlap is a WARNING and the save still lands (stop rule 9)
//   5-E  drag moves the whole range (length kept); an end resizes; a resize
//        past the other end clamps at one day and says so
//   5-F  foreman: no "+ Not on project" (ASK-32); crew: no sheet, no handles
// Every write is read back with the service role.

test.use({ timezoneId: 'UTC' });

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const MARKER = 'S121SCH';
const admin = adminClient();

const now = new Date();
const sunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay()));
const d = (n: number) => new Date(sunday.getTime() + n * 86_400_000).toISOString().slice(0, 10);
const MON = d(1);
const TUE = d(2);
const WED = d(3);
const THU = d(4);
const FRI = d(5);
const SAT = d(6);
const NEXT_TUE = d(9);

let projectId = '';
let foremanMember = '';
let taskId = '';
let entryA = ''; // crew, Monday, single day
let entrySpan = ''; // crew, Fri → next Tue

async function memberOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', p!.id).single();
  return m!.id as string;
}

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  for (const p of ps ?? []) {
    const { data: ts } = await admin.from('tasks').select('id').eq('project_id', p.id);
    const tIds = (ts ?? []).map((t) => t.id as string);
    if (tIds.length) {
      await admin.from('task_assignees').delete().in('task_id', tIds);
      await admin.from('tasks').delete().in('id', tIds);
    }
    await admin.from('schedule_entries').delete().eq('project_id', p.id);
    await admin.from('project_assignments').delete().eq('project_id', p.id);
    await admin.from('projects').delete().eq('id', p.id);
  }
}

async function entry(id: string) {
  const { data } = await admin.from('schedule_entries').select('entry_date, end_date').eq('id', id).single();
  return data as { entry_date: string; end_date: string | null };
}

test.beforeAll(async () => {
  await sweep();
  foremanMember = await memberOf(FOREMAN);
  const pmMember = await memberOf(PM);
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
      project_internal_seq: (seqRow!.project_internal_seq as number) + 8600,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project: ${error.message}`);
  projectId = p!.id as string;
  for (const [member, role] of [
    [CREW_MEMBER, 'crew'],
    [foremanMember, 'crew'],
    [pmMember, 'project_manager'],
  ] as const) {
    const { error: aErr } = await admin
      .from('project_assignments')
      .insert({ company_id: COMPANY_A, project_id: projectId, member_id: member, role_on_project: role });
    if (aErr) throw new Error(`assign: ${aErr.message}`);
  }
  const { data: t } = await admin
    .from('tasks')
    .insert({ company_id: COMPANY_A, project_id: projectId, title: `${MARKER} framing`, start_date: TUE, due_date: THU })
    .select('id')
    .single();
  taskId = t!.id as string;
  for (const m of [CREW_MEMBER, foremanMember]) {
    await admin.from('task_assignees').insert({ company_id: COMPANY_A, task_id: taskId, member_id: m });
    await new Promise((r) => setTimeout(r, 20));
  }
  const { data: a } = await admin
    .from('schedule_entries')
    .insert({ company_id: COMPANY_A, member_id: CREW_MEMBER, project_id: projectId, entry_date: MON, general_kind: 'project' })
    .select('id')
    .single();
  entryA = a!.id as string;
  const { data: sp } = await admin
    .from('schedule_entries')
    .insert({ company_id: COMPANY_A, member_id: CREW_MEMBER, project_id: projectId, entry_date: FRI, end_date: NEXT_TUE, general_kind: 'shop' })
    .select('id')
    .single();
  entrySpan = sp!.id as string;
});

test.afterAll(async () => {
  await sweep();
});

async function openCalendar(page: Page, email: string) {
  await signInAs(page, email);
  await page.goto(`/dashboard/projects/${projectId}/schedule`);
  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.getByTestId('calendar-view-week').click();
  await expect(page.getByTestId('schedule-calendar')).toHaveAttribute('data-view', 'week');
}

const bar = (page: Page, key: string) => page.locator(`[data-testid="calendar-bar"][data-key="${key}"]`);

test.describe.serial('S121 Part 5 · desktop schedule', () => {
  test.setTimeout(120_000);

  test('5-H / 5-C · a 3-day, 2-person task is ONE connected bar PER PERSON; the Fri→Tue bar continues across the week', async ({ page }) => {
    await openCalendar(page, OWNER);
    const crewBar = bar(page, `task-${taskId}-${CREW_MEMBER}`);
    const foremanBar = bar(page, `task-${taskId}-${foremanMember}`);
    await expect(crewBar).toHaveCount(1);
    await expect(foremanBar).toHaveCount(1);
    // Connected: ONE element spanning Tue→Thu, about three day-cells wide.
    const cell = (await page.getByTestId(`calendar-day-${TUE}`).boundingBox())!;
    const b = (await crewBar.boundingBox())!;
    expect(b.width).toBeGreaterThan(cell.width * 2.8);
    expect(b.width).toBeLessThan(cell.width * 3.05);
    // The row break: this week shows Fri–Sat with ›, next week Sun–Tue with ‹.
    const span = bar(page, `general-${entrySpan}`);
    await expect(span).toHaveCount(1);
    await expect(span).toContainText('›');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(span).toHaveCount(1);
    await expect(span).toContainText('‹');
  });

  test('5-B · the Gantt is ONE bar per task, with both names on it', async ({ page }) => {
    await openCalendar(page, OWNER);
    await page.getByTestId('calendar-view-gantt').click();
    const bars = page.locator('[data-testid="gantt-bar"]').filter({ hasText: `${MARKER} framing` });
    await expect(bars).toHaveCount(1);
    const { data: names } = await admin.from('company_members').select('display_name').in('id', [CREW_MEMBER, foremanMember]);
    const expected = ((names ?? []) as { display_name: string }[]).map((n) => n.display_name);
    expect(expected, 'non-vacuous: two names').toHaveLength(2);
    for (const n of expected) await expect(bars).toContainText(n);
  });

  test('5-D · click Wednesday → the sheet; start = Wednesday; the overlap WARNS and the save still lands', async ({ page }) => {
    await openCalendar(page, OWNER);
    await page.getByTestId(`calendar-day-${WED}`).click();
    const sheet = page.getByTestId('schedule-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('ss-project-fixed')).toContainText(`${MARKER} project`);
    await expect(sheet.getByTestId('ss-start')).toHaveValue(WED);
    await sheet.getByTestId('ss-kind-team').click();
    // Typing FILTERS (it never creates anyone).
    await sheet.getByTestId('ss-search').fill('Foreman');
    await expect(sheet.getByTestId(`ss-person-${foremanMember}`)).toBeVisible();
    await expect(sheet.getByTestId(`ss-person-${CREW_MEMBER}`)).toHaveCount(0);
    await sheet.getByTestId(`ss-person-${foremanMember}`).click();
    // The foreman is on the Tue–Thu task: a WARNING, not a block.
    await expect(sheet.getByTestId('ss-overlap')).toContainText('already scheduled');
    await sheet.getByTestId('ss-task-none').click();
    await sheet.getByTestId('ss-save').click();
    await expect(page.getByTestId('schedule-toast')).toBeVisible({ timeout: 20_000 });
    const { data, count } = await admin
      .from('schedule_entries')
      .select('general_kind, entry_date, end_date', { count: 'exact' })
      .eq('project_id', projectId)
      .eq('member_id', foremanMember)
      .eq('is_deleted', false);
    expect(count).toBe(1);
    expect(data![0]).toEqual({ general_kind: 'project', entry_date: WED, end_date: null });
  });

  test('5-E · drag moves the whole range; an end resizes; a resize past the start CLAMPS and says so', async ({ page }) => {
    await openCalendar(page, OWNER);
    const dragTo = async (from: { x: number; y: number }, toDay: string) => {
      const target = (await page.getByTestId(`calendar-day-${toDay}`).boundingBox())!;
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, from.y, { steps: 8 });
      await page.mouse.up();
    };
    // Move entry A (Mon, one day) → Wed.
    let a = (await bar(page, `general-${entryA}`).boundingBox())!;
    await dragTo({ x: a.x + a.width / 2, y: a.y + a.height / 2 }, WED);
    await expect.poll(async () => (await entry(entryA)).entry_date, { timeout: 20_000 }).toBe(WED);
    expect((await entry(entryA)).end_date).toBeNull();

    // Resize its END → Fri; the start stays Wed.
    a = (await bar(page, `general-${entryA}`).boundingBox())!;
    await dragTo({ x: a.x + a.width - 3, y: a.y + a.height / 2 }, FRI);
    await expect.poll(async () => (await entry(entryA)).end_date, { timeout: 20_000 }).toBe(FRI);
    expect((await entry(entryA)).entry_date).toBe(WED);

    // Resize its START past the end (→ Sat): clamped to one day, and said.
    a = (await bar(page, `general-${entryA}`).boundingBox())!;
    await dragTo({ x: a.x + 3, y: a.y + a.height / 2 }, SAT);
    await expect(page.getByTestId('calendar-note')).toContainText('cannot end before it starts');
    await expect.poll(async () => (await entry(entryA)).entry_date, { timeout: 20_000 }).toBe(FRI);
    expect((await entry(entryA)).end_date).toBeNull(); // one day: end = start stores NULL

    // A task moves as a whole: Tue–Thu dragged +1 → Wed–Fri, length kept.
    const t = (await bar(page, `task-${taskId}-${CREW_MEMBER}`).boundingBox())!;
    const tue = (await page.getByTestId(`calendar-day-${TUE}`).boundingBox())!;
    await page.mouse.move(tue.x + tue.width / 2, t.y + t.height / 2);
    await page.mouse.down();
    await page.mouse.move(tue.x + tue.width * 1.5, t.y + t.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const { data } = await admin.from('tasks').select('start_date, due_date').eq('id', taskId).single();
        return `${(data as { start_date: string }).start_date}|${(data as { due_date: string }).due_date}`;
      }, { timeout: 20_000 })
      .toBe(`${WED}|${FRI}`);
  });

  test('5-F · the PM has "+ Not on project"; the foreman may schedule but has not (ASK-32)', async ({ browser }) => {
    for (const [email, expected] of [
      [PM, 1],
      [FOREMAN, 0],
    ] as const) {
      const ctx = await browser.newContext({ timezoneId: 'UTC' });
      const page = await ctx.newPage();
      await openCalendar(page, email);
      await page.getByTestId(`calendar-day-${MON}`).click();
      await expect(page.getByTestId('schedule-sheet')).toBeVisible();
      await expect(page.getByTestId('ss-off-project'), email).toHaveCount(expected);
      await ctx.close();
    }
  });

  test('5-F · crew: no scheduling sheet and no drag handles', async ({ page }) => {
    await openCalendar(page, CREW);
    // Non-vacuous: the crew member's own bars are on screen.
    await expect(bar(page, `task-${taskId}-${CREW_MEMBER}`)).toHaveCount(1);
    await page.getByTestId(`calendar-day-${MON}`).click();
    await expect(page.getByTestId('schedule-sheet')).toHaveCount(0);
    await expect(page.getByTestId('calendar-bar-start')).toHaveCount(0);
    await expect(page.getByTestId('calendar-bar-end')).toHaveCount(0);
  });
});
