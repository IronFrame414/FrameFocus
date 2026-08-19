import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

/**
 * Module 9 stage 4 — the client portal's read layer.
 *
 * ===========================================================================
 * EVERY READ GOES THROUGH THE CALLER'S CLIENT. NEVER THE SERVICE ROLE.
 * ===========================================================================
 * Same contract as `client-portal.ts`, and here it is not merely consistent —
 * it is the entire security model of the portal. The arms in
 * `20261019000000` and `20261020000000` decide what a client may see: which
 * projects, which documents, which invoice lines, which storage objects. A
 * `getSupabaseAdmin()` anywhere in this file would bypass all of it and every
 * one of the 63 live probes would still pass.
 *
 * ⚠️ SO THERE ARE NO ROLE CHECKS AND NO `client_access_state` CHECKS BELOW.
 * That is deliberate, not an omission. `my_client_access_level()` and
 * `is_client_of_project()` are consulted inside the policies themselves, so a
 * deactivated client's queries return zero rows through exactly the mechanism
 * a raw PostgREST call would hit. A second copy of the rule in TypeScript is
 * how the two versions drift, and the TypeScript one is the one an attacker
 * does not run.
 *
 * ---------------------------------------------------------------------------
 * THE PORTAL SHOWS WHAT THE INVOICE SHOWS [Josh, S164 Q3]
 * ---------------------------------------------------------------------------
 * *"The easy way to understand what a client will see is that they see what is
 * on the invoice. In the portal, they see all of it on one page and totals
 * added."*
 *
 * `getPortalBilling()` below is that sentence: it reads each bill, asks the
 * database for whatever detail that bill's `presentation_level` permits, and
 * adds the totals. **It applies no visibility rule of its own.** The three
 * shapes it returns differ because the DATABASE returned different things, not
 * because this file branched on an instrument.
 */

export interface PortalIdentity {
  profileId: string;
  companyId: string;
  contactId: string | null;
  accessLevel: 'full' | 'signed_documents_only' | 'documents_for_signature' | 'none';
  firstName: string | null;
  lastName: string | null;
}

export interface PortalBranding {
  companyName: string;
  logoUrl: string | null;
  brandColor: string | null;
}

export interface PortalProject {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  target_end_date: string | null;
  actual_end_date: string | null;
  address: string | null;
}

export interface PortalScheduleEntry {
  id: string;
  phase_name: string | null;
  title: string;
  start_date: string | null;
  due_date: string | null;
  status: string;
}

export interface PortalDocument {
  id: string;
  kind: 'contract' | 'contract_document' | 'change_order';
  title: string;
  status: string;
  created_at: string | null;
  /** R10 — a SENT change order is one awaiting her signature. */
  signable: boolean;
  /** The contract's agreed value, where the document carries one. */
  amount?: number | null;
}

export interface PortalProposal {
  id: string;
  estimate_number: string | null;
  name: string | null;
  status: string;
  contract_type: string | null;
  grand_total: number | null;
  sent_at: string | null;
  accepted_at: string | null;
}

export interface PortalPhoto {
  id: string;
  file_name: string;
  file_path: string;
  category: string | null;
  created_at: string | null;
  /** §6.1 — the marked-up derivative when one exists, the original otherwise. */
  display_path: string;
  has_markup: boolean;
}

export interface PortalInvoiceLine {
  id: string;
  description: string | null;
  category: string | null;
  quantity: number | null;
  unit_rate: number | null;
  cost_basis: number | null;
  billed_amount: number;
}

export interface PortalInvoiceSection {
  category: string;
  billed_subtotal: number;
}

export interface PortalInvoice {
  id: string;
  invoice_number: string | null;
  title: string | null;
  status: string;
  presentation_level: 'full_detail' | 'by_section' | 'lump_sum';
  issue_date: string | null;
  due_date: string | null;
  billed_total: number;
  amount_receivable: number;
  retainage_withheld: number;
  lines: PortalInvoiceLine[];
  sections: PortalInvoiceSection[];
}

