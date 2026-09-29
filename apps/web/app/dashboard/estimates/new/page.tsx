import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { NewEstimateForm } from './new-estimate-form';
import { canAuthorEstimates } from '@/lib/estimate-access';

export default async function NewEstimatePage() {
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

  // [S119 D-2] the one author list (lib/estimate-access.ts), which now includes
  // the PE. _Superseded, quoted:_ `!['owner', 'admin', 'project_manager'].includes(profile.role)`
  if (!profile || !canAuthorEstimates(profile.role)) {
    redirect('/dashboard');
  }

  return (
    <div style={{ maxWidth: '560px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        New Estimate
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '2rem' }}>
        Pick the client and job site, then build the estimate.
      </p>
      <NewEstimateForm canClone={profile.role !== 'project_executive'} />
    </div>
  );
}
