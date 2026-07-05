import { notFound } from 'next/navigation';
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

  return (
    <div>
      <ProjectHeader project={project} />
      {children}
    </div>
  );
}