export interface PortalBilling {
  invoices: PortalInvoice[];
  /** The "totals added" half of Josh's sentence. */
  totalBilled: number;
  totalReceivable: number;
  totalRetainage: number;
}

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/**
 * Who is calling, and at what access level.
 *
 * `my_client_access_level()` is the same function the policies call, asked
 * directly so the shell can render an honest empty state rather than a page of
 * blank sections. It is a DISPLAY input — never a gate. The gate is RLS.
 */
export async function getPortalIdentity(
  supabase: SupabaseClient<Database>
): Promise<PortalIdentity | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id, contact_id, role, first_name, last_name')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (!profile) return null;
  const p = profile as {
    id: string;
    company_id: string;
    contact_id: string | null;
    role: string;
    first_name: string | null;
    last_name: string | null;
  };
  if (p.role !== 'client') return null;

  const { data: level } = await supabase.rpc('my_client_access_level');

  return {
    profileId: p.id,
    companyId: p.company_id,
    contactId: p.contact_id,
    accessLevel: (level as PortalIdentity['accessLevel']) ?? 'none',
    firstName: p.first_name,
    lastName: p.last_name,
  };
}

/**
 * R20 — the branding swap, and it is POST-AUTH by construction.
 *
 * This reads `companies` with the caller's own session. There is no code path
 * that can reach it before a session exists, which is what keeps §11's "no
 * tenant identity exposed pre-auth" true as a property of the shape rather
 * than as a rule somebody has to remember.
 */
export async function getPortalBranding(
  supabase: SupabaseClient<Database>,
  companyId: string
): Promise<PortalBranding> {
  const { data } = await supabase
    .from('companies')
    .select('name, logo_url, brand_color')
    .eq('id', companyId)
    .maybeSingle();

  const c = (data ?? null) as { name: string; logo_url: string | null; brand_color: string | null } | null;
  return {
    companyName: c?.name ?? '',
    logoUrl: c?.logo_url ?? null,
    brandColor: c?.brand_color ?? null,
  };
}

/** Her projects. The list IS the policy — no filtering happens here. */
export async function getPortalProjects(
  supabase: SupabaseClient<Database>
): Promise<PortalProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, status, start_date, target_end_date, actual_end_date, contact_address_id')
    .eq('is_deleted', false)
    .order('status')
    .order('name');
  if (error) throw error;

  const rows = (data ?? []) as {
    id: string;
    name: string;
    status: string;
    start_date: string | null;
    target_end_date: string | null;
    actual_end_date: string | null;
    contact_address_id: string | null;
  }[];

  // The job-site address, through `contact_addresses_select_client_site` —
  // which grants the SITE address and not the home one. A client who has no
  // readable address simply gets null; that is the floor working, not an error.
  const addressIds = rows.map((r) => r.contact_address_id).filter((v): v is string => !!v);
  const addressById = new Map<string, string>();
  if (addressIds.length) {
    const { data: addrs } = await supabase
      .from('contact_addresses')
      .select('id, address_line1, city, state, zip')
      .in('id', addressIds);
    for (const a of (addrs ?? []) as {
      id: string;
      address_line1: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    }[]) {
      addressById.set(
        a.id,
        [a.address_line1, [a.city, a.state].filter(Boolean).join(', '), a.zip]
          .filter(Boolean)
          .join(' · ')
      );
    }
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    start_date: r.start_date,
    target_end_date: r.target_end_date,
    actual_end_date: r.actual_end_date,
    address: r.contact_address_id ? addressById.get(r.contact_address_id) ?? null : null,
  }));
}

/**
 * R14 — "event titles only. No detail, no assignments, no crew."
 *
 * Through `client_schedule()`, never `tasks`. The function projects the safe
 * columns; the table has no client policy at all, because RLS is row-level and
 * cannot hide `description` or `assignee_id` from a PostgREST call.
 */
