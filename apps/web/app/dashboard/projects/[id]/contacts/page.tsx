import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getProjectContacts } from '@/lib/services/project-contacts';
import { getContacts } from '@/lib/services/contacts';
import { getPortalAccountsForProject } from '@/lib/services/client-portal';
import { ContactsPanel } from './contacts-panel';
import { PortalPanel } from './portal-panel';

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

  const [projectContacts, allContacts, portalRows] = await Promise.all([
    getProjectContacts(params.id),
    getContacts(),
    getPortalAccountsForProject(supabase, params.id),
  ]);

  const canManage = ['owner', 'admin', 'project_manager'].includes(profile.role);
  // ⚠️ NARROWER THAN `canManage`, on purpose. Attaching a contact is a PM job;
  // inviting a client and changing R17 state are Owner/Admin, enforced by
  // `invitations_insert_owner_admin` and by `profiles` having no PM update arm.
  // Passing `canManage` here would render controls that always fail.
  const canManagePortal = ['owner', 'admin'].includes(profile.role);

  return (
    <>
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
      <PortalPanel projectId={params.id} rows={portalRows} canManage={canManagePortal} />
    </>
  );
}
