import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { adminClient } from './hub-fixture';

// ============================================================================
// S112 R1 — MEASUREMENT HARNESS, not a regression test. Runs only when
// S112_MEASURE=1; CI never sets it.
// ============================================================================
// Ruling R1 (c): "Measure the export path on the same three conditions and
// report it in the same table" as the 3d save table. And (a): "Test it with
// markup_data deliberately removed and state the result."
//
// Per condition: a FRESH copy of a real 12 MP iPhone JPEG (4032x3024) on a
// crew project; crew opens it, draws one box through the UI, taps Save (clock:
// Save tap -> the marked photo on the viewer stage), then taps Save-to-device
// in the viewer (clock: tap -> the download event, i.e. the export's whole
// cost including any client-side flatten). The stored derivative and the
// exported file are read back and their pixel dimensions parsed from the JPEG.
//
// Run against a PRODUCTION build on :3000:
//   S112_MEASURE=1 S112_LABEL=after npx playwright test e2e/m-s112-r1-measure.spec.ts
// ============================================================================

const SOURCE_PATH =
  '03bb903f-1084-4ab4-afb8-03192cb58d30/6c395b31-cd45-4683-bb6a-cc4895488692/7e9e9aff-c239-439c-9880-e7237c33df09-20190804_224928736_iOS.jpg';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9'; // a crew-assigned project
const BUCKET = 'project-files';
const MARKER = 'S112R1MEASURE';
const LABEL = process.env.S112_LABEL ?? 'run';

const CONDITIONS = [
  { name: 'Local (CPU 1x, no throttle)', cpu: 1, net: null },
  {
    name: '1 Mbps uplink (CPU 4x, LTE 4 Mbps down, 150 ms)',
    cpu: 4,
    net: { latency: 150, downloadThroughput: 500_000, uploadThroughput: 125_000 },
  },
  {
    name: 'Fast 3G (CPU 4x, 1.44 Mbps down, 562 ms)',
    cpu: 4,
    net: { latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 },
  },
] as const;

test.skip(!process.env.S112_MEASURE, 'measurement harness — S112_MEASURE=1 only');
test.setTimeout(600_000);

function jpegDims(b: Buffer): string {
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) return '?';
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return `${b.readUInt16BE(i + 7)}x${b.readUInt16BE(i + 5)}`;
    }
    i += 2 + len;
  }
  return '?';
}

const admin = adminClient();
const made: { id: string; path: string }[] = [];

async function seed(): Promise<{ id: string; path: string }> {
  const { data: p } = await admin.from('projects').select('company_id').eq('id', PROJECT).single();
  const companyId = (p as { company_id: string }).company_id;
  const dl = await admin.storage.from(BUCKET).download(SOURCE_PATH);
  const bytes = Buffer.from(await dl.data!.arrayBuffer());
  const id = crypto.randomUUID();
  const path = `${companyId}/${PROJECT}/${id}-${MARKER}.jpg`;
  expect((await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg' })).error).toBeNull();
  const ins = await admin.from('files').insert({
    id,
    company_id: companyId,
    project_id: PROJECT,
    category: 'photos',
    file_name: `${MARKER}.jpg`,
    file_path: path,
    file_size: bytes.length,
    mime_type: 'image/jpeg',
  });
  expect(ins.error, ins.error?.message).toBeNull();
  made.push({ id, path });
  return { id, path };
}

test.afterAll(async () => {
  for (const m of made) {
    const { data: objs } = await admin.storage.from(BUCKET).list(m.path.slice(0, m.path.lastIndexOf('/')), {
      search: m.path.slice(m.path.lastIndexOf('/') + 1),
    });
    const dir = m.path.slice(0, m.path.lastIndexOf('/'));
    await admin.storage.from(BUCKET).remove((objs ?? []).map((o) => `${dir}/${o.name}`));
    await admin.from('files').delete().eq('id', m.id);
  }
});

async function throttle(page: Page, c: (typeof CONDITIONS)[number]) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: c.cpu });
  await cdp.send('Network.enable');
  await cdp.send(
    'Network.emulateNetworkConditions',
    c.net ? { offline: false, ...c.net } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
  );
  return cdp;
}

