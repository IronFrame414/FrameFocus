import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { getDailyLogs } from '@/lib/services/daily-logs';
import DailyLogsList from './daily-logs-list';
import { getMaterialSignouts, signoutToday } from '@/lib/services/material-signouts';
import { isActive, isOverdue } from '@/lib/material-signouts/signout';
import { SignoutAttention } from '@/components/material-signouts/signout-attention';

// 6B-1 §3a — per-project daily-log list. Date, author, hazard badge, newest
// first; multiple logs per project-day are legal and all show. Rendering moved
// to the client `DailyLogsList` for the 14-anatomy search + hazard filter
// [S105b item 5]; this server page stays the auth + fetch shell.

export default async function DailyLogListPage({
  params,
}: {
  params: { projectId: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const project = await getProject(params.projectId);
  if (!project || project.is_deleted) notFound();

  const [logs, signouts, today] = await Promise.all([
    getDailyLogs(params.projectId),
    getMaterialSignouts(params.projectId),
    signoutToday(),
  ]);

  return (
    <DailyLogsList
      project={{ id: project.id, name: project.name }}
      logs={logs}
      notice={
        <SignoutAttention
          projectId={project.id}
          active={signouts.filter(isActive).length}
          overdue={signouts.filter((s) => isOverdue(s, today)).length}
        />
      }
    />
  );
}
