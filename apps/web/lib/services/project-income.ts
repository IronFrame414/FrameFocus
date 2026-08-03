import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import type { RowCategory } from '@framefocus/shared/utils/invoice-derivation';

// Module 7D1 §2 — STANDALONE INVOICE INCOME on the project financial page.
//
// JOSH'S RULING [S97]: "manual invoice items are NEW INCOME LINES and must
// appear on the project financial page as their OWN INDEPENDENT SECTION,
// presented the way CO lines are. Voiding the invoice must remove them."
//
// DERIVED, NEVER STORED — and that is the whole design, not an optimisation.
//
//   project_budget_items is INSERT-ONLY. It has exactly two policies, SELECT
//   and INSERT (Owner/Admin); there is no UPDATE and no DELETE, and
//   20260818000000 documents that absence as deliberate and guards it with a
//   regression harness. On top of that, expense_allocations.budget_item_id is
//   ON DELETE NO ACTION, so a line that has been charged cannot be removed by
//   anyone — service role included.
//
//   So a STORED copy of a standalone invoice line could never be removed when
//   the invoice is voided, which is precisely the removal the ruling asks for.
//   Storing it would convert an ordinary §9 void — the routine correction path,
//   and the thing §10's reissue is built on — into permanent overstatement of
//   the job's income with no app path to correct it.
//
//   Deriving makes void-removal automatic and needs no cleanup step: the query
//   simply stops matching. This is the same doctrine already used for contract
//   value (7B derives it), the deposit credit balance (§3a), negative-CO
//   availability (§4a), the rate-supersede flag (§10) and remaining-unbilled
//   (§6.2a). Nothing here is new; it is the house rule applied again.
//
// WHAT COUNTS AS INCOME — line_type 'fixed' AND no instrument.
//
//   'fixed' is the manual/standalone line type. The instrument test is what
//   separates §2's two cases: a line carrying an instrument is a LUMP-SUM
//   BILLING OF that instrument (a fixed-price CO, or a contract draw — draws
//   carry the estimate since Part A), which is not new income; a line carrying
//   NEITHER is standalone, "built directly… exists nowhere upstream to inherit
//   from", which is exactly what §2 says posts into project finances.
//
//   Discounts and credits are deliberately NOT swept in even though they also
//   carry no instrument: they are adjustments to billing that already exists,
//   not new income, and they are filtered out by the line_type test.
//
// FINANCIAL VISIBILITY FLOOR — this is a SELL figure ABOUT THE JOB, so it is
// Owner/Admin, like contract value and budgeted amount. §12a's carve-out lets a
// PM see amounts ON AN INVOICE THEY CAN REACH; it does not extend to a
// job-level income roll-up on the project financial page. The caller gates it.

export interface ProjectIncomeLine {
  invoiceLineId: string;
  invoiceId: string;
  /** NULL until the invoice is sent (§10 — numbered at send). */
  invoiceNumber: string | null;
  invoiceTitle: string | null;
  /** draft | pending_approval | sent | paid — never 'voided' (filtered out). */
  invoiceStatus: string;
  issueDate: string;
  description: string;
  /** §2's "amounts AND categories". NULL only on rows written before the
   *  category control existed. */
  category: RowCategory | null;
  amount: number;
}

export interface ProjectIncomeGroup {
  category: RowCategory | 'uncategorized';
  label: string;
  lines: ProjectIncomeLine[];
  amount: number;
}

export interface ProjectIncome {
  groups: ProjectIncomeGroup[];
  total: number;
  /** Income sitting on invoices that are not yet sent. Shown separately so a
   *  draft is never mistaken for money billed. */
  draftTotal: number;
}

const LABEL: Record<RowCategory | 'uncategorized', string> = {
  labor: 'Labor',
  material: 'Materials',
  subcontractor: 'Subcontractors',
  other: 'Other',
  uncategorized: 'Uncategorized',
};

const ORDER: Array<RowCategory | 'uncategorized'> = [
  'labor',
  'material',
  'subcontractor',
  'other',
  'uncategorized',
];

/**
 * §2 — standalone invoice lines on this project, as income.
 *
 * A VOIDED invoice contributes nothing, and neither does a soft-deleted one.
 * That is the removal the ruling asks for, and it costs one predicate.
 *
 * Takes the CLIENT so the live harness can exercise this exact function rather
 * than a hand-copied version of its query — the deriveInvoiceLines precedent.
 * Production passes the RLS-scoped server client; the harness passes admin.
 */
export async function loadProjectIncome(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectIncome> {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, title, status, issue_date')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    // THE VOID REMOVAL. A voided invoice's lines are retained forever (§9) but
    // its money is not income — it never was.
    .neq('status', 'voided')
    .order('issue_date', { ascending: true });

  const byInvoice = new Map((invoices ?? []).map((i) => [i.id, i]));
  if (byInvoice.size === 0) return { groups: [], total: 0, draftTotal: 0 };

  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('id, invoice_id, description, category, billed_amount')
    .in('invoice_id', [...byInvoice.keys()])
    .eq('line_type', 'fixed')
    .is('source_estimate_id', null)
    .is('source_change_order_id', null)
    .order('sort_order', { ascending: true });

  const grouped = new Map<RowCategory | 'uncategorized', ProjectIncomeLine[]>();
  let total = 0;
  let draftTotal = 0;

  for (const l of lines ?? []) {
    const invoice = byInvoice.get(l.invoice_id);
    if (!invoice) continue;
    const amount = Number(l.billed_amount);
    const row: ProjectIncomeLine = {
      invoiceLineId: l.id,
      invoiceId: l.invoice_id,
      invoiceNumber: invoice.invoice_number,
      invoiceTitle: invoice.title,
      invoiceStatus: invoice.status,
      issueDate: invoice.issue_date,
      description: l.description,
      category: (l.category as RowCategory | null) ?? null,
      amount,
    };
    const key = row.category ?? 'uncategorized';
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);

    total = Math.round((total + amount) * 100) / 100;
    if (invoice.status === 'draft' || invoice.status === 'pending_approval') {
      draftTotal = Math.round((draftTotal + amount) * 100) / 100;
    }
  }

  const groups: ProjectIncomeGroup[] = ORDER.filter((c) => grouped.has(c)).map((c) => {
    const list = grouped.get(c) as ProjectIncomeLine[];
    return {
      category: c,
      label: LABEL[c],
      lines: list,
      amount: Math.round(list.reduce((s, r) => s + r.amount, 0) * 100) / 100,
    };
  });

  return { groups, total, draftTotal };
}

/** Server wrapper — RLS-scoped, used by the project financial page. */
export async function getProjectIncome(projectId: string): Promise<ProjectIncome> {
  const supabase = await createClient();
  return loadProjectIncome(supabase as unknown as SupabaseClient, projectId);
}
