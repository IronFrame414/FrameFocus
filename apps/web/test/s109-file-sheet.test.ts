import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canPrint, fileViewKind, isIOS, withDownload } from '@/lib/files/file-view';

// S109 #161 — the file sheet. Pure decisions here (node); the sheet in a real
// browser is `e2e/desktop-file-sheet-s109.spec.ts`; the new route's call order
// is `s109-estimate-file-url-order.test.ts`.

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('fileViewKind — what the sheet can show (FILL-161.2)', () => {
  it('reads the MIME type first', () => {
    expect(fileViewKind('application/pdf', 'x')).toBe('pdf');
    expect(fileViewKind('image/png', 'x')).toBe('image');
    expect(fileViewKind('image/heic', 'x.jpg')).toBe('heic');
    expect(fileViewKind('video/mp4', 'x')).toBe('video');
    expect(fileViewKind('audio/webm', 'x')).toBe('audio');
  });
  it('falls back to the extension when the MIME type is missing', () => {
    expect(fileViewKind(null, 'Plans.PDF')).toBe('pdf');
    expect(fileViewKind('', 'site.jpeg')).toBe('image');
    expect(fileViewKind(undefined, 'IMG_0001.HEIC')).toBe('heic');
  });
  it('anything else is "none" — a real answer, the no-preview panel', () => {
    expect(fileViewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'spec.docx')).toBe('none');
    expect(fileViewKind('application/zip', 'photos.zip')).toBe('none');
    expect(fileViewKind(null, 'README')).toBe('none');
  });
  it('print is offered only for what the browser can print', () => {
    expect(canPrint('pdf')).toBe(true);
    expect(canPrint('image')).toBe(true);
    expect(canPrint('none')).toBe(false);
    expect(canPrint('heic')).toBe(false);
  });
});

describe('withDownload — the explicit Download action', () => {
  it('appends to a signed URL that already carries ?token=', () => {
    const u = withDownload('https://x.supabase.co/storage/v1/object/sign/b/p.pdf?token=abc', 'Plans v2.pdf');
    expect(u).toContain('token=abc');
    expect(new URL(u).searchParams.get('download')).toBe('Plans v2.pdf');
  });
  it('replaces rather than duplicates an existing download parameter', () => {
    const u = withDownload('https://x/y?token=t&download=old.pdf', 'new.pdf');
    expect(new URL(u).searchParams.getAll('download')).toEqual(['new.pdf']);
  });
});

describe('isIOS — where Print becomes "open in new tab" (FILL-161.3)', () => {
  it('iPhone and iPad, including iPadOS reporting as a Mac with touch', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true);
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIOS('Mozilla/5.0 (X11; Linux x86_64)', 0)).toBe(false);
  });
});

describe('every in-scope surface opens the ONE sheet (ruling 161.B)', () => {
  const sites = [
    'app/dashboard/projects/[id]/files/file-row.tsx',
    'app/m/p/[projectId]/files/open-file.tsx',
    'app/dashboard/estimates/[id]/estimate-files-tab.tsx',
    'app/dashboard/estimates/[id]/bidding-tab.tsx',
    'app/dashboard/subcontractors/[id]/compliance-section.tsx',
    'components/chat/chat-thread.tsx',
    'app/dashboard/field-ops/[projectId]/daily-logs/[logId]/detail-client.tsx',
    'app/dashboard/field-ops/safety/[incidentId]/incident-detail-client.tsx',
    'app/dashboard/field-ops/[projectId]/deliveries/d/[deliveryId]/delivery-actions.tsx',
  ];
  for (const site of sites) {
    it(site, () => {
      const src = read(`../${site}`);
      expect(src).toMatch(/import \{ useFileSheet \} from '@\/components\/files\/file-sheet'/);
      expect(src).toMatch(/openFile\(\{/);
      expect(src, 'a new tab is back as the default open').not.toMatch(/window\.open\(url, '_blank'/);
      expect(src, '/m navigates away again').not.toMatch(/window\.location\.href = body\.url/);
    });
  }

  it('both layouts mount the provider — one viewer, both surfaces', () => {
    expect(read('../app/dashboard/layout.tsx')).toMatch(/<FileSheetProvider>/);
    expect(read('../app/m/layout.tsx')).toMatch(/<FileSheetProvider>/);
  });

  it('the three forced-download buttons now say View', () => {
    for (const f of [
      'app/dashboard/field-ops/[projectId]/daily-logs/[logId]/detail-client.tsx',
      'app/dashboard/field-ops/safety/[incidentId]/incident-detail-client.tsx',
      'app/dashboard/field-ops/[projectId]/deliveries/d/[deliveryId]/delivery-actions.tsx',
    ]) {
      const src = read(`../${f}`);
      expect(src).toContain("pdfPath ? 'View PDF' : 'Generate PDF'");
      expect(src, 'the view path forces a download again').not.toMatch(/getFileSignedUrl\(pdfPath, pdfName/);
    }
  });

  it('/m supersedes its S97 "no in-app viewer" cut IN PLACE (quoted, not deleted)', () => {
    const src = read('../app/m/p/[projectId]/files/open-file.tsx');
    expect(src).toContain('OVERTURNED [Josh, S109 #161]');
    expect(src).toContain('"CUT: an in-app document viewer.');
  });

  it('161.B — the estimate files LIST signs nothing; the click does', () => {
    const list = read('../app/api/estimates/[id]/files/route.ts');
    const get = list.slice(list.indexOf('export async function GET'), list.indexOf('export async function POST'));
    expect(get, 'the list signs URLs at load time again').not.toMatch(/createSignedUrl/);
    expect(get, 'the list selects file_path again').not.toMatch(/\.select\('[^']*file_path/);
    const tab = read('../app/dashboard/estimates/[id]/estimate-files-tab.tsx');
    expect(tab).toContain('/api/estimates/${estimateId}/files/${f.id}/url');
    expect(tab).not.toMatch(/f\.url/);
  });

  it('161.C — the invoice PDF stays a new tab (out of the sheet, by ruling)', () => {
    const src = read('../app/dashboard/projects/[id]/invoices/[invoiceId]/invoice-builder.tsx');
    expect(src).not.toMatch(/useFileSheet/);
  });
});
