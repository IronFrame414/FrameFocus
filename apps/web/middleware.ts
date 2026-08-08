import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { billingEnforcementEnabled } from '@/lib/billing-flag';
import { safeNextPath } from '@/lib/safe-next';
import { defaultSignedInPath } from '@/lib/device';

type CookieEntry = { name: string; value: string; options?: Record<string, unknown> };

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieEntry[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              options as Parameters<typeof supabaseResponse.cookies.set>[2]
            )
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Redirect unauthenticated users away from dashboard
  if (!user && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages.
  //
  // THE DESTINATION IS `?next=`, NOT ALWAYS '/dashboard' [S121]. This branch
  // is the second half of the chain that made /m unreachable from a phone: the
  // mobile layout sends an unauthenticated field user to /sign-in, and if the
  // session turns out to be valid after all, this line used to deposit them in
  // the DESKTOP app. `safeNextPath` keeps '/dashboard' as the default, so every
  // existing caller behaves exactly as before; only a request that ASKED for
  // somewhere else goes somewhere else. See lib/safe-next.ts for the full chain
  // and for why the value must be validated rather than used as given.
  if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    // D-12 [S121] — the DEFAULT is device-dependent: a phone that lands on an
    // auth page while already signed in goes to /m, not the desktop app. Same
    // helper as the sign-in page, passed as safeNextPath's fallback so there is
    // one mechanism rather than two. `?next=` still wins over both.
    const dest = safeNextPath(
      request.nextUrl.searchParams.get('next'),
      defaultSignedInPath(request.headers.get('user-agent'))
    );
    // Split rather than `new URL(dest, origin)`: cloning keeps the request's
    // real origin, which behind Vercel's proxy is not always nextUrl.origin.
    const cut = dest.indexOf('?');
    const url = request.nextUrl.clone();
    url.pathname = cut === -1 ? dest : dest.slice(0, cut);
    url.search = cut === -1 ? '' : dest.slice(cut);
    return NextResponse.redirect(url);
  }

  // KILL-SWITCH [S99] — `DISABLE_BILLING_ENFORCEMENT=true` skips the whole
  // block below. Nothing is deleted; unset the env var and gating is back.
  //
  // Guarding the CONDITION rather than early-returning above this block is
  // deliberate. An early `return supabaseResponse` here would also skip any
  // code added after the block later, which has nothing to do with billing —
  // a trap for whoever adds the next middleware rule. This turns off exactly
  // one thing.
  //
  // OPERATIONAL: this is read at runtime (build-time inlining applies to
  // NEXT_PUBLIC_* vars, which this deliberately is not — it has no business in
  // a client bundle). But a Vercel deployment carries the env values it was
  // deployed with, so adding or removing this in the dashboard still does
  // nothing to already-deployed code until you REDEPLOY.
  const enforceBilling = billingEnforcementEnabled(process.env.DISABLE_BILLING_ENFORCEMENT);

  // Subscription enforcement — only for dashboard pages that are NOT billing
  if (
    enforceBilling &&
    user &&
    pathname.startsWith('/dashboard') &&
    !pathname.startsWith('/dashboard/billing')
  ) {
    // Get user's profile to find company_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('user_id', user.id)
      .single();

    if (profile) {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status, trial_end')
        .eq('company_id', profile.company_id)
        .single();

      if (subscription) {
        const isExpiredTrial =
          subscription.status === 'trialing' &&
          subscription.trial_end &&
          new Date(subscription.trial_end) < new Date();

        const needsPayment =
          isExpiredTrial ||
          subscription.status === 'canceled' ||
          subscription.status === 'unpaid' ||
          subscription.status === 'incomplete';

        if (needsPayment) {
          const url = request.nextUrl.clone();
          url.pathname = '/dashboard/billing/plans';
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return supabaseResponse;
}

// ---------------------------------------------------------------------------
// EVERY ROUTE THAT NEEDS AN AUTHENTICATED SESSION MUST BE LISTED HERE.
// ---------------------------------------------------------------------------
// This is not only about the redirects above — it is where the Supabase session
// gets REFRESHED. `lib/supabase-server.ts` swallows its cookie writes ("Ignored
// in Server Components (read-only)") because a Server Component cannot set
// cookies. Middleware can, so it is the only place a refreshed token is
// persisted. A route left out of this matcher works right up until the access
// token goes stale, and then fails in a way that points nowhere near the cause.
//
// `/m` WAS MISSING [S107] and this is what it did: the mobile layout's
// getUser() could not refresh, saw no user, and redirected to /sign-in — where
// this middleware DOES run, refreshed successfully, saw a valid user, and sent
// it to /dashboard. Net effect: /m bounced to the desktop dashboard, including
// from the PWA's start_url, so an installed app launched into the wrong app
// with no address bar to escape it (A-26).
//
// Surveyed [S107]: `/m` was the only gap. Everything else calling getUser()
// lives under /dashboard (covered), or is an API Route Handler — where
// cookies().set() SUCCEEDS, so those refresh themselves and need no middleware.
// invite / sign-co / reset-password are token-based and hold no session.
export const config = {
  matcher: ['/dashboard/:path*', '/m', '/m/:path*', '/sign-in', '/sign-up'],
};
