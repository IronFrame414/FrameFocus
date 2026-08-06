import { describe, it, expect } from 'vitest';
import { config } from '@/middleware';

// The middleware matcher, asserted directly.
//
// WHY THIS IS A TEST AND NOT A COMMENT [S107]. The matcher is not only about
// the redirects inside middleware.ts — it is where the Supabase session is
// REFRESHED. `lib/supabase-server.ts` swallows its cookie writes ("Ignored in
// Server Components (read-only)"), because a Server Component genuinely cannot
// set cookies; middleware can, so it is the only place a refreshed token is
// persisted.
//
// A route missing from this list therefore works perfectly with a fresh token
// and fails once the token goes stale — which is the worst possible failure
// shape: it passes every test, passes review, and breaks for real users hours
// later, pointing nowhere near the matcher.
//
// `/m` was missing. The mobile layout could not refresh, saw no user, and
// redirected to /sign-in; middleware — which DID run there — refreshed, saw a
// valid user, and forwarded to /dashboard. The field app landed in the desktop
// app, including from the PWA's start_url.
//
// ---------------------------------------------------------------------------
// WHAT THIS TEST DOES AND DOES NOT COVER — read before trusting it.
// ---------------------------------------------------------------------------
// COVERS: the matcher's CONTENTS. This is the assertion that would have caught
// the defect, because the defect WAS an absent entry.
//
// DOES NOT COVER: the runtime behaviour with an EXPIRED token. Reproducing that
// needs a session aged past the access-token lifetime, which no test in this
// repo can produce cheaply — Playwright signs in fresh in auth.setup, so its
// token is always valid and /m renders correctly even with a broken matcher.
// That is exactly why the browser suite was blind to this and a structural
// assertion is the right guard.

describe('middleware matcher — every route needing a session is listed [S107]', () => {
  it('covers /m, the mobile shell — the entry whose absence caused the defect', () => {
    expect(config.matcher).toContain('/m');
    // Both are needed: '/m' alone does not match '/m/timeclock', and
    // '/m/:path*' alone does not match the bare '/m' the PWA's start_url uses.
    expect(config.matcher).toContain('/m/:path*');
  });

  it('still covers the dashboard and the auth pages', () => {
    expect(config.matcher).toContain('/dashboard/:path*');
    expect(config.matcher).toContain('/sign-in');
    expect(config.matcher).toContain('/sign-up');
  });

  it('the PWA start_url is a matched path', () => {
    // manifest.ts sets start_url '/m'. An installed app launches straight into
    // it, after hours or days backgrounded — the case where a stale token is
    // the NORM, not the edge. If this ever stops matching, A-26 breaks in a way
    // only a real handset would reveal, since A-26 is [manual].
    expect(config.matcher).toContain('/m');
  });
});
