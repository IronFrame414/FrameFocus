import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getFiles } from '@/lib/services/files';
import TrashRow from './trash-row';
import { EmptyTrashButton } from './empty-trash-button';

export default async function ProjectFilesTrashPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (!profile) redirect('/sign-in');

  const canPermanentDelete = profile.role === 'owner' || profile.role === 'admin';

  // Fetch only soft-deleted files for this project. [M3-05, S157]
  // This asked for `include_deleted: true` and filtered in memory, which pulled
  // every LIVE file in the project to render the deleted ones — and, once
  // `getFiles` became bounded, could have pushed the deleted rows out of the
  // response entirely. The filter belongs in the query.
  const deletedFiles = await getFiles({ project_id: projectId, only_deleted: true });

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
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Trash</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {canPermanentDelete && (
            <EmptyTrashButton projectId={projectId} count={deletedFiles.length} />
          )}
          <Link
            href={`/dashboard/projects/${projectId}/files`}
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
            ← Back to Files
          </Link>
        </div>
      </div>

      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Trashed files still count toward your storage. Files in trash for 6 months are permanently
        deleted automatically.
      </p>

      {deletedFiles.length === 0 ? (
        <p style={{ color: '#666' }}>Trash is empty.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem' }}>Name</th>
              <th style={{ padding: '0.75rem' }}>Category</th>
              <th style={{ padding: '0.75rem' }}>Size</th>
              <th style={{ padding: '0.75rem' }}>Deleted</th>
              <th style={{ padding: '0.75rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {deletedFiles.map((f) => (
              <TrashRow key={f.id} file={f} canPermanentDelete={canPermanentDelete} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
