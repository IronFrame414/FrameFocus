import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { billingEnforcementEnabled } from '@/lib/billing-flag';
import { safeNextPath } from '@/lib/safe-next';
import { defaultSignedInPath } from '@/lib/device';
import { dashboardDeniedRedirect } from '@/lib/dashboard-access';
import { isMyCompanyLocked, isLockExemptApiPath, isLockExemptPagePath } from '@/lib/trial/lock-guard';

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
    // ⚠️ `defaultSignedInPath()` IS STILL USER-AGENT-ONLY, AND THAT IS THE
    // DECISION, NOT AN OVERSIGHT [S131].
    //
    // Ruling A raised the question of whether this helper should learn about
    // role. Both callers were checked before answering: this one, and
    // `app/sign-in/page.tsx:23`. The sign-in PAGE renders with no session at
    // all — there is no user, so there is no role to branch on — which is why
    // the helper takes a user agent and nothing else. Teaching it role would
    // mean a signature its main caller cannot satisfy.
    //
    // It does not need to. A denied role sent to '/dashboard' from here is
    // bounced by the guard below on the very next request, so the outcome is
    // the ruling's (`/m/projects`, or the client placeholder) at the cost of
    // one extra 307. One mechanism decides who may be on the dashboard, and it
    // is not this line.
    //
    // The payoff is that M6M **A-6** stays exactly true — "a successful sign-in
    // lands on /m/timeclock, not /m/projects and not the dashboard" — because
    // this branch is untouched. Ruling A governs the DASHBOARD-BLOCKED
    // redirect; A-6 governs the sign-in landing. Josh split them deliberately
    // [S131] and this is where the split lives.
    //
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

  // ---------------------------------------------------------------------------
  // ONE PROFILE FETCH SERVES BOTH GATES [S131]
  // ---------------------------------------------------------------------------
  // The role guard below has to run for EVERY `/dashboard` path — including
  // `/dashboard/billing`, which the subscription block deliberately exempts, and
  // including when `DISABLE_BILLING_ENFORCEMENT` is set. So the fetch moved out
  // here rather than being duplicated inside the billing condition. Same number
  // of round trips as before: `role` is one more column, not one more query.
  // ---------------------------------------------------------------------------
  // ⚠️ THE TRIAL LOCK GUARD [S138] — BEFORE the dashboard block, and covering
  // `/m` and `/api` as well, which the subscription block below never has.
  // ---------------------------------------------------------------------------
  // The lock is a session ban. Measured in S138: the ban stops sign-in and
  // refresh IMMEDIATELY, but an access token issued before the lock keeps
  // working for the rest of its 3600s life. This is what closes that hour.
  //
  // Ordering matters and is the same reasoning as Ruling A above: this runs
  // before the role guard and before billing, because a locked tenant should be
  // told they are locked rather than bounced to a price list or a roster check.
  //
  // ⚠️ THE EXEMPTIONS ARE THE LOAD-BEARING PART, not the guard. A locked
  // company must still be able to PAY — see LOCK_EXEMPT_API_PREFIXES.
  if (user && !isLockExemptPagePath(pathname) && !isLockExemptApiPath(pathname)) {
    const locked = await isMyCompanyLocked(supabase);
    if (locked) {
      if (pathname.startsWith('/api')) {
        // JSON, not a redirect: an API caller following a 307 to an HTML page
        // gets a parse error that points nowhere near the cause.
        return NextResponse.json(
          { error: 'Account locked — trial expired', code: 'TRIAL_LOCKED' },
          { status: 403 }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = '/locked';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  if (user && pathname.startsWith('/dashboard')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, company_id')
      .eq('user_id', user.id)
      .single();

    // ⚠️ RULING A [Josh, S131] — `DASHBOARD_ROLES`, enforced at the route.
    //
    // FIRST, and before billing: a subcontractor with an expired trial must not
    // be redirected to `/dashboard/billing/plans`, which is a dashboard page
    // they are not allowed on and, being Owner-only, one they could do nothing
    // with. Order is the whole of that.
    //
    // This is HALF of M6M D-54 (hidden AND route-guarded). The other half is in
    // `app/dashboard/layout.tsx`, and it is not redundant with this one: a
    // middleware matcher is a list someone can forget to add a path to, and it
    // does not run on every server-render path. Neither of the two protects the
    // DATA — that is Ruling B, on the tables.
    const denied = dashboardDeniedRedirect(profile?.role);
    if (denied) {
      const url = request.nextUrl.clone();
      url.pathname = denied;
      url.search = '';
      return NextResponse.redirect(url);
    }

    // Subscription enforcement — only for dashboard pages that are NOT billing
    if (enforceBilling && profile && !pathname.startsWith('/dashboard/billing')) {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('status, trial_end, trial_start, stripe_subscription_id')
        .eq('company_id', profile.company_id)
        .single();

      if (subscription) {
        const isExpiredTrial =
          subscription.status === 'trialing' &&
          subscription.trial_end &&
          new Date(subscription.trial_end) < new Date();

        // ⚠️ THE FOURTH-SIGNUP CASE IS NOT A BILLING FAILURE [S138].
        // `handle_new_user()` marks a 4th trial from the same address
        // `incomplete` with no trial dates and no Stripe subscription. Sending
        // that to the price list — which is what happened until now — shows a
        // pricing table with no hint of why the trial did not start, which
        // reads as a payment error. It gets its own screen.
        const isTrialLimited =
          subscription.status === 'incomplete' &&
          subscription.trial_start === null &&
          subscription.stripe_subscription_id === null;

        if (isTrialLimited) {
          const url = request.nextUrl.clone();
          url.pathname = '/trial-limit';
          url.search = '';
          return NextResponse.redirect(url);
        }

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
// `/api/:path*` and `/locked` ADDED [S138] for the trial lock guard above.
//
// `/portal` ADDED [S164, M9 stage 4] — for the SAME reason `/m` was, and the
// symptom would be the same one: `app/portal/layout.tsx` calls getUser(), a
// Server Component cannot persist a refreshed token, so a stale session would
// send the client to /sign-in, where this middleware refreshes successfully,
// sees a valid user, and forwards to /dashboard — where the S131 guard bounces
// her back to /portal. A client left alone for a week would ping-pong.
//
// Nothing else about /portal changes here: the dashboard-role guard, the
// billing redirect and the unauthenticated redirect are all scoped to
// `/dashboard` and never see it. The trial lock DOES apply, and should: a
// locked tenant's client portal going dark is the correct behaviour, and
// `/locked` explains it.
//
// ⚠️ ADDING /api HERE IS A REAL COST AND A DELIBERATE TRADE. Every API request
// now runs getUser() plus one `is_my_company_locked()` RPC. The alternative was
// an opt-in helper called from each route, which is a list someone forgets to
// add a route to — the exact failure mode the comment above describes for this
// matcher. One enforcement point is worth the round trip; the guard fails OPEN
// so a fault here cannot lock the product.
//
// The routes that must survive a lock (payment above all) are exempted by
// path in lib/trial/lock-guard.ts, not by being left out of the matcher —
// they still need the session refresh this matcher provides.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/m',
    '/m/:path*',
    '/portal',
    '/portal/:path*',
    '/sign-in',
    '/sign-up',
    '/locked',
    '/trial-limit',
    '/api/:path*',
  ],
};
