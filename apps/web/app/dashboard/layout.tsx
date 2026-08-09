import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getOpenSession } from '@/lib/services/time-tracking';
import { getMyMember } from '@/lib/services/members';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { DashboardShell } from './dashboard-shell';
import { RegisterPushSw } from './register-push-sw';

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
    .select('first_name, last_name, role, company_id')
    .eq('user_id', user.id)
    .single();

  if (!profile) {
    redirect('/sign-in');
  }

  // Global clock state (S85): fetched here so the header button works on
  // every dashboard page. App Router layouts don't refetch on client-side
  // navigation — freshness comes from router.refresh(), which every clock
  // mutation already triggers.
  const [company, openSession, myMember, timeSettings] = await Promise.all([
    supabase.from('companies').select('name').eq('id', profile.company_id).single(),
    getOpenSession(),
    getMyMember(),
    getCompanyTimeSettings(),
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
    >
      {/* ND-4 — registers the push-only desktop worker. Renders nothing, and
          registering is not subscribing: no prompt fires from here. */}
      <RegisterPushSw />
      {children}
    </DashboardShell>
  );
}
