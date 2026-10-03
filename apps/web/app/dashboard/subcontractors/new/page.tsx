import { createClient, getRequestUser } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { SubcontractorForm } from '../subcontractor-form';
import { editsSubDirectory } from '@framefocus/shared/constants/roles';

export default async function NewSubcontractorPage() {
  const supabase = await createClient();

  const user = await getRequestUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  // [S114 C-10] one predicate (SUB_DIRECTORY_EDIT), same answer: O/A/PM. Was a hand list.
  if (!profile || !editsSubDirectory(profile.role)) {
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
      {/* #132 — a PM may create a sub but not set its rate, markup or EIN. */}
      <SubcontractorForm canEditFinancials={['owner', 'admin'].includes(profile.role)} />
    </div>
  );
}
