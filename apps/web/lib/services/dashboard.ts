import { createClient } from '@/lib/supabase-server';
import {
  CONTRACT_CONTRIBUTING_CO_FILTER,
  getPortfolioRevisedContract,
} from '@/lib/services/contract-value';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';

// ui-02 §S2/§S4 — company-wide dashboard reads. All queries run on the
// session client, so RLS scopes rows per role (Owner/Admin see all projects;
// PM/Foreman/Crew see assigned). Read-only aggregation: no new tables, no
// stored figures. "Awaiting signature" ≡ change_orders.status = 'sent'
// (there is no awaiting_signature value).

export interface DashboardKpis {
  activeProjectCount: number;
  pastTargetCount: number; // active projects past target_end_date
  contractValue: number; // portfolio revised contract (7B: contract-value.ts), active projects
  /** [S97] The two halves of the figure above, kept APART. contractValue mixes
   *  a binding obligation (fixed-price) with a non-binding projection
   *  (cost-plus/T&M), which P11 forbids from billing math — a headline summing
   *  them is neither quantity. Surfaces show these two, not the total. */
  contractValueFixed: number;
  contractValueFixedCount: number;
  contractValueProjected: number;
  contractValueProjectedCount: number;
  awaitingCount: number; // COs status='sent'
  awaitingSum: number; // Σ net_delta of those (Owner/Admin display only)
  openPunchCount: number; // open + in_progress punch items on active projects
}

export interface AttentionItem {
  severity: 'amber' | 'blue' | 'green';
  text: string;
  emphasis: string; // entity name rendered bold
  href: string | null;
}

export interface DashboardData {
  kpis: DashboardKpis;
  attention: AttentionItem[];
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  // `today` is compared to `projects.target_end_date`, a DATE column — a
  // CALENDAR day, which is timezone-dependent. In UTC (`toISOString().slice`)
  // it rolls to tomorrow ~8pm US-local, so `pastTargetCount` counted a project
  // whose target is today as overdue a day early. Same class as S140's
  // complianceToday() fix; the shared companyToday() is that pattern.
  const { timezone } = await getCompanyTimeSettings();
  const today = companyToday(timezone);
  // `sevenDaysAgo` is compared to `change_orders.sent_at`/`signed_at`, which are
  // timestamptz INSTANTS — a rolling 7-day absolute-time window with no calendar
  // boundary to get wrong. Per dates.ts's ruling, instants stay `toISOString()`;
  // converting them to a company-tz day is the sweep that reintroduces the bug.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Active projects — one fetch powers count, past-target, contract sum, and
  // the missing-dates feed items.
  const { data: activeProjects } = await supabase
    .from('projects')
    .select('id, name, project_number, start_date, target_end_date')
    .eq('status', 'active')
    .eq('is_deleted', false);

  const active = activeProjects ?? [];
  const activeIds = active.map((p) => p.id);

  // Signed CO ROWS on active projects — the recently-signed attention feed
  // needs per-CO rows, so this query stays even though the KPI sum now comes
  // from getPortfolioRevisedContract() (7B Q3: duplicate query accepted; the
  // shared filter constant keeps the two reads in lockstep).
  const { data: signedCos } = activeIds.length
    ? await supabase
        .from('change_orders')
        .select('id, co_number, title, net_delta, signed_at, project_id')
        .match(CONTRACT_CONTRIBUTING_CO_FILTER)
        .in('project_id', activeIds)
    : { data: [] };

  // Awaiting signature (status='sent') — company-wide, all projects.
  const { data: sentCos } = await supabase
    .from('change_orders')
    .select('id, co_number, title, net_delta, sent_at, project_id')
    .eq('status', 'sent')
    .eq('is_deleted', false);

  // Open punch count on active projects (mirrors checkPunchGate statuses).
  const { count: punchCount } = activeIds.length
    ? await supabase
        .from('punch_list_items')
        .select('*', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .in('status', ['open', 'in_progress'])
        .in('project_id', activeIds)
    : { count: 0 };

  // 7B: the one legal derivation of the portfolio revised contract.
  const portfolio = await getPortfolioRevisedContract();

  const kpis: DashboardKpis = {
    activeProjectCount: active.length,
    pastTargetCount: active.filter((p) => p.target_end_date && p.target_end_date < today).length,
    contractValue: portfolio.revisedSum,
    contractValueFixed: portfolio.fixedRevisedSum,
    contractValueFixedCount: portfolio.fixedCount,
    contractValueProjected: portfolio.projectedRevisedSum,
    contractValueProjectedCount: portfolio.projectedCount,
    awaitingCount: (sentCos ?? []).length,
    awaitingSum: (sentCos ?? []).reduce((sum, co) => sum + (co.net_delta ?? 0), 0),
    openPunchCount: punchCount ?? 0,
  };

  // Needs-Attention feed (ui-02 §S4, punch due-states dropped — no due-date
  // column). Severity order: amber → blue → green, capped at 6.
  const attention: AttentionItem[] = [];

  for (const co of (sentCos ?? []).filter((c) => c.sent_at && c.sent_at < sevenDaysAgo)) {
    attention.push({
      severity: 'amber',
      text: 'awaiting signature for over a week',
      emphasis: `${co.co_number} — ${co.title}`,
      href: co.project_id ? `/dashboard/projects/${co.project_id}/changes/${co.id}` : null,
    });
  }
  for (const p of active.filter((x) => !x.start_date || !x.target_end_date)) {
    attention.push({
      severity: 'blue',
      text: 'is missing start or target dates',
      emphasis: p.name,
      href: `/dashboard/projects/${p.id}`,
    });
  }
  for (const co of (signedCos ?? []).filter((c) => c.signed_at && c.signed_at >= sevenDaysAgo)) {
    attention.push({
      severity: 'green',
      text: 'was signed this week',
      emphasis: `${co.co_number} — ${co.title}`,
      href: co.project_id ? `/dashboard/projects/${co.project_id}/changes/${co.id}` : null,
    });
  }

  return { kpis, attention: attention.slice(0, 6) };
}
