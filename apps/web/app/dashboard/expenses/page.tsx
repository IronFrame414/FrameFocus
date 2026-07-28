import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getExpenses } from '@/lib/services/expenses';
import { getExpenseReceipts } from '@/lib/services/expenses';
import { getProjects } from '@/lib/services/projects';
import { getMyMember } from '@/lib/services/members';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { ExpensesPageClient } from './expenses-page-client';

/**
 * 7A §5.4 — expense list + review queue, role-scoped by RLS + this page:
 * Crew see their OWN rows (RLS), PM/Foreman visible-project expenses
 * (read-only), Owner/Admin everything plus the Review queue tab. Receipt
 * signed URLs for pending expenses are pre-fetched here so the review popup
 * needs no client storage reads (deliveries-page precedent).
 */
export default async function ExpensesPage() {
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
  const role = profile?.role ?? '';
  const isReviewer = ['owner', 'admin'].includes(role);

  const [expenses, activeProjects, allProjects, myMember, timeSettings] = await Promise.all([
    getExpenses(),
    getProjects({ status: 'active' }),
    getProjects(),
    getMyMember(),
    getCompanyTimeSettings(),
  ]);

  const projectNames: Record<string, string> = Object.fromEntries(
    allProjects.map((p) => [p.id, p.name])
  );

  // Receipt strips for the review popup (Owner/Admin, pending rows only).
  const pendingReceipts: Record<string, { id: string; name: string; url: string }[]> = {};
  if (isReviewer) {
    const pending = expenses.filter((e) => e.status === 'pending');
    const receiptRows = await Promise.all(pending.map((e) => getExpenseReceipts(e.id)));
    const allPaths = receiptRows.flat().map((f) => f.file_path);
    const { data: signed } = allPaths.length
      ? await supabase.storage.from('project-files').createSignedUrls(allPaths, 3600)
      : { data: [] };
    const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    pending.forEach((e, i) => {
      pendingReceipts[e.id] = receiptRows[i]
        .map((f) => ({
          id: f.id,
          name: f.file_name,
          url: urlByPath.get(f.file_path) ?? '',
        }))
        .filter((r) => r.url !== '');
    });
  }

  const todayYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeSettings.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  return (
    <ExpensesPageClient
      role={role}
      myMemberId={myMember?.id ?? null}
      expenses={expenses}
      activeProjects={activeProjects.map((p) => ({ id: p.id, name: p.name }))}
      projectNames={projectNames}
      pendingReceipts={pendingReceipts}
      todayYmd={todayYmd}
    />
  );
}
