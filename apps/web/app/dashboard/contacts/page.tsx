import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getContacts } from '@/lib/services/contacts';
import { ContactsList } from './contacts-list';

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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Contacts
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Manage your leads and clients
          </p>
        </div>
        {profile && ['owner', 'admin', 'project_manager'].includes(profile.role) && (
          
            href="/dashboard/contacts/new"
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: '#2563eb',
              borderRadius: '0.375rem',
              textDecoration: 'none',
            }}
          >
            + Add Contact
          </a>
        )}
      </div>
      <ContactsList
        contacts={contacts}
        canEdit={!!profile && ['owner', 'admin', 'project_manager'].includes(profile.role)}
      />
    </div>
  );
}
