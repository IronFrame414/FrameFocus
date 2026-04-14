import UploadForm from './upload-form';

export default async function UploadFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Upload File</h1>
      <UploadForm projectId={projectId} />
    </div>
  );
}
