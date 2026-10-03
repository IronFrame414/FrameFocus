import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('server-only', () => ({}));

// ============================================================================
// S127 P-3 — photo thumbnails through the app's PROXY (S125 finding 4).
// ⚠️⚠️ HARD CONDITION: the cache header is `private`. A `public` header lets
// Vercel's CDN keep one company's thumbnail and serve it to another company's
// user requesting the same URL. These pin the contract; the e2e reads the
// header off real responses and runs the cross-tenant negative.
// ============================================================================

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const ROUTE = read('../app/api/photos/[fileId]/thumb/route.ts');
const SERVICE = read('../lib/services/photos.ts');

describe('S127 P-3 — the cache contract', () => {
  it('a served thumbnail is PRIVATE (never public, never a shared-cache max-age)', async () => {
    const { THUMB_CACHE_CONTROL, THUMB_NOT_FOUND_CACHE_CONTROL } =
      await import('@/lib/photos/thumb-proxy');
    for (const header of [THUMB_CACHE_CONTROL, THUMB_NOT_FOUND_CACHE_CONTROL]) {
      const parts = header.split(',').map((s) => s.trim());
      expect(parts[0], header).toBe('private');
      expect(parts, header).not.toContain('public');
      expect(header, header).not.toMatch(/s-maxage|stale-while-revalidate/);
    }
  });

  it('the route sets those headers on every response it writes', () => {
    expect(ROUTE).toContain("'Cache-Control': THUMB_CACHE_CONTROL");
    expect(ROUTE.match(/'Cache-Control': THUMB_NOT_FOUND_CACHE_CONTROL/g)?.length).toBe(3);
    expect(ROUTE).not.toMatch(/'Cache-Control':\s*'/);
  });

  it('authorisation is the CALLER’s: no service role, no signed URL', () => {
    expect(ROUTE).not.toMatch(/getSupabaseAdmin|SERVICE_ROLE|createSignedUrl|getPublicUrl/);
    expect(ROUTE).toContain('await createClient()');
    expect(ROUTE).toContain('supabase.storage.from(');
  });
});

describe('S127 P-3 — the stable, versioned URL', () => {
  it('same markup → same URL; changed markup → a new URL; no markup → v=o', async () => {
    const { thumbProxyUrl } = await import('@/lib/services/photos');
    const a = { shapes: [{ t: 'arrow', x: 1 }] };
    const b = { shapes: [{ t: 'arrow', x: 2 }] };
    expect(thumbProxyUrl('id-1', a)).toBe(
      thumbProxyUrl('id-1', { shapes: [{ t: 'arrow', x: 1 }] })
    );
    expect(thumbProxyUrl('id-1', a)).not.toBe(thumbProxyUrl('id-1', b));
    expect(thumbProxyUrl('id-1', null)).toBe('/api/photos/id-1/thumb?v=o');
    expect(thumbProxyUrl('id-1', a)).toMatch(/^\/api\/photos\/id-1\/thumb\?v=[0-9a-f]{8}$/);
  });

  it('getProjectPhotos no longer SIGNS thumbnail paths (the URL that defeated caching)', () => {
    const body = SERVICE.slice(
      SERVICE.indexOf('export async function getProjectPhotos('),
      SERVICE.indexOf('\n}\n', SERVICE.indexOf('export async function getProjectPhotos('))
    );
    const code = body.replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/signPaths\.push\(thumbPathFor/);
    expect(code).toContain('thumbProxyUrl(file.id, file.markup_data)');
  });
});
