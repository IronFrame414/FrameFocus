import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getProjects } from '@/lib/services/projects';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { NewExpenseClient } from './new-expense-client';

/**
 * 7A §5.3 — full capture form, all roles. The job picker lists ACTIVE
 * projects (RLS scopes to assigned for non-Owner/Admin). ?project= pre-fills
 * the job (the Job Cost tab entry point, §5.1 #3). Date pre-fills to the
 * company-tz calendar day (6B log_date convention).
 */
export default async function NewExpensePage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Role feeds the photo-requirement exemption (Owner/Admin, presentation-only).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  const [projects, { timezone }] = await Promise.all([
    getProjects({ status: 'active' }),
    getCompanyTimeSettings(),
  ]);

  const todayYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const initialProjectId = projects.some((p) => p.id === searchParams.project)
    ? searchParams.project
    : undefined;

  return (
    <NewExpenseClient
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      initialProjectId={initialProjectId}
      todayYmd={todayYmd}
      callerRole={profile?.role ?? ''}
    />
  );
}
