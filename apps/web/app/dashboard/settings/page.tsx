import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getCompany } from '@/lib/services/company';
import { SettingsForm } from './settings-form';

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Check role — only owner and admin can access settings
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect('/dashboard');
  }

  const company = await getCompany();
  if (!company) redirect('/dashboard');

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        Company Settings
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Update your company information. This will appear on estimates, invoices, and client-facing
        documents.
      </p>
      <SettingsForm company={company} />
    </div>
  );
}
