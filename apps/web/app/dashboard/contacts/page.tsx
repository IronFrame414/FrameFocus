import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getContacts } from '@/lib/services/contacts';
import { ContactsList } from './contacts-list';

/**
 * 14c Contacts (desktop-redesign §8.3). Two new server-grouped reads feed the
 * two new columns; everything else is the S158 list, restyled client-side.
 */
export default async function ContactsPage() {
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

  const contacts = await getContacts();

  // ── Jobs (§8.3) — BOTH ARMS, grouped. `projects.contact_id` AND the
  // `project_contacts` junction: `is_client_of_project()` honours both, and
  // `getPortalAccountsForProject()` walks exactly this pair. One arm alone
  // undercounts. Distinct project ids across the union.
  const [directProjects, junctionRows] = await Promise.all([
    supabase.from('projects').select('id, contact_id').eq('is_deleted', false).not('contact_id', 'is', null),
    supabase.from('project_contacts').select('project_id, contact_id'),
  ]);
  const jobsByContact = new Map<string, Set<string>>();
  const addJob = (contactId: string | null, projectId: string) => {
    if (!contactId) return;
    if (!jobsByContact.has(contactId)) jobsByContact.set(contactId, new Set());
    jobsByContact.get(contactId)!.add(projectId);
  };
  for (const p of directProjects.data ?? []) addJob(p.contact_id, p.id);
  for (const j of junctionRows.data ?? []) addJob(j.contact_id, j.project_id);
  const jobs: Record<string, number> = {};
  for (const [contactId, ids] of jobsByContact) jobs[contactId] = ids.size;

  // ── Client portal (§8.3) — the company-wide derivation (the existing one is
  // project-scoped; this is the new read). A profiles row joined by contact_id
  // carries the stored state; "Not invited" is the DERIVED fifth state (no
  // profiles row), and invitations.contact_id separates invited-not-accepted
  // from never-invited. Both reads are caller-RLS-scoped.
  const [portalProfiles, invitations] = await Promise.all([
    supabase
      .from('profiles')
      .select('contact_id, client_access_state')
      .eq('is_deleted', false)
      .not('contact_id', 'is', null),
    supabase.from('invitations').select('contact_id').not('contact_id', 'is', null),
  ]);
  const portal: Record<string, string> = {};
  for (const row of invitations.data ?? []) {
    if (row.contact_id) portal[row.contact_id] = 'invited';
  }
  for (const row of portalProfiles.data ?? []) {
    // A profile wins over an invitation — acceptance created it.
    if (row.contact_id && row.client_access_state) portal[row.contact_id] = row.client_access_state;
  }

  return (
    <ContactsList
      contacts={contacts}
      canEdit={!!profile && ['owner', 'admin', 'project_manager'].includes(profile.role)}
      jobs={jobs}
      portal={portal}
    />
  );
}
