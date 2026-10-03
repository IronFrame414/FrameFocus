import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('server-only', () => ({}));

// ============================================================================
// S127 item 4e — the public share link, pinned where a unit test can pin it.
// The PAYLOAD proof is the e2e (e2e/share-link-s127.spec.ts reads the page's
// bytes); these pin the contract that makes that proof meaningful.
// ============================================================================

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const PAGE = read('../app/share/p/[token]/page.tsx');
const IMAGE = read('../app/share/p/[token]/image/route.ts');
const LIB = read('../lib/photos/share-link.ts');

describe('S127 4e — the token', () => {
  it('is 32 random bytes (43 base64url chars); only its sha256 is stored', async () => {
    const { newShareToken, hashShareToken, looksLikeShareToken } =
      await import('@/lib/photos/share-link');
    const a = newShareToken();
    const b = newShareToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashShareToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.token);
    expect(looksLikeShareToken(a.token)).toBe(true);
    expect(looksLikeShareToken('../../etc')).toBe(false);
  });
});

describe('S127 4e — what the public page may show (stop rule 10)', () => {
  it('the payload contract is exactly: company name, logo, date', () => {
    const block = LIB.slice(
      LIB.indexOf('export interface PublicSharePayload'),
      LIB.indexOf('}', LIB.indexOf('export interface PublicSharePayload'))
    );
    const fields = [...block.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    expect(fields).toEqual(['companyName', 'logoUrl', 'date']);
  });

  it('the page renders from the payload alone: no client component, no other read', () => {
    expect(PAGE).not.toMatch(/'use client'/);
    expect(PAGE).not.toMatch(/\.from\(/);
    for (const forbidden of [
      'project',
      'address',
      'client',
      'file_name',
      'fileName',
      'note',
      'description',
      'tags',
    ]) {
      expect(PAGE.toLowerCase(), forbidden).not.toContain(`payload.${forbidden.toLowerCase()}`);
    }
    expect([...PAGE.matchAll(/payload\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(
      ['companyName', 'date', 'logoUrl', 'logoUrl'].sort()
    );
  });

  it('the photo is streamed by the app, never a storage URL; the cache header is private', () => {
    expect(PAGE).toContain('src={`/share/p/${token}/image`}');
    expect(PAGE).not.toMatch(/createSignedUrl|getPublicUrl|supabase\.co/);
    expect(IMAGE).toContain("'Cache-Control': 'private, no-store'");
    expect(IMAGE).not.toMatch(/createSignedUrl|getPublicUrl|redirect\(/);
  });
});

describe('S127 4e — a link serves ONLY its own photo (resumed session finding)', () => {
  // share_path is a column an Owner/Admin INSERT can set through PostgREST, and
  // the bytes are read with the service role. Driven through resolveShareLink
  // itself, with a fake admin client holding one link row and its file row.
  const COMPANY = '11111111-1111-4111-8111-111111111111';
  const FILE_PATH = `${COMPANY}/p/photo.jpg`;
  function fakeAdmin(sharePath: string) {
    const rows: Record<string, Record<string, unknown>> = {
      photo_share_links: {
        id: 'link-1',
        company_id: COMPANY,
        file_id: 'file-1',
        share_path: sharePath,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        revoked_at: null,
        is_deleted: false,
      },
      files: {
        created_at: '2026-10-01T15:00:00Z',
        is_deleted: false,
        company_id: COMPANY,
        file_path: FILE_PATH,
      },
      companies: { name: 'Co', logo_url: null, timezone: 'America/New_York' },
    };
    const chain = (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return q;
    };
    return { from: chain } as unknown as import('@supabase/supabase-js').SupabaseClient;
  }

  it.each([
    ['the original', FILE_PATH, true],
    ['its marked-up derivative', `${FILE_PATH}.markup.jpg`, true],
    ['another company’s object', '22222222-2222-4222-8222-222222222222/p/photo.jpg', false],
    ['another photo in the same company', `${COMPANY}/p/other.jpg`, false],
    ['a derivative of another photo', `${COMPANY}/p/other.jpg.markup.jpg`, false],
  ])('share_path = %s (%s) → served: %s', async (_label, sharePath, served) => {
    const { resolveShareLink, newShareToken } = await import('@/lib/photos/share-link');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const link = await resolveShareLink(fakeAdmin(sharePath), newShareToken().token);
    spy.mockRestore();
    expect(link === null ? false : link.sharePath === sharePath).toBe(served);
  });
});
