import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
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

  return (
    <EstimateBuilder
      estimateId={params.id}
      role={profile.role as 'owner' | 'admin' | 'project_manager'}
      userId={user.id}
    />
  );
}
