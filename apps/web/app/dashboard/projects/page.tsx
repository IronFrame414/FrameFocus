import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getProjects } from '@/lib/services/projects';
import type { ProjectStatus } from '@/lib/services/projects';
import { ProjectsList } from './projects-list';

const STATUSES: ProjectStatus[] = ['active', 'on_hold', 'complete', 'archived', 'cancelled'];

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
  const projects = await getProjects(status ? { status } : undefined);

  const canCreate = ['owner', 'admin', 'project_manager'].includes(profile.role);

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
            Projects
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Jobs in progress, on hold, and completed
          </p>
        </div>
        {canCreate && (
          <a
            href="/dashboard/projects/new"
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
            + New Project
          </a>
        )}
      </div>
      <ProjectsList projects={projects} currentStatus={status ?? 'all'} />
    </div>
  );
}
