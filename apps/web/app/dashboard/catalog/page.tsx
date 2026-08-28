import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { CatalogList } from './catalog-list';

/**
 * 14f Cost Catalog (desktop-redesign §8.6). The list itself keeps its
 * browser-fetch shape; this page adds the ONE new piece of data work — the
 * usage map — as TWO GROUPED QUERIES (the getRevisedContractMap shape, not
 * the per-row getProfitabilityReport shape: 148 items on screen).
 *
 * RULED: usage counts ESTIMATES PLUS SELECTIONS, labelled "used N times" —
 * no noun. The mockup's "used on 14 estimates" would be FALSE over a combined
 * count; the ruled wording answers the question the number is for (does this
 * row earn its place), without claiming a unit it does not have.
 */
export default async function CatalogPage() {
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

  const canManage = !!profile && ['owner', 'admin', 'project_manager'].includes(profile.role);

  // Usage — grouped, company-wide (RLS scopes both reads).
  //   · estimate_line_rows.catalog_item_id → DISTINCT estimates, via the
  //     two-hop join (estimate_line_rows has no estimate_id — that is the
  //     schema, not an oversight).
  //   · selection_options.catalog_item_id → selection options.
  // estimate_line_rows has no is_deleted (rows live and die with their
  // estimate's recalc); selection_options does and is filtered.
  const [lineRows, selectionOpts] = await Promise.all([
    supabase
      .from('estimate_line_rows')
      .select('catalog_item_id, estimate_line_items!inner(estimate_id)')
      .not('catalog_item_id', 'is', null),
    supabase
      .from('selection_options')
      .select('catalog_item_id')
      .eq('is_deleted', false)
      .not('catalog_item_id', 'is', null),
  ]);

  const estimatesByItem = new Map<string, Set<string>>();
  for (const row of lineRows.data ?? []) {
    if (!row.catalog_item_id) continue;
    const estimateId = (row.estimate_line_items as unknown as { estimate_id: string }).estimate_id;
    if (!estimatesByItem.has(row.catalog_item_id)) estimatesByItem.set(row.catalog_item_id, new Set());
    estimatesByItem.get(row.catalog_item_id)!.add(estimateId);
  }
  const usage: Record<string, number> = {};
  for (const [itemId, estimates] of estimatesByItem) usage[itemId] = estimates.size;
  for (const row of selectionOpts.data ?? []) {
    if (!row.catalog_item_id) continue;
    usage[row.catalog_item_id] = (usage[row.catalog_item_id] ?? 0) + 1;
  }

  return <CatalogList canManage={canManage} usage={usage} />;
}
