import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getOpenSession } from '@/lib/services/time-tracking';
import { getMyMember } from '@/lib/services/members';
import { getCompanyTimezone } from '@/lib/services/company';
import { DashboardShell } from './dashboard-shell';

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
  const [company, openSession, myMember, timeZone] = await Promise.all([
    supabase.from('companies').select('name').eq('id', profile.company_id).single(),
    getOpenSession(),
    getMyMember(),
    getCompanyTimezone(),
  ]);

  return (
    <DashboardShell
      userName={`${profile.first_name} ${profile.last_name}`}
      userRole={profile.role}
      companyName={company.data?.name ?? 'My Company'}
      openSession={openSession}
      myMemberId={myMember?.id ?? null}
      timeZone={timeZone}
    >
      {children}
    </DashboardShell>
  );
}
