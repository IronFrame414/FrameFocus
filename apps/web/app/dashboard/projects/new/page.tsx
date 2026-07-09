import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getContacts } from '@/lib/services/contacts';
import { NewProjectForm } from './new-project-form';

export default async function NewProjectPage() {
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

  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    redirect('/dashboard/projects');
  }

  const contacts = await getContacts();

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        New Project
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Create a project manually — no source estimate. The project number is drawn from the
        shared estimate/project sequence.
      </p>
      <NewProjectForm
        contacts={contacts.map((c) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}${c.company_name ? ` (${c.company_name})` : ''}`,
        }))}
      />
    </div>
  );
}
