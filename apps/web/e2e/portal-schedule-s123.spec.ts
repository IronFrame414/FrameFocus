import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signIn as signInPortal } from './chat-fixture';

// S123 D-1 [Josh, RULED Q1] — THE ORDINARY (NOT Critical Path) PROJECT SCHEDULE
// gets the disclaimer and the List ⇄ Gantt switch too.
//
// ⚠️ LIVE-FACING [Josh]: unlike the rest of S123, this is what every linked
// client sees on an ordinary job the day it merges. "A non-Critical-Path job's
// dates are hand-typed with no engine behind them, so they are LESS reliable
// than the computed ones, and they are the ones currently carrying no
// disclaimer at all."
//
// The data is untouched: client_schedule feeds it exactly as since S164 (its
// shape and values are pinned by s122-cp-client-schedule-regression.live.ts).
// Fixture: S164's project, reached by the LINKED client through
// project_contacts, Critical Path OFF.

test.use({ timezoneId: 'UTC' });

const LINKED = 'josh+qa-client-linked@worthprop.com';
const PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';
const DISCLAIMER = 'The construction industry is fluid and dynamic; these dates are for planning purposes and cannot be guaranteed.';
const admin = adminClient();

test.describe('S123 D-1 · the ordinary project schedule: disclaimer + List ⇄ Gantt', () => {
  let titles: string[] = [];
  let dated = 0;

  test.beforeAll(async () => {
    const { data: s } = await admin.from('project_schedule_settings').select('critical_path_enabled').eq('project_id', PROJECT).eq('is_deleted', false);
    expect(((s ?? []) as { critical_path_enabled: boolean }[]).some((r) => r.critical_path_enabled), 'the fixture must be Critical Path OFF').toBe(false);
    const { data: ts } = await admin.from('tasks').select('title, start_date, due_date').eq('project_id', PROJECT).eq('is_deleted', false);
    const rows = (ts ?? []) as { title: string; start_date: string | null; due_date: string | null }[];
    titles = rows.map((t) => t.title);
    dated = rows.filter((t) => t.start_date && t.due_date).length;
    expect(titles.length, 'the fixture has tasks (a schedule test on zero rows proves nothing)').toBeGreaterThan(0);
  });

  test('LIST (the default): today\'s rows, now under the disclaimer, with the switch', async ({ page }) => {
    await signInPortal(page, LINKED, /\/portal/);
    await page.goto(`/portal/${PROJECT}`);
    const schedule = page.getByTestId('portal-schedule');
    await expect(schedule).toHaveAttribute('data-view', 'list', { timeout: 20_000 });
    await expect(schedule).toHaveAttribute('data-kind', 'tasks');
    await expect(page.getByTestId('portal-schedule-disclaimer')).toHaveText(DISCLAIMER);
    await expect(page.getByTestId('portal-schedule-view-list')).toHaveAttribute('aria-current', 'page');
    for (const t of titles) await expect(schedule.getByText(t, { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('portal-cp'), 'no Critical Path pieces on an ordinary job').toHaveCount(0);
  });

  test('GANTT: the same tasks as bars, under the same disclaimer; bars only', async ({ page }) => {
    await signInPortal(page, LINKED, /\/portal/);
    await page.goto(`/portal/${PROJECT}`);
    await page.getByTestId('portal-schedule-view-gantt').click();
    await expect(page.getByTestId('portal-schedule')).toHaveAttribute('data-view', 'gantt', { timeout: 20_000 });
    await expect(page.getByTestId('portal-schedule-disclaimer')).toHaveText(DISCLAIMER);
    const gantt = page.getByTestId(dated > 0 ? 'portal-gantt' : 'portal-gantt-empty');
    await expect(gantt).toBeVisible();
    if (dated > 0) {
      await expect(gantt.getByTestId('portal-gantt-row')).toHaveCount(titles.length);
      await expect(gantt.getByTestId('portal-gantt-bar')).toHaveCount(dated);
      expect(await gantt.locator('svg, path, line, polyline, marker, canvas').count(), 'no arrows').toBe(0);
    }
  });
});
