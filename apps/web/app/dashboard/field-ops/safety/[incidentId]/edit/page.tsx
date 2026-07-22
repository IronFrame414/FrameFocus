import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getIncident } from '@/lib/services/safety';
import { getMembers, getMyMember } from '@/lib/services/members';
import { IncidentForm } from '@/components/field/incident-form';

// 6C — incident edit (reporter or Owner/Admin; page gate mirrors live RLS).
// Treatment details arrive late — the record never locks (§2). Saving
// regenerates the PDF. status/outcome are NOT here — they live on the
// detail page's Owner/Admin resolution card.

export default async function EditIncidentPage({
  params,
}: {
  params: { incidentId: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');

  const [incident, myMember, members] = await Promise.all([
    getIncident(params.incidentId),
    getMyMember(),
    getMembers(),
  ]);
  if (!incident || incident.is_deleted) notFound();

  const isAdminRole = profile.role === 'owner' || profile.role === 'admin';
  const canEdit =
    isAdminRole || (myMember != null && myMember.id === incident.reported_by_member_id);
  if (!canEdit) redirect(`/dashboard/field-ops/safety/${params.incidentId}`);

  return (
    <div>
      <div className="mb-2 font-mono text-[12px] font-medium text-[#9aa1ac]">
        <Link href="/dashboard/field-ops/safety" className="hover:text-[#14213d]">
          Field Ops / Safety
        </Link>{' '}
        /{' '}
        <Link
          href={`/dashboard/field-ops/safety/${incident.id}`}
          className="hover:text-[#14213d]"
        >
          {incident.incident_date}
        </Link>{' '}
        / <span className="text-[#6b7280]">Edit</span>
      </div>

      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        Edit incident
      </h2>

      <IncidentForm
        mode="edit"
        incidentId={incident.id}
        projects={null}
        fixedProjectId={incident.project_id}
        roster={members.map((m) => ({ id: m.id, display_name: m.display_name }))}
        initialFields={{
          project_id: incident.project_id,
          incident_date: incident.incident_date,
          incident_type: incident.incident_type,
          description: incident.description,
          prevention_notes: incident.prevention_notes,
        }}
        initialInjuries={incident.injuries.map((p) => ({
          id: p.id,
          member_id: p.member_id,
          name: p.injured_name,
          treatment_sought: p.treatment_sought,
          treatment_notes: p.treatment_notes,
        }))}
        initialWitnesses={incident.witnesses.map((w) => ({
          id: w.id,
          member_id: w.member_id,
          name: w.witness_name,
        }))}
      />
    </div>
  );
}
