import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getSubcontractors } from '@/lib/services/subcontractors';
import { CatalogForm } from '../catalog-form';

export default async function NewCatalogItemPage() {
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
    redirect('/dashboard/catalog');
  }

  const vendors = (await getSubcontractors({ sub_type: 'vendor' })).map((v) => ({
    id: v.id,
    company_name: v.company_name,
  }));

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        Add Catalog Item
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.875rem' }}>
        Add a material with a known unit cost to your catalog
      </p>
      <CatalogForm vendors={vendors} />
    </div>
  );
}
