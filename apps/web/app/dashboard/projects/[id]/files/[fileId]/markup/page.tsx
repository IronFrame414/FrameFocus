import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFile, getSignedUrl } from '@/lib/services/files';
import type { MarkupData } from '@framefocus/shared/types/markup';
import MarkupEditor from './markup-editor';
import { getMyProfile } from '@/lib/services/profiles';
import { canDeletePhoto } from '@/lib/photos/delete-permission';
import { DeletePhotoButton } from './delete-photo-button';

export default async function MarkupPage({
  params,
}: {
  params: Promise<{ id: string; fileId: string }>;
}) {
  const { id: projectId, fileId } = await params;

  const file = await getFile(fileId);
  if (!file) notFound();

  // Markup only makes sense for images. PDFs, docs, etc. don't get a markup editor.
  if (!file.mime_type?.startsWith('image/')) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: '#a00', marginBottom: '1rem' }}>
          Markup is only available for image files. This file is {file.mime_type ?? 'unknown'}.
        </p>
        <Link href={`/dashboard/projects/${projectId}/files`} style={{ color: '#06c' }}>
          ← Back to files
        </Link>
      </div>
    );
  }

  const imageUrl = await getSignedUrl(file.file_path, 3600);
  if (!imageUrl) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: '#a00', marginBottom: '1rem' }}>
          Could not load image. Try refreshing the page.
        </p>
        <Link href={`/dashboard/projects/${projectId}/files`} style={{ color: '#06c' }}>
          ← Back to files
        </Link>
      </div>
    );
  }

  // markup_data is JSONB in the DB. Treat null/missing as "start fresh".
  // The editor will populate imageWidth/imageHeight from the loaded image
  // if initialMarkup is null.
  const initialMarkup = (file.markup_data as MarkupData | null) ?? null;

  // C-11 [S115] — the one rule /m reads too (lib/photos/delete-permission).
  const me = await getMyProfile();
  const canDelete = canDeletePhoto(me?.role);

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link
          href={`/dashboard/projects/${projectId}/files`}
          style={{ color: '#06c', textDecoration: 'none', fontSize: '0.875rem' }}
        >
          ← Back to files
        </Link>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          margin: '0 0 1rem 0',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Markup: {file.file_name}</h1>
        {canDelete && <DeletePhotoButton fileId={fileId} projectId={projectId} />}
      </div>
      {/* filePath is passed for #129 [S122]: the editor writes the flattened
          derivative beside the original, and derivativePathFor() needs the
          storage path — the signed imageUrl cannot be turned back into one. */}
      <MarkupEditor
        fileId={fileId}
        filePath={file.file_path}
        imageUrl={imageUrl}
        initialMarkup={initialMarkup}
      />
    </div>
  );
}
