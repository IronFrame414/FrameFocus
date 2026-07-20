import { createClient } from '@/lib/supabase-server';
import { getCalendarEvents } from '@/lib/services/schedule';
import { getMyMember } from '@/lib/services/members';
import { CompanyCalendar } from './company-calendar';
import { cardStyle, color, h2Style } from '@/lib/theme';

/**
 * ui-01 §5a — standalone Schedule route. CompanyCalendar was MOVED here from
 * the dashboard (not copied); the dashboard gets its own new schedule card in
 * ui-02. Same model both places: getCalendarEvents (tasks + general entries +
 * inspections). Crew sees own assignments only (5B §5.5b), unchanged.
 */
export default async function SchedulePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user?.id ?? '')
    .single();

  const isCrew = profile?.role === 'crew_member' || profile?.role === 'subcontractor';
  const myMember = isCrew ? await getMyMember() : null;

  const events = await getCalendarEvents({ ownMemberId: myMember?.id });

  return (
    <div>
      <div style={{ marginBottom: '22px' }}>
        <h2 style={h2Style}>Schedule</h2>
        <p style={{ color: color.muted, fontSize: '14px', margin: '4px 0 0' }}>
          {isCrew ? 'Your assignments across all jobs' : 'All crews, subs, and inspections — every job'}
        </p>
      </div>

      <div style={{ ...cardStyle, padding: '18px 20px' }}>
        <CompanyCalendar events={events} />
      </div>
    </div>
  );
}
