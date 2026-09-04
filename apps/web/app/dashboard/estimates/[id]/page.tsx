import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getCompanyTimezone } from '@/lib/services/company';
import { getUploaderNames } from '@/lib/services/photos';
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

  // 19b/R10 [S103]: the estimator is READ-ONLY — resolved from estimates.
  // created_by, never edited. getUploaderNames imports next/headers via
  // supabase-server, so it CANNOT be called from the client DetailsTab; resolve
  // it here (server) and thread it down like companyTimeZone. Both reads are
  // caller-RLS-scoped.
  const { data: est } = await supabase
    .from('estimates')
    .select('created_by')
    .eq('id', params.id)
    .maybeSingle();
  let estimatorName: string | null = null;
  if (est?.created_by) {
    const names = await getUploaderNames([est.created_by]);
    estimatorName = names.get(est.created_by) ?? null;
  }

  return (
    <EstimateBuilder
      estimateId={params.id}
      role={profile.role as 'owner' | 'admin' | 'project_manager'}
      userId={user.id}
      companyTimeZone={companyTimeZone}
      estimatorName={estimatorName}
    />
  );
}
