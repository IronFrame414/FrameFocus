import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getSubcontractor, getSubcontractorFinancials } from '@/lib/services/subcontractors';
import { SubcontractorForm } from '../../subcontractor-form';

export default async function EditSubcontractorPage({ params }: { params: Promise<{ id: string }> }) {
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
    redirect('/dashboard/subcontractors');
  }

  const sub = await getSubcontractor(id);
  if (!sub) redirect('/dashboard/subcontractors');

  // #132 — the rate/markup/EIN half lives on `subcontractor_financials` and is
  // Owner/Admin by RLS. A PM reaches this page (the role check above admits
  // them) and this read returns null for them, which is the floor working
  // rather than a missing row.
  const canEditFinancials = ['owner', 'admin'].includes(profile.role);
  const financials = canEditFinancials ? await getSubcontractorFinancials(id) : null;

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        Edit Sub / Vendor
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Update {sub.company_name}
      </p>
      <SubcontractorForm
        existing={sub}
        financials={financials}
        canEditFinancials={canEditFinancials}
      />
    </div>
  );
}
