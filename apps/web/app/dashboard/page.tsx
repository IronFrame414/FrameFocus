import { createClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { getCalendarEvents } from '@/lib/services/schedule';
import { getMyMember } from '@/lib/services/members';
import { getProjects } from '@/lib/services/projects';
import { CompanyCalendar } from './company-calendar';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, role')
    .eq('user_id', user?.id ?? '')
    .single();

  const isCrew = profile?.role === 'crew_member' || profile?.role === 'subcontractor';
  const myMember = isCrew ? await getMyMember() : null;

  // Company-wide calendar (5B §8): the "who's free / who's slammed" view.
  // Crew sees own assignments only (§5.5b).
  const [events, activeProjects] = await Promise.all([
    getCalendarEvents({ ownMemberId: myMember?.id }),
    getProjects({ status: 'active' }),
  ]);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Welcome back, {profile?.first_name ?? 'there'}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            {activeProjects.length} active project{activeProjects.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/dashboard/projects"
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: '#2563eb',
            borderRadius: '0.375rem',
            textDecoration: 'none',
          }}
        >
          View Projects
        </Link>
      </div>

      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          padding: '1.25rem',
        }}
      >
        <div
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '0.75rem',
          }}
        >
          {isCrew ? 'My Schedule' : 'Employee Calendar — All Jobs'}
        </div>
        <CompanyCalendar events={events} />
      </div>
    </div>
  );
}
