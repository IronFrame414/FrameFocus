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
