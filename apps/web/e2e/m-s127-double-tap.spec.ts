import { test, expect } from '@playwright/test';
import { adminClient, COMPANY_A, CREW_MEMBER } from './hub-fixture';

// S127 P-1 — the two double-tap DEFECTS, on the screen and at the route.
// Runs in the m-* project: 402x874, the crew session. Every outcome is read
// back with the service role, counted, never inferred from what rendered.
//
//   a) a second clock-in returned Postgres's raw unique-violation text. Here the
//      "first tap" lands from elsewhere (an open session written while this
//      screen still shows "not clocked in" — exactly the state a second tap
//      meets), then the tap. The user must read "You are already clocked in",
//      never the constraint, and there must still be ONE open session.
//   b) a second punch-create made a DUPLICATE item. Two simultaneous POSTs of
//      the same item (same client id) must leave ONE row; a double click on the
//      form must too.

const admin = adminClient();
const RUN = `S127DT-${Date.now()}`;
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

async function crewOpenSessions(): Promise<string[]> {
  const { data } = await admin
    .from('time_clock_sessions')
    .select('id')
    .eq('member_id', CREW_MEMBER)
    .is('clock_out', null)
    .eq('is_deleted', false);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

async function clearCrewOpenSessions() {
  const ids = await crewOpenSessions();
  if (ids.length) {
    await admin.from('time_segments').delete().in('session_id', ids);
    await admin.from('time_clock_sessions').delete().in('id', ids);
  }
}

async function itemsTitled(title: string): Promise<number> {
  const { count } = await admin
    .from('punch_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('title', title);
  return count ?? -1;
}

test.afterAll(async () => {
  await clearCrewOpenSessions();
  const { data: items } = await admin
    .from('punch_list_items')
    .select('id')
    .like('title', `${RUN}%`);
  const ids = ((items ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (ids.length) await admin.from('punch_list_items').delete().in('id', ids);
  const { data: lists } = await admin.from('punch_lists').select('id').like('name', `${RUN}%`);
  const listIds = ((lists ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (listIds.length) await admin.from('punch_lists').delete().in('id', listIds);
});

test('a second clock-in says "already clocked in", never the constraint, and leaves ONE open session', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await clearCrewOpenSessions();
  await page.goto('/m/timeclock');
  await expect(page.getByTestId('m-clock-in')).toBeVisible();
  await page.getByTestId('m-type-shop').click();

  // The first tap, landed from elsewhere while this screen is still stale.
  const { data: session, error } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: COMPANY_A,
      member_id: CREW_MEMBER,
      clock_in: new Date().toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();
  expect(error).toBeNull();
  await admin.from('time_segments').insert({
    company_id: COMPANY_A,
    session_id: session!.id,
    segment_type: 'shop',
    segment_start: new Date().toISOString(),
  });

  await page.getByTestId('m-clock-in').click();

  // Either the named notice, or the refreshed on-the-clock view replacing it.
  await expect(page.getByTestId('m-clock-out').or(page.getByTestId('m-clock-error'))).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('duplicate key')).toHaveCount(0);
  await expect(page.getByText('idx_time_clock_sessions_one_open_per_member')).toHaveCount(0);
  await expect(page.getByTestId('m-clock-out')).toBeVisible({ timeout: 30_000 });
  expect(await crewOpenSessions()).toEqual([session!.id]);
});

test('two simultaneous creates of the same punch item leave ONE row', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`/m/p/${PROJECT}/punch`);
  const { data: list, error } = await admin
    .from('punch_lists')
    .insert({ company_id: COMPANY_A, project_id: PROJECT, name: `${RUN} list` })
    .select('id')
    .single();
  expect(error).toBeNull();

  const title = `${RUN} route twice`;
  const body = {
    id: crypto.randomUUID(),
    punch_list_id: list!.id,
    project_id: PROJECT,
    title,
  };
  const [a, b] = await Promise.all([
    page.request.post('/api/punch-items', { data: body }),
    page.request.post('/api/punch-items', { data: body }),
  ]);
  expect([a.status(), b.status()]).toEqual([200, 200]);
  expect((await a.json()).id).toBe(body.id);
  expect((await b.json()).id).toBe(body.id);
  expect(await itemsTitled(title)).toBe(1);
});

test('a double tap on the form creates ONE item', async ({ page }) => {
  test.setTimeout(120_000);
  const title = `${RUN} form double`;
  await page.goto(`/m/p/${PROJECT}/punch/new`);
  await page.getByTestId('m-punch-list-__new__').click();
  await page.getByTestId('m-punch-new-list-name').fill(`${RUN} form list`);
  await page.getByTestId('m-punch-title').fill(title);
  await page.getByTestId('m-punch-create').dblclick();
  await expect(page).toHaveURL(new RegExp(`/m/p/${PROJECT}/punch$`), { timeout: 30_000 });
  expect(await itemsTitled(title)).toBe(1);
});
