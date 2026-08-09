import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getExpenses } from '@/lib/services/expenses';
import { getExpenseReceipts } from '@/lib/services/expenses';
import { getBillsAndCommitments } from '@/lib/services/payables';
import { getProjects } from '@/lib/services/projects';
import { getMyMember } from '@/lib/services/members';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { ExpensesPageClient } from './expenses-page-client';

/**
 * 7A §5.4 + 7C §3.3 — Receipts | Bills & Commitments | Review queue tabs,
 * role-scoped by RLS + this page: Crew see their OWN receipts (RLS),
 * PM/Foreman visible-project rows (Bills read-only for Foreman), Owner/Admin
 * everything plus the Review queue tab. Receipt signed URLs for pending
 * expenses are pre-fetched here so the review popup needs no client storage
 * reads (deliveries-page precedent).
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

  /** 7C §4 — the Bills & Commitments audience. Mirrors the tab gate in
   *  expenses-page-client.tsx:77, and the pair is unit-tested equal. */
  const SEES_BILLS = ['owner', 'admin', 'project_manager', 'foreman'];
  const isReviewer = ['owner', 'admin'].includes(role);

  const [expenses, billRows, activeProjects, allProjects, myMember, timeSettings] =
    await Promise.all([
      getExpenses(),
      getBillsAndCommitments(),
      getProjects({ status: 'active' }),
      getProjects(),
      getMyMember(),
      getCompanyTimeSettings(),
    ]);

  // ── #136 CLOSED [S121] — raised S103, filed, never fixed. ──────────────
  // Crew received every payable row RLS grants them IN THE RSC PAYLOAD,
  // subcontractor retainage accruals included. The Bills tab gate
  // (expenses-page-client.tsx:77) is render-deep only, and the Receipts tab
  // hid payables by filtering CLIENT-SIDE from a list it had already been sent.
  //
  // ⚠️ FIXING `billRows` ALONE IS NOT ENOUGH, and the payload test caught it:
  // the payable rows are ALSO in `expenses`, because a payable IS an expense —
  // that is why the client had to filter them off the Receipts tab by id. Both
  // props had to be closed, and stripping them from `expenses` on the server is
  // what makes the client filter redundant rather than load-bearing.
  //
  // Nothing is taken from anyone: a role without Bills access never saw these
  // rows on any tab. `expenses_insert_authorized` restricts `is_retainage` to
  // Owner/Admin, and a crew receipt carries no sub-contract or PO link, so the
  // rows removed here are rows that role could not have authored either.
  const seesBills = SEES_BILLS.includes(role);
  const payableIdSet = new Set(billRows.map((b) => b.id));
  const visibleExpenses = seesBills ? expenses : expenses.filter((e) => !payableIdSet.has(e.id));

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
      expenses={visibleExpenses}
      billRows={seesBills ? billRows : []}
      activeProjects={activeProjects.map((p) => ({ id: p.id, name: p.name }))}
      projectNames={projectNames}
      pendingReceipts={pendingReceipts}
      todayYmd={todayYmd}
    />
  );
}
