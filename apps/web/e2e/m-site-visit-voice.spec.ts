import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';

// S108 Spec A — a voice note through the REAL screen and the REAL route:
// MediaRecorder on the phone page → POST /api/site-visits/[id]/voice (floor,
// storage, files row, voice-note row) → server-side transcription → the note
// appears with its audio. Chromium's FAKE microphone supplies the audio (a
// tone), so the transcript may legitimately be empty; what is asserted is the
// ruled PIPELINE: stored, then transcribed (done) — or, if the model refuses a
// tone, 'failed' WITH the audio kept and a retry offered. Either way no audio
// is lost. Language and wording are proven on real speech in
// test/s108-voice.live.ts. Crew identity (chromium-auth).

const MARKER = 'S108A-VOICE-E2E';
const admin = adminClient();

test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--disable-dev-shm-usage'],
  },
});

async function sweep() {
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (data ?? []).map((e) => e.id);
  if (!ids.length) return;
  const { data: files } = await admin.from('files').select('file_path').in('estimate_id', ids);
  const paths = (files ?? []).map((f) => f.file_path);
  if (paths.length) await admin.storage.from('project-files').remove(paths);
  await admin.from('notifications').delete().eq('type', 'site_visit_recorded').in('source_id', ids);
  await admin.from('files').delete().in('estimate_id', ids);
  await admin.from('estimates').delete().in('id', ids);
}
test.beforeAll(sweep);
test.afterAll(sweep);

test('S108 A — record a voice note on the phone: stored, then transcribed, audio kept', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/m/site-visits/new');
  await page.getByTestId('m-sv-title').fill(`${MARKER} porch`);
  await page.getByTestId('m-sv-contact-mode-existing').click();
  await page.getByTestId('m-sv-contact').selectOption({ index: 1 });
  await page.getByTestId('m-sv-address-mode-none').click();
  await page.getByTestId('m-sv-submit').click();
  await page.waitForURL(/\/m\/site-visits\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const visitId = page.url().split('/').pop()!;

  const rec = page.getByTestId('sv-voice-record');
  await rec.click();
  await expect(rec).toContainText('Stop', { timeout: 10_000 });
  await page.waitForTimeout(3_000);
  await rec.click();

  const noteRow = page.getByTestId('sv-voice-note');
  await expect(noteRow).toHaveCount(1, { timeout: 90_000 });
  const status = await noteRow.getAttribute('data-status');
  expect(['done', 'failed']).toContain(status);
  if (status === 'failed') await expect(page.getByTestId('sv-voice-retry')).toBeVisible();

  // The database side of the same fact: one voice note, its audio file stored,
  // and one cost row whatever the outcome.
  const { data: v } = await admin
    .from('site_visit_voice_notes')
    .select('id, file_id, duration_seconds, transcript_status')
    .eq('estimate_id', visitId);
  expect(v).toHaveLength(1);
  expect(Number(v![0].duration_seconds)).toBeGreaterThan(1);
  expect(Number(v![0].duration_seconds)).toBeLessThanOrEqual(600);
  const { data: f } = await admin.from('files').select('mime_type, file_size').eq('id', v![0].file_id!).single();
  expect(f!.mime_type).toMatch(/^audio\//);
  expect(Number(f!.file_size)).toBeGreaterThan(0);
  const { count } = await admin
    .from('ai_transcription_logs')
    .select('id', { count: 'exact', head: true })
    .eq('voice_note_id', v![0].id);
  expect(count).toBe(1);
  console.log(`VOICE_E2E transcript_status=${status}`);
});
