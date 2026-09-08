import { createClient } from '@/lib/supabase-server';
import { getFileCategories, getFiles } from '@/lib/services/files';
import { getActiveTags } from '@/lib/services/tag-options';
import FilesList from './files-list';
import { ArchivePanel } from './archive-panel';

export default async function ProjectFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  // The archive panel is Owner/Admin (spec §4 flow step 1); the role decides
  // whether it renders, the API route enforces the same rule underneath.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    role = profile?.role ?? null;
  }
  const canArchive = role === 'owner' || role === 'admin';
  // M3-05 [S157] — these two reads are INDEPENDENT and were awaited in series,
  // so the page paid two round trips end to end for work that takes one. Same
  // shape as M1-03 (five sequential reads for one row), smaller.
  const [files, activeTags, categories] = await Promise.all([
    getFiles({ project_id: projectId }),
    getActiveTags(),
    getFileCategories(projectId),
  ]);
  // Redesign 6.1 — labels come from file_categories (renameable); the file
  // row's `category` is the STABLE KEY. Unknown key → render the key itself.
  const categoryLabels: Record<string, string> = Object.fromEntries(
    categories.map((c) => [c.key, c.label])
  );

  return (
    <div style={{ padding: '2rem' }}>
      <FilesList
        files={files}
        projectId={projectId}
        activeTags={activeTags}
        categoryLabels={categoryLabels}
      />

      <ArchivePanel projectId={projectId} canArchive={canArchive} role={role ?? ''} />
    </div>
  );
}
