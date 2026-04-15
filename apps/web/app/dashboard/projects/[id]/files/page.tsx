import Link from 'next/link';
import { getFiles } from '@/lib/services/files';
import FileRowActions from './file-row-actions';

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

      {files.length === 0 ? (
        <p style={{ color: '#666' }}>No files uploaded yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '0.75rem' }}>Name</th>
              <th style={{ padding: '0.75rem' }}>Category</th>
              <th style={{ padding: '0.75rem' }}>Size</th>
              <th style={{ padding: '0.75rem' }}>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.75rem' }}>{f.file_name}</td>
                <td style={{ padding: '0.75rem' }}>{f.category}</td>
                <td style={{ padding: '0.75rem' }}>{(f.file_size / 1024).toFixed(1)} KB</td>
                <td style={{ padding: '0.75rem' }}>
                  {f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <FileRowActions
                    fileId={f.id}
                    filePath={f.file_path}
                    mimeType={f.mime_type}
                    projectId={projectId}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
