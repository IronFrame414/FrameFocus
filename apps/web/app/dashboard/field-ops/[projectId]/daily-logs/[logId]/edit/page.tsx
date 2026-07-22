import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getDailyLog } from '@/lib/services/daily-logs';
import { getMembers, getMyMember } from '@/lib/services/members';
import { FieldTabs } from '@/components/field/field-tabs';
import { LogForm } from '../../log-form';

// 6B-1 §4 — edit form. Authority mirrors the live daily_logs UPDATE policy
// (Phase 3 Q1): the author, or Owner/Admin. The page gate is UX; RLS is the
// enforcement. Saving regenerates the PDF (§2.3).

export default async function EditDailyLogPage({
  params,
}: {
  params: { projectId: string; logId: string };
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

  const [project, log, myMember, members] = await Promise.all([
    getProject(params.projectId),
    getDailyLog(params.logId),
    getMyMember(),
    getMembers(),
  ]);
  if (!project || project.is_deleted || !log || log.is_deleted) notFound();
  if (log.project_id !== params.projectId) notFound();

  const isAdminRole = profile.role === 'owner' || profile.role === 'admin';
  const canEdit = isAdminRole || (myMember != null && myMember.id === log.author_member_id);
  if (!canEdit) redirect(`/dashboard/field-ops/${params.projectId}/daily-logs/${params.logId}`);

  return (
    <div>
      <div className="mb-2 font-mono text-[12px] font-medium text-[#9aa1ac]">
        <Link href="/dashboard/projects" className="hover:text-[#14213d]">
          Projects
        </Link>{' '}
        /{' '}
        <Link href={`/dashboard/projects/${project.id}`} className="hover:text-[#14213d]">
          {project.name}
        </Link>{' '}
        /{' '}
        <Link
          href={`/dashboard/field-ops/${project.id}/daily-logs/${log.id}`}
          className="hover:text-[#14213d]"
        >
          Field / Daily Logs
        </Link>{' '}
        / <span className="text-[#6b7280]">Edit</span>
      </div>

      <h2 className="mb-4 text-[24px] font-extrabold tracking-[-0.01em] text-[#14213d]">
        Edit Daily Log
      </h2>

      <FieldTabs projectId={project.id} active="daily-logs" />

      <LogForm
        mode="edit"
        projectId={project.id}
        logId={log.id}
        roster={members.map((m) => ({
          id: m.id,
          display_name: m.display_name,
          member_type: m.member_type,
        }))}
        initialFields={{
          log_date: log.log_date,
          weather: log.weather,
          work_performed: log.work_performed,
          material_used: log.material_used,
          material_needed: log.material_needed,
          equipment_used: log.equipment_used,
          tasks_tomorrow: log.tasks_tomorrow,
          notes: log.notes,
          hazards_present: log.hazards_present,
          hazard_notes: log.hazard_notes,
        }}
        initialCrewIds={log.crew.map((c) => c.member_id)}
        initialSubs={log.sub_entries.map((s) => ({
          id: s.id,
          member_id: s.member_id,
          hours: s.hours,
          note: s.note,
        }))}
      />
    </div>
  );
}
