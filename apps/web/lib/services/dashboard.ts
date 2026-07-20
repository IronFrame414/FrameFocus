import { createClient } from '@/lib/supabase-server';

// ui-02 §S2/§S4 — company-wide dashboard reads. All queries run on the
// session client, so RLS scopes rows per role (Owner/Admin see all projects;
// PM/Foreman/Crew see assigned). Read-only aggregation: no new tables, no
// stored figures. "Awaiting signature" ≡ change_orders.status = 'sent'
// (there is no awaiting_signature value).

export interface DashboardKpis {
  activeProjectCount: number;
  pastTargetCount: number; // active projects past target_end_date
  contractValue: number; // Σ(contract_value + signed CO net deltas), active projects
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
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Active projects — one fetch powers count, past-target, contract sum, and
  // the missing-dates feed items.
  const { data: activeProjects } = await supabase
    .from('projects')
    .select('id, name, project_number, contract_value, start_date, target_end_date')
    .eq('status', 'active')
    .eq('is_deleted', false);

  const active = activeProjects ?? [];
  const activeIds = active.map((p) => p.id);

  // Signed CO deltas on active projects (revised-contract component) +
  // recently-signed feed items, one query.
  const { data: signedCos } = activeIds.length
    ? await supabase
        .from('change_orders')
        .select('id, co_number, title, net_delta, signed_at, project_id')
        .eq('status', 'signed')
        .eq('is_deleted', false)
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

  const signedDeltaSum = (signedCos ?? []).reduce((sum, co) => sum + (co.net_delta ?? 0), 0);
  const contractValue =
    active.reduce((sum, p) => sum + (p.contract_value ?? 0), 0) + signedDeltaSum;

  const kpis: DashboardKpis = {
    activeProjectCount: active.length,
    pastTargetCount: active.filter((p) => p.target_end_date && p.target_end_date < today).length,
    contractValue,
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
