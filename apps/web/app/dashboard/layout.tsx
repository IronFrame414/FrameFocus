import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getOpenSession } from '@/lib/services/time-tracking';
import { getMyMember } from '@/lib/services/members';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { getUnreadCount } from '@/lib/services/notifications';
import { dashboardDeniedRedirect } from '@/lib/dashboard-access';
import { DashboardShell } from './dashboard-shell';
import { RegisterPushSw } from './register-push-sw';
import { ConfirmProvider } from '@/components/confirm/confirm-provider';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const { data: profile } = await supabase
    .from('profiles')
    // `id` [S126 slice 3] — the chat panel needs the caller's PROFILE id to
    // decide which bubbles are theirs. A mention recipient is a profile (ND-2)
    // and `chat_messages.author_profile_id` is a profile id, so `user.id` is
    // the wrong key here and would silently align every bubble left.
    .select('id, first_name, last_name, role, company_id')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    redirect('/sign-in');
  }

  // ⚠️ RULING A [Josh, S131] — the second half of M6M D-54.
  //
  // `middleware.ts` guards the same rule. This is NOT a redundant copy:
  //
  //  · a middleware matcher is a hand-maintained list, and the S107 `/m` gap is
  //    what one missing entry costs;
  //  · D-54 requires role-gated surfaces to be hidden AND route-guarded, and
  //    `dashboard-shell.tsx` only hides — its NAV_ITEMS filter drops the four
  //    gated items for a subcontractor and leaves ten reachable by URL.
  //
  // Both call `dashboardDeniedRedirect()` rather than testing the role list
  // themselves, so the two cannot come to different conclusions about who is
  // denied or where they go.
  //
  // This still protects no DATA. `/m`, the API routes and any direct PostgREST
  // call read the same tables regardless of what any layout decides — Ruling B
  // is what closes that, in RLS.
  const denied = dashboardDeniedRedirect(profile.role);
  if (denied) {
    redirect(denied);
  }

  // Global clock state (S85): fetched here so the header button works on
  // every dashboard page. App Router layouts don't refetch on client-side
  // navigation — freshness comes from router.refresh(), which every clock
  // mutation already triggers.
  const [company, openSession, myMember, timeSettings, unreadCount] = await Promise.all([
    supabase.from('companies').select('name').eq('id', profile.company_id).single(),
    getOpenSession(),
    getMyMember(),
    getCompanyTimeSettings(),
    // ND-12 — the sidebar badge. Swallows its own errors and returns 0, so a
    // failed count hides the badge rather than breaking the shell.
    getUnreadCount(),
  ]);

  return (
    <DashboardShell
      userName={`${profile.first_name} ${profile.last_name}`}
      userRole={profile.role}
      companyName={company.data?.name ?? 'My Company'}
      openSession={openSession}
      myMemberId={myMember?.id ?? null}
      timeZone={timeSettings.timezone}
      gpsMode={timeSettings.gpsClockMode}
      unreadCount={unreadCount}
      myProfileId={profile.id}
    >
      {/* ND-4 — registers the push-only desktop worker. Renders nothing, and
          registering is not subscribing: no prompt fires from here. */}
      <RegisterPushSw />
      {/* S175 item 9 — the shared confirm/alert overlay behind useConfirm()/
          useAlert(), replacing native window.confirm/alert across the dashboard.
          Mounted here because every call site lives under /dashboard. */}
      <ConfirmProvider>{children}</ConfirmProvider>
    </DashboardShell>
  );
}
