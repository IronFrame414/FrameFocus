import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { SubcontractorForm } from '../subcontractor-form';

export default async function NewSubcontractorPage() {
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
    redirect('/dashboard/subcontractors');
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        Add Sub / Vendor
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Create a new subcontractor or vendor record
      </p>
      <SubcontractorForm />
    </div>
  );
}
