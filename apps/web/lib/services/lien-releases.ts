import { createClient } from '@/lib/supabase-server';
import { companyToday } from '@framefocus/shared/utils/dates';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { getRevisedContract } from '@/lib/services/contract-value';
import {
  releaseAmount,
  selectTemplate,
  VALUE_CATALOG,
  type ReleaseDirection,
  type ReleaseStatus,
  type ReleaseType,
  type TemplateChoice,
} from '@/lib/services/lien-releases-shared';
import type { Database } from '@framefocus/shared/types/database';

// Module 7F — server reads. Owner/Admin by RLS on every table (§8.2).
//
// docs/specs/7f2-spec.md §6 (value catalog), §7 (generate flow), §8 (lifecycle).

type TemplateRow = Database['public']['Tables']['lien_release_templates']['Row'];
type BoxRow = Database['public']['Tables']['lien_release_template_boxes']['Row'];
type ReleaseRow = Database['public']['Tables']['lien_releases']['Row'];

export type LienReleaseTemplate = Omit<TemplateRow, 'type' | 'direction'> & {
  type: ReleaseType;
  direction: ReleaseDirection;
};

export type LienRelease = Omit<ReleaseRow, 'type' | 'direction' | 'status'> & {
  type: ReleaseType;
  direction: ReleaseDirection;
  status: ReleaseStatus;
};

export type TemplateBox = Omit<BoxRow, 'kind'> & {
  kind: 'value' | 'signature' | 'custom';
};

export async function getTemplates(
  direction: ReleaseDirection = 'client_outbound'
): Promise<LienReleaseTemplate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('lien_release_templates')
    .select('*')
    .eq('direction', direction)
    .eq('is_deleted', false)
    .order('is_final', { ascending: true })
    .order('name', { ascending: true });
  return (data ?? []) as LienReleaseTemplate[];
}

export async function getTemplateBoxes(templateId: string): Promise<TemplateBox[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('lien_release_template_boxes')
    .select('*')
    .eq('template_id', templateId)
    .eq('is_deleted', false)
    .order('page', { ascending: true });
  return (data ?? []) as TemplateBox[];
}

/** §8.1 — the Lien Releases list under a job's financials. */
export async function getReleasesForProject(projectId: string): Promise<LienRelease[]> {
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);
  const invoiceIds = (invoices ?? []).map((i) => i.id);
  if (invoiceIds.length === 0) return [];

  const { data } = await supabase
    .from('lien_releases')
    .select('*')
    .in('invoice_id', invoiceIds)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  return (data ?? []) as LienRelease[];
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 — resolving the value catalog for one invoice
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedValues {
  values: Record<string, string>;
  /** §6.3 BUILD GUARD — generation must REFUSE rather than render a blank
   *  required property field. Non-empty means "cannot generate". */
  blockers: string[];
  amount: number;
  /** True when 7E's P-4 floor was breached — see releaseAmount(). */
  amountClamped: boolean;
  templateSelection: ReturnType<typeof selectTemplate>;
}

