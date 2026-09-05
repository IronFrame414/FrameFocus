import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getMembers } from '@/lib/services/members';
import { getUnreadCount } from '@/lib/services/notifications';
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
//     ⚠️ §1 AMENDED [S121] for the SIGN-IN LANDING only (lib/device.ts): a
//     phone signing in defaults to /m. That decides a DESTINATION, never a
//     route's ownership — this layout still has no device check, and a desktop
//     opening /m still gets the mobile shell.
//   - Nothing in M6M rules on what an expired SUBSCRIPTION should do to a
//     phone. That question is still open — it is simply not answered by the
//     matcher, which was the confusion.
//
// ---------------------------------------------------------------------------
// AND THE GATE MUST SAY WHERE IT CAME FROM — `?next=/m` [S121]
// ---------------------------------------------------------------------------
// The redirects below used to target a bare '/sign-in', which threw the
// destination away. That made the phone symptom that looked like a second
// matcher bug and was not one:
//
//     GET /m -> (session lapsed) -> '/sign-in' -> user signs in
//            -> app/sign-in/page.tsx pushed '/dashboard'
//            -> the desktop app, on a handset
//
// cf1fe8a fixed a stale token being unable to REFRESH. It could not fix a
// refresh token that has genuinely expired, which is the ordinary state of a
// phone left alone for a week — and that is why a desktop, whose session
// refreshes constantly and so never touches /sign-in, "works fine".
//
// `?next=/m` and nothing deeper: a layout has no access to the request
// pathname in the App Router, so the specific screen the user asked for is not
// recoverable here without middleware growing a header for it. Returning to
// the field app's front door is the whole of the reported defect; the deep
// link is not, and is flagged rather than half-built. /m then continues to
// /m/timeclock (D-12) as it does for any other visit.
// ---------------------------------------------------------------------------

const SIGN_IN_BACK_TO_M = '/sign-in?next=%2Fm';

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SIGN_IN_BACK_TO_M);
  }

  // `first_name, last_name` were selected here for the app-bar avatar and are
  // gone with it (D-36). M-30 (§4.13.7) will bind the signed-in name to
  // getMyMember(), which is the right source; it is not this layout's job.
  const { data: profile } = await supabase
    .from('profiles')
    // `id` [S126 slice 5] — the chat overlay needs the caller's PROFILE id to
    // decide which bubbles are theirs. chat_messages.author_profile_id is a
    // profile id, so user.id is the wrong key and would align every bubble left.
    // `role` [#101] — gates the "Desktop site" toggle in the nav sheet.
    .select('id, company_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    redirect(SIGN_IN_BACK_TO_M);
  }

  const [companyResult, members, unreadCount] = await Promise.all([
    supabase.from('companies').select('name').eq('id', profile.company_id).single(),
    // §3.3's Team tile carries "(count)". Through the service layer, never a
    // direct query from a component.
    getMembers().catch(() => null),
    // ND-13 — the app-bar bell's badge. getUnreadCount() already swallows its
    // own errors and returns 0, so a failed count hides the badge rather than
    // breaking the shell it renders in: a wrong number is worse than none.
    getUnreadCount(),
  ]);

  return (
    <>
      {/* §7.2 — the service worker registers from THIS layout (A-26d), so it
          exists exactly where /m exists and nowhere else. */}
      <RegisterSw />
      <MobileShell
        companyName={companyResult.data?.name ?? 'My Company'}
        teamCount={members?.length ?? null}
        unreadCount={unreadCount}
        myProfileId={profile.id}
        role={profile.role}
      >
        {children}
      </MobileShell>
    </>
  );
}
