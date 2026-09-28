import { managesProjectOperations } from '@framefocus/shared/constants/roles';
import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getProjectContacts } from '@/lib/services/project-contacts';
import { getContacts } from '@/lib/services/contacts';
import { getPortalAccountsForProject } from '@/lib/services/client-portal';
import { ContactsPanel } from './contacts-panel';
import { PortalPanel } from './portal-panel';
import { contactNameWithCompany } from '@framefocus/shared/utils/contact-name';

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

  const [projectContacts, allContacts, portalRows, projectRow] = await Promise.all([
    getProjectContacts(params.id),
    getContacts(),
    getPortalAccountsForProject(supabase, params.id),
    // §2 — the current client, so the panel can label it and confirm before a
    // money-routing change replaces it.
    supabase.from('projects').select('contact_id').eq('id', params.id).maybeSingle(),
  ]);
  const currentClientContactId =
    (projectRow.data as { contact_id: string | null } | null)?.contact_id ?? null;

  const canManage = managesProjectOperations(profile.role);
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
          name: contactNameWithCompany(c),
          contact_type: c.contact_type,
        }))}
        canManage={canManage}
        currentClientContactId={currentClientContactId}
      />
      <PortalPanel projectId={params.id} rows={portalRows} canManage={canManagePortal} />
    </>
  );
}
