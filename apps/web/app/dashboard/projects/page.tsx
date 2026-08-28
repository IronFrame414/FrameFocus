import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getProjects } from '@/lib/services/projects';
import type { ProjectStatus } from '@/lib/services/projects';
import { getRevisedContractMap } from '@/lib/services/contract-value';
import { getProfitabilityReport } from '@/lib/services/profitability';
import { projectHasUnsignedContract } from '@/lib/services/contracts';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';
import { ProjectsList } from './projects-list';

const STATUSES: ProjectStatus[] = ['active', 'on_hold', 'complete', 'archived', 'cancelled'];

/**
 * ui-03 / desktop-redesign §8.1 — the 14a projects list. Fetches the full
 * (RLS-scoped) list once so the subtitle counts and search filter client-side;
 * the status chips keep the ?status= URL contract. Financial floor (ui-01
 * §11): Contract, Billed and Margin are Owner/Admin only — the grid reflows
 * for gated roles, and the gated path triggers ZERO of the per-project
 * profitability calls (§6: the loop sits behind the same canSeeFinancials
 * gate that already guards getRevisedContractMap).
 */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
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

  if (!profile) redirect('/dashboard');

  const status = STATUSES.includes(searchParams.status as ProjectStatus)
    ? (searchParams.status as ProjectStatus)
    : undefined;

  // RLS scopes visibility: Owner/Admin see all; PM/Foreman/Crew see assigned.
  const projects = await getProjects();
  const ids = projects.map((p) => p.id);

  const canCreate = ['owner', 'admin', 'project_manager'].includes(profile.role);
  const canSeeFinancials = profile.role === 'owner' || profile.role === 'admin';

  // Progress is calendar arithmetic against the COMPANY's today (§8c.1 — the
  // dashboard tz fix; projects dates are date columns, not instants).
  const { timezone } = await getCompanyTimeSettings();
  const today = companyToday(timezone);

  // ── Needs attention (§8.1 — four conditions, closed set) ─────────────────
  // Three grouped queries, not per-row checks. Each returns what the CALLER's
  // RLS admits: a foreman/crew reads zero change_orders (S121 floor) and zero
  // estimates, so those conditions simply never fire for them — the count
  // follows the caller's visibility, which is the floor doing its job.
  const draftCoCounts: Record<string, number> = {};
  const openPunchCounts: Record<string, number> = {};
  const acceptedUnconverted: string[] = [];
  if (ids.length > 0) {
    const [draftCos, openPunch, acceptedEsts] = await Promise.all([
      supabase.from('change_orders').select('project_id').eq('status', 'draft').eq('is_deleted', false).in('project_id', ids),
      supabase
        .from('punch_list_items')
        .select('project_id')
        .in('status', ['open', 'in_progress'])
        .eq('is_deleted', false)
        .in('project_id', ids),
      // 'accepted' IS "not yet converted" — conversion flips status to
      // 'converted' (Migration 20260704212000).
      supabase.from('estimates').select('project_id').eq('status', 'accepted').eq('is_deleted', false).in('project_id', ids),
    ]);
    for (const row of draftCos.data ?? []) {
      if (row.project_id) draftCoCounts[row.project_id] = (draftCoCounts[row.project_id] ?? 0) + 1;
    }
    for (const row of openPunch.data ?? []) {
      openPunchCounts[row.project_id] = (openPunchCounts[row.project_id] ?? 0) + 1;
    }
    for (const row of acceptedEsts.data ?? []) {
      if (row.project_id) acceptedUnconverted.push(row.project_id);
    }
  }

  // ── Awaiting signature (metric strip) ────────────────────────────────────
  // The ONE legal mechanism, per project (project_has_unsigned_contract —
  // SECURITY DEFINER, can_view_project-scoped, returns a bare boolean so no
  // contract_documents RLS is widened). N calls on a single-digit list is the
  // same accepted shape as the margin loop below (§6).
  const unsignedFlags = await Promise.all(ids.map((id) => projectHasUnsignedContract(id)));
  const awaitingSignature = unsignedFlags.filter(Boolean).length;

  // ── Contract / Billed / Margin / Unbilled — Owner/Admin ONLY (§6) ────────
  // RULED: the existing per-project getProfitabilityReport in a loop; no batch
  // helper. Margin derives per instrument, so a "lighter" batched margin would
  // be the same load with the loop moved. A gated role triggers zero calls.
  const revisedContracts: Record<string, number | null> = {};
  const billed: Record<string, number> = {};
  const marginPercent: Record<string, number | null> = {};
  let unbilledTotal = 0;
  let contractValueActive = 0;
  if (canSeeFinancials) {
    const map = await getRevisedContractMap(ids);
    for (const [id, rc] of Object.entries(map)) {
      revisedContracts[id] = rc.revised;
    }
    for (const p of projects) {
      if (p.status === 'active') contractValueActive += revisedContracts[p.id] ?? 0;
      const report = await getProfitabilityReport(p.id);
      if (!report) {
        marginPercent[p.id] = null;
        continue;
      }
      const h = report.headline;
      billed[p.id] = h.billed;
      // Margin % on the headline's own basis (earned while running, billed
      // once complete — profitBasisFor). Null when profit is null (no earned
      // figure yet) or the basis is zero.
      const basisValue = h.basis === 'billed' ? h.billed : h.earned;
      marginPercent[p.id] =
        h.profit === null || basisValue === null || basisValue === 0
          ? null
          : Math.round((h.profit / basisValue) * 100);
      // Unbilled work = the headline's backlog (earned − billed − discounts),
      // summed where positive; an overbilled job is not negative unbilled work.
      if (h.backlog !== null && h.backlog > 0) unbilledTotal += h.backlog;
    }
  }

  return (
    <ProjectsList
      projects={projects}
      revisedContracts={revisedContracts}
      billed={billed}
      marginPercent={marginPercent}
      draftCoCounts={draftCoCounts}
      openPunchCounts={openPunchCounts}
      acceptedUnconverted={acceptedUnconverted}
      today={today}
      metrics={{
        contractValueActive,
        unbilledTotal,
        awaitingSignature,
      }}
      currentStatus={status ?? 'all'}
      canCreate={canCreate}
      canSeeFinancials={canSeeFinancials}
    />
  );
}
