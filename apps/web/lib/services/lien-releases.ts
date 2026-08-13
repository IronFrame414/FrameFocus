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

// ─────────────────────────────────────────────────────────────────────────────
// §12 — SUB-INBOUND: the second resolver [S145]
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ THE SPEC READS PAST THIS. §12 says "the §3 engine is direction-agnostic and
// is reused as-is." The ENGINE is — box maps, renderRelease(), fitTextToBox(),
// selectTemplate() all work unchanged. THE VALUE CATALOG IS NOT.
//
// §6.2 ruled at S98 that "the company will always be the contractor, and the
// party the release is sent to will be the client." That is true of every
// CLIENT-OUTBOUND release and false of every sub-inbound one: when a sub gives
// US a release, THE SUB IS THE LIENOR. So three keys invert —
//
//     claimant_name / claimant_address / claimant_license_no
//         client-outbound -> the company        sub-inbound -> the SUB
//     contractor_furnished_to
//         client-outbound -> the company        sub-inbound -> the company
//                                                (unchanged: we are still who
//                                                 it was furnished to)
//
// — and resolveReleaseValues() above resolves everything from an INVOICE, which
// a sub-inbound release does not have.
//
// ONE CATALOG, TWO RESOLVERS [ruling B4]. The key NAMES stay identical, so a
// single box-map format serves both directions and a company that has boxed one
// form can box the other the same way. Only the SOURCE of each value differs.
// The rejected alternative — a second catalog with sub_claimant_* keys — would
// have doubled the template-placement UI for no gain.

/** Which event produced this release (ruling ii). Determines both the type and
 *  which subject column carries it (ruling B2). */
export type SubReleaseTrigger = 'completion' | 'payment';

export interface SubReleaseSubject {
  trigger: SubReleaseTrigger;
  /** completion -> the whole sub-contract. */
  subContractId?: string;
  /** payment -> the specific paid stage / bill. */
  expenseId?: string;
}

/**
 * §12 — resolve the catalog for a SUB-INBOUND release.
 *
 * The type is not a parameter: ruling (ii) fixes it to the trigger.
 *
 *     completion -> CONDITIONAL   ("I will release when paid")
 *     payment    -> UNCONDITIONAL ("I have been paid")
 *
 * Deriving one from the other is what ruling B1(b) rejected — a conditional
 * release inferred from a payment is a statement about the future made after
 * the fact.
 */
