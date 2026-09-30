import { test, expect, type Page } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';

// S120 2-A — a crew member clocked in against a TASK can clock out on /m.
//
// Josh hit it on production 2026-09-29 ("nothing happens when i tap it") and
// was unblocked by hand in the SQL editor. time_segments_completion_gate_check
// requires `completion` once a task-bound segment ends; the /m clock-out never
// asked for it, and the /m switch wrote NULL unless "Mark complete" was ticked.
//
// Both /m paths now ask "Is the task finished?" — two 52px choices, NO default —
// and cannot submit until it is answered. Every outcome is read back with the
// service role. Runs in the m-* project: 402x874, the crew session.

const admin = adminClient();
const RUN = `S120CO-${Date.now()}`;
let projectId = '';
let taskId = '';

async function clearCrewOpenSessions() {
  const { data } = await admin
    .from('time_clock_sessions')
    .select('id')
    .eq('member_id', CREW_MEMBER)
    .is('clock_out', null);
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) {
    await admin.from('time_segments').delete().in('session_id', ids);
    await admin.from('time_clock_sessions').delete().in('id', ids);
  }
}

/** An open shift for the crew member, on a work segment bound to our task. */
async function openTaskShift(): Promise<{ sessionId: string; segmentId: string }> {
  await clearCrewOpenSessions();
  const start = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: session, error } = await admin
    .from('time_clock_sessions')
    .insert({ company_id: COMPANY_A, member_id: CREW_MEMBER, clock_in: start, status: 'pending' })
    .select('id')
    .single();
  if (error || !session) throw new Error(`session: ${error?.message}`);
  const { data: seg, error: segErr } = await admin
    .from('time_segments')
    .insert({
      company_id: COMPANY_A,
      session_id: session.id,
      segment_type: 'work',
      project_id: projectId,
      task_id: taskId,
      segment_start: start,
    })
    .select('id')
    .single();
  if (segErr || !seg) throw new Error(`segment: ${segErr?.message}`);
  return { sessionId: session.id as string, segmentId: seg.id as string };
}

async function sessionsCreatedByRun(): Promise<string[]> {
  const { data } = await admin.from('time_segments').select('session_id').eq('task_id', taskId);
  return [...new Set(((data ?? []) as Array<{ session_id: string }>).map((r) => r.session_id))];
}

async function expectTapTarget(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} did not render`).not.toBeNull();
  expect(box!.height, `${testId} is below the 44px floor`).toBeGreaterThanOrEqual(44);
}

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
  if (error || !asg) throw new Error(`no Company A project assigned to crew: ${error?.message}`);
  projectId = asg.project_id as string;
  const { data: task, error: tErr } = await admin
    .from('tasks')
    .insert({ company_id: COMPANY_A, project_id: projectId, title: `${RUN} task` })
    .select('id')
    .single();
  if (tErr || !task) throw new Error(`task: ${tErr?.message}`);
  taskId = task.id as string;
});

test.afterAll(async () => {
  const sessions = await sessionsCreatedByRun();
  if (sessions.length) {
    await admin.from('time_segments').delete().in('session_id', sessions);
    await admin.from('time_clock_sessions').delete().in('id', sessions);
  }
  await admin.from('tasks').delete().eq('id', taskId);
});

test('clock-out of a task-bound segment asks the outcome (no default) and then clocks out', async ({
  page,
}) => {
  const { sessionId, segmentId } = await openTaskShift();
  await page.goto('/m/timeclock');
  await expect(page.getByTestId('m-clock-out')).toBeVisible();
  await page.getByTestId('m-clock-out').click();
  await expect(page.getByTestId('m-clock-out-confirm')).toBeVisible();
  await page.getByTestId('m-clock-out-note').fill(`${RUN} framed the uppers`);

  // The question is there, neither answer is chosen, and nothing submits yet.
  await expect(page.getByTestId('m-clock-out-completion')).toBeVisible();
  await expect(page.getByTestId('m-clock-out-completion-complete')).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(page.getByTestId('m-clock-out-completion-incomplete')).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(page.getByTestId('m-clock-out-go')).toBeDisabled();
  await expectTapTarget(page, 'm-clock-out-completion-complete');
  await expectTapTarget(page, 'm-clock-out-completion-incomplete');

  await page.getByTestId('m-clock-out-completion-incomplete').click();
  await expect(page.getByTestId('m-clock-out-go')).toBeEnabled();
  await page.getByTestId('m-clock-out-go').click();

  // The rendered result: the clock-in control, and no error.
  await expect(page.getByTestId('m-clock-in')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('m-clock-error')).toHaveCount(0);

  const { data: seg } = await admin
    .from('time_segments')
    .select('segment_end, completion, note')
    .eq('id', segmentId)
    .single();
  const { data: ses } = await admin
    .from('time_clock_sessions')
    .select('clock_out')
    .eq('id', sessionId)
    .single();
  expect(seg!.segment_end).not.toBeNull();
  expect(seg!.completion).toBe('incomplete');
  expect(seg!.note).toBe(`${RUN} framed the uppers`);
  expect(ses!.clock_out).not.toBeNull();
});

test('switching away from a task-bound segment asks the outcome (no default) and then switches', async ({
  page,
}) => {
  const { sessionId, segmentId } = await openTaskShift();
  await page.goto('/m/timeclock/switch');
  await expect(page.getByTestId('m-switch-completion')).toBeVisible();
  await expect(page.getByTestId('m-switch-completion-complete')).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expect(page.getByTestId('m-switch-completion-incomplete')).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await expectTapTarget(page, 'm-switch-completion-complete');

  await page.getByTestId('m-switch-note').fill(`${RUN} switching to a break`);
  await page.getByTestId('m-next-type-break').click();
  // Everything else is ready; the unanswered question alone holds the submit.
  await expect(page.getByTestId('m-start-segment')).toBeDisabled();
  await page.getByTestId('m-switch-completion-incomplete').click();
  await expect(page.getByTestId('m-start-segment')).toBeEnabled();
  await page.getByTestId('m-start-segment').click();

  await expect(page).toHaveURL(/\/m\/timeclock$/, { timeout: 20_000 });
  await expect(page.getByTestId('m-clock-out')).toBeVisible();

  const { data: ended } = await admin
    .from('time_segments')
    .select('segment_end, completion')
    .eq('id', segmentId)
    .single();
  const { data: open } = await admin
    .from('time_segments')
    .select('segment_type')
    .eq('session_id', sessionId)
    .is('segment_end', null);
  expect(ended!.segment_end).not.toBeNull();
  expect(ended!.completion).toBe('incomplete');
  expect(((open ?? []) as Array<{ segment_type: string }>).map((r) => r.segment_type)).toEqual([
    'break',
  ]);
});
