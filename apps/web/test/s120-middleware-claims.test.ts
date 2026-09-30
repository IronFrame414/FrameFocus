/**
 * S120 3-A — the middleware VERIFIES the token; it never merely reads it.
 *
 * `e2e/s120-middleware-jwt.spec.ts` proves the four runtime behaviours (valid,
 * stale-refreshed-and-written, tampered, expired). One of them cannot isolate
 * the middleware: a TAMPERED token is also refused by every /dashboard layout's
 * own getUser() (H-1b's defence in depth), so an e2e stays green even if the
 * middleware stopped checking the signature — measured S120: with getClaims()
 * swapped for getSession() the tampered e2e still passed, 4/4.
 *
 * So this guard pins the middleware's CALL. getSession() returns whatever the
 * cookie says without verifying the signature; substituting it anywhere in the
 * auth path is S120 stop rule 8. getClaims() verifies locally against the
 * JWKS (asymmetric) or falls back to getUser() (symmetric) — auth-js
 * GoTrueClient.getClaims, read S120.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = readFileSync(fileURLToPath(new URL('../middleware.ts', import.meta.url)), 'utf8');
// Comments may NAME getSession (they explain why it is not used); only code counts.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('S120 3-A — middleware auth calls', () => {
  it('calls supabase.auth.getClaims() (the verified, local check)', () => {
    expect(code).toMatch(/supabase\.auth\.getClaims\(\)/);
  });

  it('never calls auth.getSession() — an unverified read (stop rule 8)', () => {
    expect(code).not.toMatch(/auth\.getSession\(/);
  });

  it('keeps getUser() for /sign-in and /sign-up only (the revoked-token loop guard)', () => {
    expect(code).toMatch(
      /pathname === '\/sign-in' \|\| pathname === '\/sign-up'[\s\S]{0,120}auth\.getUser\(\)/
    );
  });
});
