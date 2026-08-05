import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { billingEnforcementEnabled } from '@/lib/billing-flag';

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

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
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

export const config = {
  matcher: ['/dashboard/:path*', '/sign-in', '/sign-up'],
};
