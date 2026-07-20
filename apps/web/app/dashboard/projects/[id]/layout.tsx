import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import { ProjectHeader } from './project-header';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const project = await getProject(params.id);

  if (!project) {
    notFound();
  }

  // Role for the header's action button (ui-04 §4 title row).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .single()
    : { data: null };

  const role = profile?.role ?? '';

  return (
    <div>
      <ProjectHeader
        project={project}
        canManage={['owner', 'admin', 'project_manager'].includes(role)}
      />
      {children}
    </div>
  );
}
