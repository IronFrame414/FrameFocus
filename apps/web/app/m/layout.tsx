import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getMembers } from '@/lib/services/members';
import { MobileShell } from './mobile-shell';
import { RegisterSw } from './register-sw';

// M6M §1 — the mobile shell layout. Hosts §3.1's app bar, §3.2's tab bar,
// §3.3's sheet and §4.4's app-wide offline strip. Nothing under app/dashboard/**
// is touched (A-28).
//
// ---------------------------------------------------------------------------
// THIS LAYOUT IS THE ONLY AUTH *GATE* ON /m — but not the only middleware
// concern. `/m` IS in the matcher as of [S107] (`middleware.ts` config), and
// middleware's own redirects are all scoped to `/dashboard`, so an unsigned
// request still reaches this file rather than being bounced earlier. Hence the
// explicit redirect below, mirroring app/dashboard/layout.tsx.
//
// ⚠️ CORRECTED [S107] — the warning that used to sit here was WRONG, and it
// would have talked the next reader out of a safe and necessary fix. It read:
//
//   "Adding /m to the middleware matcher would also subject the field app to
//    the billing-enforcement redirect to /dashboard/billing/plans."
//
// It does not. That block is itself guarded by
// `pathname.startsWith('/dashboard')` (middleware.ts), so `/m` never enters it
// — as is the unauthenticated-redirect block above it. Adding `/m` changes
// exactly one thing: the session gets REFRESHED on mobile requests. Without
// that, `lib/supabase-server.ts` cannot persist a refreshed token from a Server
// Component, so a stale token made this layout's getUser() return null, this
// file redirected to /sign-in, and middleware bounced that to /dashboard —
// the field app landing in the desktop one.
//
// Still true and still worth stating:
//   - §1: "A desktop browser opening /m gets the mobile shell; that is intended
//     and is how it gets tested." There is no viewport or user-agent check here,
//     deliberately — "a viewport or user-agent check is NOT the router."
//   - Nothing in M6M rules on what an expired SUBSCRIPTION should do to a
//     phone. That question is still open — it is simply not answered by the
//     matcher, which was the confusion.
// ---------------------------------------------------------------------------

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  // `first_name, last_name` were selected here for the app-bar avatar and are
  // gone with it (D-36). M-30 (§4.13.7) will bind the signed-in name to
  // getMyMember(), which is the right source; it is not this layout's job.
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    redirect('/sign-in');
  }

  const [companyResult, members] = await Promise.all([
    supabase.from('companies').select('name').eq('id', profile.company_id).single(),
    // §3.3's Team tile carries "(count)". Through the service layer, never a
    // direct query from a component.
    getMembers().catch(() => null),
  ]);

  return (
    <>
      {/* §7.2 — the service worker registers from THIS layout (A-26d), so it
          exists exactly where /m exists and nowhere else. */}
      <RegisterSw />
      <MobileShell
        companyName={companyResult.data?.name ?? 'My Company'}
        teamCount={members?.length ?? null}
      >
        {children}
      </MobileShell>
    </>
  );
}
