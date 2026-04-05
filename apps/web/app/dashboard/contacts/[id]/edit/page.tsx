import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getContact } from '@/lib/services/contacts';
import { ContactForm } from '../../contact-form';

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    redirect('/dashboard/contacts');
  }

  const contact = await getContact(id);
  if (!contact) redirect('/dashboard/contacts');

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        Edit Contact
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Update {contact.first_name} {contact.last_name}
      </p>
      <ContactForm existing={contact} />
    </div>
  );
}
