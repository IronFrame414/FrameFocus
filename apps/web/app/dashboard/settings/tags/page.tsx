import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getAllTags } from '@/lib/services/tag-options';
import { TagsManager } from './tags-manager';

export default async function TagsSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Owner/admin only — matches settings page pattern
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const tags = await getAllTags();

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Photo Tags</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Manage the tag list used to organize and AI-tag photos. Deactivated tags stop being applied
        to new uploads but remain on existing files.
      </p>
      <TagsManager initialTags={tags} />
    </div>
  );
}
