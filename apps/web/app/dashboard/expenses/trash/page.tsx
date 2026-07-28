import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { listDeletedExpenses } from '@/lib/services/expenses';
import { getProjects } from '@/lib/services/projects';
import { ExpensesTrashClient } from './trash-client';

/** 7A §3.5 — expense trash (trash-bin pattern), Owner/Admin. */
export default async function ExpensesTrashPage() {
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
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    redirect('/dashboard/expenses');
  }

  const [deleted, projects] = await Promise.all([listDeletedExpenses(), getProjects()]);
  const projectNames: Record<string, string> = Object.fromEntries(
    projects.map((p) => [p.id, p.name])
  );

  return <ExpensesTrashClient expenses={deleted} projectNames={projectNames} />;
}
