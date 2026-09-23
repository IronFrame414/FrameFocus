import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveSiteVisitMedia, type ListedFile } from '@/lib/site-visits/media';

// S109 PRODUCTION REGRESSION — site-visit photos blank, voice notes silent.
//
// #161 removed list-time signing from GET /api/estimates/[id]/files (right,
// and `desktop-file-sheet-s109` S2 keeps it that way). `SiteVisitRecord` was a
// second consumer that read `url` off that list, so every photo fell to the
// grey fallback and every voice-note player vanished — on /m and both desktop
// mounts. The record now signs its own media through the per-file route.
//
// This file fails if the record stops producing a SRC for a photo or an audio
// URL for a voice note. The browser half — the image actually decodes, the
// <audio> actually carries a signed src — is `e2e/m-site-visit.spec.ts`.

const EST = 'e1';
const PROMOTED = '2026-09-23T12:00:00Z';
const files: ListedFile[] = [
  { id: 'p1', file_name: 'a.png', mime_type: 'image/png', created_at: '2026-09-23T10:00:00Z' },
  { id: 'p2', file_name: 'b.jpg', mime_type: 'image/jpeg', created_at: '2026-09-23T11:00:00Z' },
  { id: 'late', file_name: 'after.png', mime_type: 'image/png', created_at: '2026-09-23T13:00:00Z' },
  { id: 'doc', file_name: 'plans.pdf', mime_type: 'application/pdf', created_at: '2026-09-23T10:30:00Z' },
  { id: 'v1', file_name: 'note.webm', mime_type: 'audio/webm', created_at: '2026-09-23T10:45:00Z' },
];

function fakeFetch(fail: Set<string> = new Set()) {
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const impl = async (url: string) => {
    calls.push(url);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    const id = url.split('/files/')[1].split('/url')[0];
    if (fail.has(id)) return { ok: false, json: async () => ({ error: 'nope' }) };
    return { ok: true, json: async () => ({ url: `https://signed.example/${id}?token=t` }) };
  };
  return { impl, calls, max: () => maxInFlight };
}

describe('resolveSiteVisitMedia — the record signs its own photos and voice notes', () => {
  it('every visit-era photo gets a SRC and every voice note gets an audio URL', async () => {
    const f = fakeFetch();
    const { photos, audioUrls } = await resolveSiteVisitMedia(EST, files, PROMOTED, f.impl);
    expect(photos.map((p) => p.id)).toEqual(['p1', 'p2']);
    for (const p of photos) {
      expect(p.url, `photo ${p.id} has no src — the grid renders a grey tile`).toBe(`https://signed.example/${p.id}?token=t`);
    }
    expect(audioUrls, 'the voice note has no audio url — the player is not rendered').toEqual({
      v1: 'https://signed.example/v1?token=t',
    });
  });

  it('it signs through the per-file route, never the list', async () => {
    const f = fakeFetch();
    await resolveSiteVisitMedia(EST, files, PROMOTED, f.impl);
    for (const c of f.calls) expect(c).toMatch(/^\/api\/estimates\/e1\/files\/[^/]+\/url$/);
  });

  it('REQUEST COUNT: one per displayed photo + one per audio file — nothing else is signed', async () => {
    const f = fakeFetch();
    await resolveSiteVisitMedia(EST, files, PROMOTED, f.impl);
    // 2 visit-era photos + 1 audio. The post-promotion photo and the PDF are not
    // displayed by the record, so they are not signed. (+1 list request, made by
    // the component before this.)
    expect(f.calls.sort()).toEqual(
      ['/api/estimates/e1/files/p1/url', '/api/estimates/e1/files/p2/url', '/api/estimates/e1/files/v1/url'].sort()
    );
  });

  it('the requests run in PARALLEL, not one after another', async () => {
    const f = fakeFetch();
    await resolveSiteVisitMedia(EST, files, PROMOTED, f.impl);
    expect(f.max(), 'the per-file requests were serialised').toBe(3);
  });

  it('a failed resolve yields url: null for THAT file only — the grid keeps the rest', async () => {
    const f = fakeFetch(new Set(['p1']));
    const { photos, audioUrls } = await resolveSiteVisitMedia(EST, files, PROMOTED, f.impl);
    expect(photos.find((p) => p.id === 'p1')!.url).toBeNull();
    expect(photos.find((p) => p.id === 'p2')!.url).toBe('https://signed.example/p2?token=t');
    expect(audioUrls.v1).toBe('https://signed.example/v1?token=t');
  });

  it('a THROWING fetch is also contained', async () => {
    const boom = async () => {
      throw new Error('offline');
    };
    const { photos, audioUrls } = await resolveSiteVisitMedia(EST, files, PROMOTED, boom);
    expect(photos.map((p) => p.url)).toEqual([null, null]);
    expect(audioUrls).toEqual({ v1: null });
  });

  it('not yet promoted → every image is visit-era and signed', async () => {
    const f = fakeFetch();
    const { photos } = await resolveSiteVisitMedia(EST, files, null, f.impl);
    expect(photos.map((p) => p.id)).toEqual(['p1', 'p2', 'late']);
    expect(photos.every((p) => typeof p.url === 'string')).toBe(true);
  });
});

describe('SiteVisitRecord renders what the resolver produced — one component, three mounts', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const record = read('../components/site-visits/site-visit-record.tsx');

  it('it resolves through the helper and feeds BOTH photos and audio from it', () => {
    expect(record).toMatch(/const media = await resolveSiteVisitMedia\(/);
    expect(record).toMatch(/setPhotos\(media\.photos\)/);
    expect(record).toMatch(/setAudioUrls\(media\.audioUrls\)/);
    expect(record, 'the record reads url off the LIST again').not.toMatch(/\[f\.id, f\.url\]/);
    expect(record).toMatch(/data-testid="sv-photo" src=\{p\.url\}/);
    expect(read('../components/site-visits/voice-notes.tsx')).toMatch(/data-testid="sv-voice-audio"[^>]*src=\{url\}/);
  });

  it('the /m record screen and both desktop mounts use this ONE component', () => {
    for (const mount of [
      '../app/m/site-visits/[id]/page.tsx',
      '../app/dashboard/estimates/[id]/estimate-builder.tsx',
      '../app/dashboard/estimates/site-visits/[id]/page.tsx',
    ]) {
      expect(read(mount), mount).toMatch(/import \{ SiteVisitRecord \} from '@\/components\/site-visits\/site-visit-record'/);
      expect(read(mount), mount).toMatch(/<SiteVisitRecord\b/);
    }
  });
});
