import { notFound } from 'next/navigation';
import { createClient, getRequestUser } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { ProjectHeader } from './project-header';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  // H-2 [S115] — the project row and the caller's role are independent reads,
  // so they are fetched together. `getRequestUser` and `getProject` are
  // per-request memoized: the dashboard layout above already asked the Auth
  // server, and the page below reads the same project row — neither is asked
  // twice. The notFound() decision is unchanged.
  const supabase = await createClient();
  const user = await getRequestUser();
  const [project, { data: profile }] = await Promise.all([
    getProject(params.id),
    user
      ? supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .eq('is_deleted', false)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  if (!project) {
    notFound();
  }

  // Role for the header's action button (ui-04 §4 title row).

  const role = profile?.role ?? '';

  return (
    <div>
      <ProjectHeader
        project={project}
        // [S111] "+ Change Order" — a Project Executive has the CO write arms.
        canManage={['owner', 'admin', 'project_executive', 'project_manager'].includes(role)}
        role={role}
      />
      {children}
    </div>
  );
}
