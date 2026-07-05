import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getPunchLists } from '@/lib/services/punch';
import { getMembers } from '@/lib/services/members';
import { getFiles } from '@/lib/services/files';
import { PunchPanel } from './punch-panel';

export default async function ProjectPunchPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');

  const [lists, members, photos] = await Promise.all([
    getPunchLists(params.id),
    getMembers(),
    // Project photos (Module 3 reuse) for reference/completion picks — one
    // file, no duplicate: the same row shows in project photos and on the item.
    getFiles({ project_id: params.id, category: 'photos' }),
  ]);

  return (
    <PunchPanel
      projectId={params.id}
      lists={lists}
      members={members.map((m) => ({ id: m.id, display_name: m.display_name }))}
      photos={photos.map((f) => ({ id: f.id, name: f.file_name }))}
      role={profile.role}
    />
  );
}
