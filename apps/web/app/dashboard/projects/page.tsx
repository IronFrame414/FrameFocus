import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getProjects } from '@/lib/services/projects';
import type { ProjectStatus } from '@/lib/services/projects';
import { ProjectsList } from './projects-list';

const STATUSES: ProjectStatus[] = ['active', 'on_hold', 'complete', 'archived', 'cancelled'];

/**
 * ui-03 — 1a projects list. Fetches the full (RLS-scoped) list once so the
 * subtitle counts and the freshly-built search filter client-side; the status
 * chips keep the ?status= URL contract. Financial floor (ui-01 §11): the
 * Contract column is Owner/Admin only — the grid reflows for gated roles.
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { status?: string };
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

  const status = STATUSES.includes(searchParams.status as ProjectStatus)
    ? (searchParams.status as ProjectStatus)
    : undefined;

  // RLS scopes visibility: Owner/Admin see all; PM/Foreman/Crew see assigned.
  const projects = await getProjects();

  const canCreate = ['owner', 'admin', 'project_manager'].includes(profile.role);
  const canSeeFinancials = profile.role === 'owner' || profile.role === 'admin';

  return (
    <ProjectsList
      projects={projects}
      currentStatus={status ?? 'all'}
      canCreate={canCreate}
      canSeeFinancials={canSeeFinancials}
    />
  );
}
