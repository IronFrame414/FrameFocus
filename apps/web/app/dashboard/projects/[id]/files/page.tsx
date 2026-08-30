import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { getFileCategories, getFiles } from '@/lib/services/files';
import { getActiveTags } from '@/lib/services/tag-options';
import FileRow from './file-row';
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Project Files</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link
            href={`/dashboard/projects/${projectId}/files/trash`}
            style={{
              padding: '0.5rem 1rem',
              background: '#fff',
              border: '1px solid #ddd',
              color: '#000',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            Trash
          </Link>
          <Link
            href={`/dashboard/projects/${projectId}/files/upload`}
            style={{
              padding: '0.5rem 1rem',
              background: '#000',
              color: '#fff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.875rem',
            }}
          >
            + Upload
          </Link>
        </div>
      </div>

      {files.length === 0 ? (
        <p style={{ color: '#666' }}>No files uploaded yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem', width: '2rem' }}></th>
              <th style={{ padding: '0.75rem' }}>Name</th>
              <th style={{ padding: '0.75rem' }}>Category</th>
              <th style={{ padding: '0.75rem' }}>Tags</th>
              <th style={{ padding: '0.75rem' }}>Size</th>
              <th style={{ padding: '0.75rem' }}>Uploaded</th>
              <th style={{ padding: '0.75rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                projectId={projectId}
                activeTags={activeTags}
                categoryLabel={categoryLabels[f.category] ?? f.category}
              />
            ))}
          </tbody>
        </table>
      )}

      <ArchivePanel projectId={projectId} canArchive={canArchive} role={role ?? ''} />
    </div>
  );
}