async function exportOnce(page: Page) {
  const t0 = Date.now();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 300_000 }),
    page.getByTestId('m-action-save').click(),
  ]);
  const ms = Date.now() - t0;
  const file = await download.path();
  const bytes = readFileSync(file!);
  return { ms, bytes: bytes.length, dims: jpegDims(bytes), name: download.suggestedFilename() };
}

const rows: Record<string, unknown>[] = [];

for (const c of CONDITIONS) {
  test(`${LABEL} · ${c.name}`, async ({ page }) => {
    const { id, path } = await seed();
    await page.goto(`/m/p/${PROJECT}/photos/${id}`);
    await expect(page.getByTestId('m-stage-image')).toBeVisible();
    await page.getByTestId('m-viewer-overflow').click();
    await page.getByTestId('m-viewer-markup').click();
    const svg = page.getByTestId('m-markup-svg');
    await expect(svg).toBeVisible({ timeout: 60_000 });
    const box = await svg.boundingBox();

    const cdp = await throttle(page, c);
    await page.getByTestId('m-tool-rectangle').click();
    await page.mouse.move(box!.x + 40, box!.y + 40);
    await page.mouse.down();
    await page.mouse.move(box!.x + 120, box!.y + 120, { steps: 6 });
    await page.mouse.up();

    const t0 = Date.now();
    await page.getByTestId('m-markup-save').click();
    await expect(page.getByTestId('m-viewer-markup-indicator')).toBeVisible({ timeout: 300_000 });
    const saveMs = Date.now() - t0;

    const deriv = await admin.storage.from(BUCKET).download(`${path}.markup.jpg`);
    const dBytes = Buffer.from(await deriv.data!.arrayBuffer());

    const exp = await exportOnce(page);
    await cdp.detach();

    const r = {
      label: LABEL,
      condition: c.name,
      saveMs,
      storedDerivative: `${dBytes.length} B, ${jpegDims(dBytes)}`,
      exportMs: exp.ms,
      exported: `${exp.bytes} B, ${exp.dims}, ${exp.name}`,
    };
    rows.push(r);
    console.log(`[S112 R1] ${JSON.stringify(r)}`);
  });
}

test(`${LABEL} · FALLBACK (a) — markup_data removed, then flatten made to fail`, async ({ page }) => {
  const { id, path } = await seed();
  await page.goto(`/m/p/${PROJECT}/photos/${id}`);
  await page.getByTestId('m-viewer-overflow').click();
  await page.getByTestId('m-viewer-markup').click();
  const svg = page.getByTestId('m-markup-svg');
  await expect(svg).toBeVisible({ timeout: 60_000 });
  const box = await svg.boundingBox();
  await page.getByTestId('m-tool-rectangle').click();
  await page.mouse.move(box!.x + 40, box!.y + 40);
  await page.mouse.down();
  await page.mouse.move(box!.x + 120, box!.y + 120, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('m-markup-save').click();
  await expect(page.getByTestId('m-viewer-markup-indicator')).toBeVisible({ timeout: 120_000 });

  // (a)-1: regeneration FAILS — the original's bytes are refused, markup intact.
  await page.goto(`/m/p/${PROJECT}/photos/${id}`);
  await expect(page.getByTestId('m-stage-image')).toBeVisible();
  await page.route(
    (u) => u.pathname.includes(`/${id}-${MARKER}.jpg`) && !u.pathname.includes('.markup.jpg') && !u.pathname.includes('.thumb.'),
    (r) => r.abort()
  );
  const failed = await exportOnce(page);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  const note1 = await page.getByTestId('m-viewer-note').textContent().catch(() => null);

  // (a)-2: markup_data REMOVED from the row, derivative still in storage.
  expect((await admin.from('files').update({ markup_data: null }).eq('id', id)).error).toBeNull();
  await page.goto(`/m/p/${PROJECT}/photos/${id}`);
  await expect(page.getByTestId('m-stage-image')).toBeVisible();
  const removed = await exportOnce(page);

  const r = {
    label: LABEL,
    regenerationFails: `${failed.bytes} B, ${failed.dims}, ${failed.name}, ${failed.ms} ms, note: ${note1}`,
    markupDataRemoved: `${removed.bytes} B, ${removed.dims}, ${removed.name}, ${removed.ms} ms`,
    derivativeStillStored: !!(await admin.storage.from(BUCKET).download(`${path}.markup.jpg`)).data,
  };
  console.log(`[S112 R1 FALLBACK] ${JSON.stringify(r)}`);
});