export async function resolveReleaseValues(
  invoiceId: string,
  type: ReleaseType
): Promise<ResolvedValues | null> {
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, project_id, invoice_number, issue_date, amount_receivable, is_final, is_deleted')
    .eq('id', invoiceId)
    .eq('is_deleted', false)
    .single();
  if (!invoice) return null;

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, scope_summary, legal_description, contact_id, contact_address_id')
    .eq('id', invoice.project_id)
    .single();
  if (!project) return null;

  // RLS scopes `companies` to the caller's own row.
  // ONE STRING LITERAL, deliberately. Supabase infers the row type from the
  // select text, and a `'a, b' + 'c'` concatenation is not a literal — the
  // whole result degrades to GenericStringError and every field read off it
  // fails to compile. Keep it on one line however long it gets.
  const { data: company } = await supabase
    .from('companies')
    .select(
      'name, address_line1, address_line2, city, state, zip, license_number, signatory_name, signatory_title, contractor_signature_path, timezone'
    )
    .maybeSingle();

  const { data: contact } = await supabase
    .from('contacts')
    .select('company_name, first_name, last_name')
    .eq('id', project.contact_id)
    .maybeSingle();

  const { data: address } = project.contact_address_id
    ? await supabase
        .from('contact_addresses')
        .select('address_line1, address_line2, city, state, zip')
        .eq('id', project.contact_address_id)
        .maybeSingle()
    : { data: null };

  const { data: contract } = await supabase
    .from('client_contracts')
    .select('executed_date')
    .eq('project_id', project.id)
    .eq('is_deleted', false)
    .order('executed_date', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const { data: applications } = await supabase
    .from('client_payment_applications')
    .select('amount')
    .eq('invoice_id', invoiceId)
    .eq('is_deleted', false);
  const applied = (applications ?? []).reduce((s, a) => s + Number(a.amount), 0);

  const { data: retainage } = await supabase
    .from('retainage_releases')
    .select('amount')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // §6.3 [CORRECTED S140, ruling C7] — the ORIGINAL contract, not the revised.
  // 7f2 §6.3 mapped this to `projects.contract_value`, which 20260812000000
  // DROPPED; it lives on project_financials now. Josh ruled the ORIGINAL is
  // what belongs on a lien release: the instrument speaks to the contract that
  // was entered into, not to its running total after change orders.
  const revised = await getRevisedContract(project.id);

  const timezone = company?.timezone ?? (await getCompanyTimeSettings()).timezone;

  const ownerName =
    contact?.company_name ||
    [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') ||
    '';

  const claimantAddress = [
    company?.address_line1,
    company?.address_line2,
    [company?.city, company?.state].filter(Boolean).join(', '),
    company?.zip,
  ]
    .filter(Boolean)
    .join('\n');

  const propertyAddress = address
    ? [
        address.address_line1,
        address.address_line2,
        [address.city, address.state].filter(Boolean).join(', '),
        address.zip,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const { amount, clamped } = releaseAmount(
    type,
    Number(invoice.amount_receivable ?? 0),
    applied
  );

  const values: Record<string, string> = {
    claimant_name: company?.name ?? '',
    claimant_address: claimantAddress,
    claimant_license_no: company?.license_number ?? '',
    // §6.2 — ALWAYS the company. It occupies the contractor role even under a
    // higher GC.
    contractor_furnished_to: company?.name ?? '',
    owner_name: ownerName,

    project_name: project.name,
    property_address: propertyAddress,
    legal_description: project.legal_description ?? '',
    contract_date: contract?.executed_date ?? '',
    contract_value: revised?.original !== null && revised?.original !== undefined
      ? String(revised.original)
      : '',
    scope_of_work: project.scope_summary ?? '',

    release_amount: amount.toFixed(2),
    invoice_no: invoice.invoice_number ?? '',
    retainage_released: retainage?.amount !== undefined ? String(retainage.amount) : '',
    // §6.4 — issue_date, NOT due_date. 7E's own aging runs from issue_date for
    // the same reason.
    through_date: invoice.issue_date,
    // §11.2 — the COMPANY timezone, never UTC. A notarized instrument dated a
    // day off is a real problem, and 7D needed four commits to get this right.
    waiver_date: companyToday(timezone),

    signer_name: company?.signatory_name ?? '',
    signer_title: company?.signatory_title ?? '',
  };

  // §6.3 BUILD GUARD — refuse rather than render a blank required field.
  const blockers: string[] = [];
  if (!propertyAddress) {
    blockers.push(
      'This project has no property address. The address is legally required on the ' +
        'release form, and it is what covers a missing legal description — add one to ' +
        'the project before generating.'
    );
  }
  if (!company?.name) {
    blockers.push('Company name is not set in Company Settings.');
  }
  if (!values.signer_name || !values.signer_title) {
    blockers.push(
      'The signatory name and title are not set in Company Settings. A release is ' +
        'signed on behalf of the company and both print on the form.'
    );
  }

  const templates = await getTemplates('client_outbound');
  const templateSelection = selectTemplate(
    templates.map<TemplateChoice>((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      is_final: t.is_final,
      direction: t.direction,
      jurisdiction_state: t.jurisdiction_state,
      hasPdf: t.pdf_file_id !== null,
    })),
    { type, isFinal: invoice.is_final, direction: 'client_outbound' }
  );

  return { values, blockers, amount, amountClamped: clamped, templateSelection };
}

/** The catalog, for the box-placement UI. Re-exported so the settings screen
 *  never builds its own list and the two cannot drift. */
export { VALUE_CATALOG };