export async function resolveSubReleaseValues(
  subject: SubReleaseSubject
): Promise<ResolvedValues | null> {
  const supabase = await createClient();

  const type: ReleaseType = subject.trigger === 'completion' ? 'conditional' : 'unconditional';

  // ── Locate the sub-contract, from whichever subject we were handed ───────
  let subContractId = subject.subContractId ?? null;
  let expenseAmount = 0;
  let expensePaid = 0;
  let stageLabel: string | null = null;

  if (subject.trigger === 'payment') {
    if (!subject.expenseId) return null;
    const { data: expense } = await supabase
      .from('expenses')
      .select('id, sub_contract_id, amount, stage_label, is_deleted, payments:expense_payments(amount, retainage_withheld, is_deleted)')
      .eq('id', subject.expenseId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!expense) return null;
    subContractId = expense.sub_contract_id;
    expenseAmount = Number(expense.amount ?? 0);
    stageLabel = expense.stage_label;

    // The amount rule, sub side: an UNCONDITIONAL release covers money the sub
    // has ACTUALLY BEEN PAID — Σ gross payments on this row. Gross, not net:
    // retainage withheld has not been released to them, so it is not covered by
    // a release of what they received. The client-outbound analogue is
    // Σ applications, never the receivable.
    const payments = (expense.payments ?? []) as { amount: number; is_deleted: boolean | null }[];
    expensePaid = payments
      .filter((p) => !p.is_deleted)
      .reduce((sum, p) => sum + Number(p.amount), 0);
  }

  if (!subContractId) return null;

  const { data: contract } = await supabase
    .from('subcontractor_contracts')
    .select('id, project_id, member_id, scope_of_work, contract_value, executed_date, completed_at')
    .eq('id', subContractId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!contract) return null;

  // ── The LIENOR is the sub ────────────────────────────────────────────────
  // `subcontractors` is the domain row and carries the address and licence;
  // `company_members` carries the display name. They join on member_id, which
  // 113c stage 1 added and backfilled.
  //
  // ⚠️ NOT `subcontractor_financials`. The EIN lives there and is Owner/Admin
  // by RLS (#132) — the trap 7G's spec cites in three places. A lien release
  // does not carry a tax id, so this resolver never reads that table and cannot
  // silently emit a blank one.
  const { data: sub } = await supabase
    .from('subcontractors')
    .select('company_name, contact_first_name, contact_last_name, address_line1, address_line2, city, state, zip, license_number')
    .eq('member_id', contract.member_id)
    .eq('is_deleted', false)
    .maybeSingle();

  const { data: member } = await supabase
    .from('company_members')
    .select('display_name')
    .eq('id', contract.member_id)
    .maybeSingle();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, scope_summary, legal_description, contact_id, contact_address_id')
    .eq('id', contract.project_id)
    .maybeSingle();
  if (!project) return null;

  const { data: company } = await supabase
    .from('companies')
    .select('name, address_line1, address_line2, city, state, zip, license_number, signatory_name, signatory_title, timezone')
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

  const timezone = company?.timezone ?? (await getCompanyTimeSettings()).timezone;

  const subName =
    sub?.company_name ||
    member?.display_name ||
    [sub?.contact_first_name, sub?.contact_last_name].filter(Boolean).join(' ') ||
    '';

  const subAddress = sub
    ? [sub.address_line1, sub.address_line2, [sub.city, sub.state].filter(Boolean).join(', '), sub.zip]
        .filter(Boolean)
        .join('\n')
    : '';

  const propertyAddress = address
    ? [address.address_line1, address.address_line2, [address.city, address.state].filter(Boolean).join(', '), address.zip]
        .filter(Boolean)
        .join('\n')
    : '';

  const ownerName =
    contact?.company_name ||
    [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') ||
    '';

  // A conditional release at completion covers what is still owed on the
  // contract; an unconditional at payment covers what was actually paid on that
  // stage. Both are clamped at the contract value for the same reason the
  // client side clamps at the receivable — a release must never cover more
  // money than it is about.
  const contractValue = Number(contract.contract_value ?? 0);
  const rawAmount = subject.trigger === 'completion' ? contractValue : expensePaid;
  const clamped = contractValue > 0 && rawAmount > contractValue;
  const amount = Math.round((clamped ? contractValue : rawAmount) * 100) / 100;

  const values: Record<string, string> = {
    // THE INVERSION. Same keys, different source.
    claimant_name: subName,
    claimant_address: subAddress,
    claimant_license_no: sub?.license_number ?? '',
    // Still the company — we are who the work was furnished to.
    contractor_furnished_to: company?.name ?? '',
    owner_name: ownerName,

    project_name: project.name,
    property_address: propertyAddress,
    legal_description: project.legal_description ?? '',
    contract_date: contract.executed_date ?? '',
    contract_value: contract.contract_value !== null ? String(contract.contract_value) : '',
    scope_of_work: contract.scope_of_work ?? project.scope_summary ?? '',

    release_amount: amount.toFixed(2),
    // No invoice on this side. The stage label is the nearest honest reference,
    // and blank is legal — §6.3's null paths.
    invoice_no: stageLabel ?? '',
    retainage_released: '',
    through_date: companyToday(timezone),
    waiver_date: companyToday(timezone),

    // The SIGNER is still us on the generated blank: we produce the form, the
    // sub signs it by hand and returns it (ruling i, upload-back). The
    // signature BOX is left empty on this direction for the same reason the
    // notary path leaves it empty — the signature that matters is the sub's,
    // made on paper.
    signer_name: company?.signatory_name ?? '',
    signer_title: company?.signatory_title ?? '',
  };

  const blockers: string[] = [];
  if (!propertyAddress) {
    blockers.push(
      'This project has no property address. The address is legally required on the release ' +
        'form, and it is what covers a missing legal description — add one to the project ' +
        'before generating.'
    );
  }
  if (!subName) {
    blockers.push(
      'This subcontract has no subcontractor name on record. The sub is the lienor and their ' +
        'name is the one that must appear on the release.'
    );
  }

  const templates = await getTemplates('sub_inbound');
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
    {
      type,
      // §12 [ruling B3] — "final" on the sub side means the release covers the
      // whole contract: a completion release always does; a payment release
      // does only when that stage settles the last of it.
      isFinal: subject.trigger === 'completion' || (contractValue > 0 && amount >= contractValue),
      direction: 'sub_inbound',
    }
  );

  return { values, blockers, amount, amountClamped: clamped, templateSelection };
}

/** §12 — the sub-inbound releases on a job, for the releases panel. */
export async function getSubReleasesForProject(projectId: string): Promise<LienRelease[]> {
  const supabase = await createClient();

  const { data: contracts } = await supabase
    .from('subcontractor_contracts')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);
  const contractIds = (contracts ?? []).map((c) => c.id);

  const { data: expenses } = await supabase
    .from('expenses')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_deleted', false);
  const expenseIds = (expenses ?? []).map((e) => e.id);

  if (contractIds.length === 0 && expenseIds.length === 0) return [];

  // Two subject columns, so two filters OR'd — a sub-inbound release hangs off
  // exactly one of them (lien_releases_subject_check).
  const parts: string[] = [];
  if (contractIds.length) parts.push(`sub_contract_id.in.(${contractIds.join(',')})`);
  if (expenseIds.length) parts.push(`expense_id.in.(${expenseIds.join(',')})`);

  const { data } = await supabase
    .from('lien_releases')
    .select('*')
    .eq('direction', 'sub_inbound')
    .eq('is_deleted', false)
    .or(parts.join(','))
    .order('created_at', { ascending: false });
  return (data ?? []) as LienRelease[];
}
