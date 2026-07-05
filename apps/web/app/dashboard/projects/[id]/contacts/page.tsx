import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getProjectContacts } from '@/lib/services/project-contacts';
import { getContacts } from '@/lib/services/contacts';
import { ContactsPanel } from './contacts-panel';

export default async function ProjectContactsPage({ params }: { params: { id: string } }) {
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

  const [projectContacts, allContacts] = await Promise.all([
    getProjectContacts(params.id),
    getContacts(),
  ]);

  const canManage = ['owner', 'admin', 'project_manager'].includes(profile.role);

  return (
    <ContactsPanel
      projectId={params.id}
      projectContacts={projectContacts}
      allContacts={allContacts.map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}${c.company_name ? ` (${c.company_name})` : ''}`,
        contact_type: c.contact_type,
      }))}
      canManage={canManage}
    />
  );
}
