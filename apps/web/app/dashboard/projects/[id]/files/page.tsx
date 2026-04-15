import Link from 'next/link';
import { getFiles } from '@/lib/services/files';
import FileRow from './file-row';

export default async function ProjectFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const files = await getFiles({ project_id: projectId });

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
              <th style={{ padding: '0.75rem' }}>Size</th>
              <th style={{ padding: '0.75rem' }}>Uploaded</th>
              <th style={{ padding: '0.75rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <FileRow key={f.id} file={f} projectId={projectId} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
