import { createClient } from '@/lib/supabase-server';
import UploadForm from './upload-form';

export default async function UploadFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  // The limit notice names Empty Trash for Owner/Admin and "ask an
  // Owner/Admin" for everyone else — the role decides which sentence renders;
  // RLS enforces the rule underneath either way.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let canEmptyTrash = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();
    canEmptyTrash = profile?.role === 'owner' || profile?.role === 'admin';
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem' }}>Upload File</h1>
      <UploadForm projectId={projectId} canEmptyTrash={canEmptyTrash} />
    </div>
  );
}
