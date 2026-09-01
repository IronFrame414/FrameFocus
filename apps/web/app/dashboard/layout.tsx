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

  // Option 2 [perf/order] — these four self-scope via RLS (get_my_company_id /
  // get_my_member_id), so NONE of them depends on the JS `profile` object below.
  // Start them here, concurrently with the profiles fetch, rather than after it,
  // so the profiles round-trip overlaps them instead of blocking them. The order
  // in which they START changes; what any of them RETURNS does not — so §2's
  // equivalence condition is untouched. Safe to launch before the guard: each of
  // the four swallows its own errors (null / 0 / defaults), so none can reject
  // and dangle if the guard below redirects.
  const openSessionP = getOpenSession();
  const myMemberP = getMyMember();
  const timeSettingsP = getCompanyTimeSettings();
  const unreadCountP = getUnreadCount();

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
  // ND-12 — the sidebar badge swallows its own errors and returns 0, so a failed
  // count hides the badge rather than breaking the shell. companies.name is the
  // only member that needed profile.company_id, so it is the only one still
  // started here; the other four were launched above and are awaited here.
  const [company, openSession, myMember, timeSettings, unreadCount] = await Promise.all([
    supabase.from('companies').select('name').eq('id', profile.company_id).single(),
    openSessionP,
    myMemberP,
    timeSettingsP,
    unreadCountP,
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
