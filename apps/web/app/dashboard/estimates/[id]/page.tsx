import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getCompanyTimezone } from '@/lib/services/company';
import { EstimateBuilder } from './estimate-builder';

interface PageProps {
  params: { id: string };
}

export default async function EstimateBuilderPage({ params }: PageProps) {
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
    redirect('/dashboard');
  }

  // #116 [S103]: the real per-company calendar timezone, threaded to the
  // client tabs so their date defaults are the company day — not UTC, and not
  // a hardcoded fallback. getCompanyTimezone falls back to America/New_York
  // when the column is null (matching getCompanyTimeSettings); never UTC.
  const companyTimeZone = await getCompanyTimezone();

  return (
    <EstimateBuilder
      estimateId={params.id}
      role={profile.role as 'owner' | 'admin' | 'project_manager'}
      userId={user.id}
      companyTimeZone={companyTimeZone}
    />
  );
}
