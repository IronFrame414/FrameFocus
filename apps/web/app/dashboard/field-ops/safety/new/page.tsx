import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProjects } from '@/lib/services/projects';
import { getMembers } from '@/lib/services/members';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { IncidentForm } from '@/components/field/incident-form';

// 6C — company-level incident create: project picker including "No project
// (shop/yard)" (Phase 3 Q3). Any member files; RLS scopes the picker.

export default async function NewIncidentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [projects, members, { timezone }] = await Promise.all([
    getProjects(),
    getMembers(),
    getCompanyTimeSettings(),
  ]);
  const todayYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  return (
    <div>
      <div className="mb-2 font-mono text-[12px] font-medium text-[#9aa1ac]">
        <Link href="/dashboard/field-ops/safety" className="hover:text-[#14213d]">
          Field Ops / Safety
        </Link>{' '}
        / <span className="text-[#6b7280]">Report incident</span>
      </div>

      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        Report an incident
      </h2>

      <IncidentForm
        mode="create"
        projects={projects
          .filter((p) => p.status !== 'archived' && p.status !== 'cancelled')
          .map((p) => ({ id: p.id, name: p.name }))}
        roster={members.map((m) => ({ id: m.id, display_name: m.display_name }))}
        initialFields={{
          project_id: null,
          incident_date: todayYmd,
          incident_type: 'injury',
          description: '',
          prevention_notes: null,
        }}
        initialInjuries={[]}
        initialWitnesses={[]}
      />
    </div>
  );
}