export async function getPortalSchedule(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<PortalScheduleEntry[]> {
  const { data, error } = await supabase.rpc('client_schedule', { p_project_id: projectId });
  if (error) throw error;
  return (data ?? []) as unknown as PortalScheduleEntry[];
}

/** Contracts, contract documents and change orders, in one list. */
export async function getPortalDocuments(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<PortalDocument[]> {
  const [contracts, docs, cos] = await Promise.all([
    // ⚠️ `contract_value` IS on this row and she may read it — it is HER
    // contract, and the Floor governs staff, not the counterparty. Selected
    // deliberately rather than left to leak: RLS cannot hide a column, so the
    // choice is between showing it and pretending it is not there.
    supabase
      .from('client_contracts')
      .select('id, status, created_at, executed_date, contract_value')
      .eq('project_id', projectId),
    supabase
      .from('contract_documents')
      .select('id, status, created_at, document_kind')
      .eq('project_id', projectId),
    supabase
      .from('change_orders')
      .select('id, status, created_at, co_number, title')
      .eq('project_id', projectId),
  ]);

  const out: PortalDocument[] = [];

  for (const c of (contracts.data ?? []) as {
    id: string;
    status: string;
    created_at: string | null;
    executed_date: string | null;
    contract_value: number | string | null;
  }[]) {
    out.push({
      id: c.id,
      kind: 'contract',
      title: 'Contract',
      status: c.status,
      created_at: c.created_at,
      signable: false,
      amount: c.contract_value === null ? null : Number(c.contract_value),
    });
  }

  for (const d of (docs.data ?? []) as {
    id: string;
    status: string;
    created_at: string | null;
    document_kind: string | null;
  }[]) {
    out.push({
      id: d.id,
      kind: 'contract_document',
      title: d.document_kind === 'client_contract' ? 'Contract document' : 'Document',
      status: d.status,
      created_at: d.created_at,
      signable: false,
    });
  }

  for (const co of (cos.data ?? []) as {
    id: string;
    status: string;
    created_at: string | null;
    co_number: string | null;
    title: string | null;
  }[]) {
    out.push({
      id: co.id,
      kind: 'change_order',
      title: [co.co_number, co.title].filter(Boolean).join(' — ') || 'Change order',
      status: co.status,
      created_at: co.created_at,
      // R10 — a SENT change order is the one awaiting her signature. Stage 5
      // makes this actionable; stage 4 only has to say which ones are pending.
      signable: co.status === 'sent',
    });
  }

  return out.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

/** R14 proposals, through the projecting function. `estimates` stays closed. */
export async function getPortalProposals(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<PortalProposal[]> {
  const { data, error } = await supabase.rpc('client_proposals', { p_project_id: projectId });
  if (error) throw error;
  return (data ?? []) as unknown as PortalProposal[];
}

/**
 * R9/R15 — the tagged photos and files.
 *
 * ⚠️ `display_path` IS THE §6.1 RULING, AND IT IS ONE LINE.
 * An annotated photo is ONE `files` row plus a flattened derivative at
 * `<path>.markup.jpg` with no row of its own. The client sees the MARKED-UP
 * version, so the read is a PATH choice driven by `markup_data`, not a row
 * choice. The storage policy's second branch is what makes the derivative
 * reachable; this is the half that asks for it.
 */
export async function getPortalPhotos(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<PortalPhoto[]> {
  const { data, error } = await supabase
    .from('files')
    .select('id, file_name, file_path, category, created_at, markup_data')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return ((data ?? []) as {
    id: string;
    file_name: string;
    file_path: string;
    category: string | null;
    created_at: string | null;
    markup_data: unknown;
  }[]).map((f) => {
    const hasMarkup = !!f.markup_data;
    return {
      id: f.id,
      file_name: f.file_name,
      file_path: f.file_path,
      category: f.category,
      created_at: f.created_at,
      display_path: hasMarkup ? `${f.file_path}.markup.jpg` : f.file_path,
      has_markup: hasMarkup,
    };
  });
}

/** Signed URLs for the paths above, through the caller's session. */
export async function signPortalPaths(
  supabase: SupabaseClient<Database>,
  paths: string[],
  ttlSeconds: number
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!paths.length) return out;

  const { data } = await supabase.storage
    .from('project-files')
    .createSignedUrls(paths, ttlSeconds);

  for (const row of (data ?? []) as { path: string | null; signedUrl: string | null }[]) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

/**
 * The financial page. **All of it on one page, and totals added.**
 *
 * ⚠️ READ THIS BEFORE ADDING AN INSTRUMENT BRANCH HERE. There is none, and
 * there must not be one. The three shapes below — lines, sections, or neither —
 * are what the DATABASE returned for each bill's own `presentation_level`.
 * A `lump_sum` bill yields no lines because the RESTRICTIVE gate on
 * `invoice_lines` refused them, not because this function declined to ask.
 *
 * That is what makes Josh's "a lump-sum contract can carry a T&M change order"
 * work without a special case: two bills on one project can disagree, and this
 * loop renders each on its own terms because it never had an opinion.
 */
export async function getPortalBilling(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<PortalBilling> {
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, invoice_number, title, status, presentation_level, issue_date, due_date, ' +
        'billed_total, amount_receivable, retainage_withheld'
    )
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('issue_date', { ascending: false });
  if (error) throw error;

  const heads = (data ?? []) as unknown as {
    id: string;
    invoice_number: string | null;
    title: string | null;
    status: string;
    presentation_level: PortalInvoice['presentation_level'];
    issue_date: string | null;
    due_date: string | null;
    billed_total: number | string | null;
    amount_receivable: number | string | null;
    retainage_withheld: number | string | null;
  }[];

  const invoices: PortalInvoice[] = await Promise.all(
    heads.map(async (h) => {
      // Both asked for unconditionally. The database answers with what this
      // bill permits — the branch lives in RLS, where it cannot be forgotten.
      const [linesRes, sectionsRes] = await Promise.all([
        supabase
          .from('invoice_lines')
          .select('id, description, category, quantity, unit_rate, cost_basis, billed_amount')
          .eq('invoice_id', h.id)
          .order('sort_order'),
        supabase.rpc('client_invoice_sections', { p_invoice_id: h.id }),
      ]);

      return {
        id: h.id,
        invoice_number: h.invoice_number,
        title: h.title,
        status: h.status,
        presentation_level: h.presentation_level,
        issue_date: h.issue_date,
        due_date: h.due_date,
        billed_total: n(h.billed_total),
        amount_receivable: n(h.amount_receivable),
        retainage_withheld: n(h.retainage_withheld),
        lines: ((linesRes.data ?? []) as Record<string, unknown>[]).map((l) => ({
          id: String(l.id),
          description: (l.description as string) ?? null,
          category: (l.category as string) ?? null,
          quantity: l.quantity === null ? null : Number(l.quantity),
          unit_rate: l.unit_rate === null ? null : Number(l.unit_rate),
          cost_basis: l.cost_basis === null ? null : Number(l.cost_basis),
          billed_amount: n(l.billed_amount),
        })),
        sections: ((sectionsRes.data ?? []) as unknown as Record<string, unknown>[]).map((s) => ({
          category: String(s.category),
          billed_subtotal: n(s.billed_subtotal),
        })),
      };
    })
  );

  return {
    invoices,
    totalBilled: invoices.reduce((t, i) => t + i.billed_total, 0),
    totalReceivable: invoices.reduce((t, i) => t + i.amount_receivable, 0),
    totalRetainage: invoices.reduce((t, i) => t + i.retainage_withheld, 0),
  };
}
