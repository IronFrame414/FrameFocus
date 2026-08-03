import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import {
  presentInvoice,
  type PresentationLevel,
  type PresentationLine,
  type PresentedInvoice,
} from '@framefocus/shared/utils/invoice-derivation';
import { lineInstrumentKey } from '@/lib/services/invoices-shared';
import type { InvoiceLineType } from '@/lib/services/invoices-shared';

// 7D §11/§13 — data assembly for the invoice PDF. Mirrors co-data.ts: pull the
// record, its lines, the company branding block and the client, and hand a flat
// shape to the template. The BRANDING SELECT is copied from co-data verbatim so
// invoices carry the same letterhead as change orders and proposals — no new
// branding was built (§13 delivery, non-email path).
//
// The presentation split is NOT restated here: presentInvoice() in the shared
// derivation util is the single implementation of §11's three levels, already
// covered by the trace tests. This file only maps rows into its input shape.

export interface InvoicePdfData {
  company: {
    name: string;
    logoUrl: string | null;
    brandColor: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    phone: string | null;
    email: string | null;
    licenseNumber: string | null;
    timezone: string;
  };
  invoice: {
    id: string;
    /** NULL until the invoice is sent — the template prints the draft notice. */
    number: string | null;
    title: string | null;
    status: string;
    issueDate: string;
    /** NULL = due on receipt (7D terms, ruled S97). */
    dueDate: string | null;
    isDeposit: boolean;
    presentationLevel: PresentationLevel;
    /** §5 — withheld, shown separately and OUTSIDE the receivable. */
    retainagePercent: number | null;
    retainageWithheld: number;
    billedTotal: number;
    amountReceivable: number;
    notes: string | null;
  };
  project: { name: string; number: string | null } | null;
  client: { name: string; companyName: string | null } | null;
  presented: PresentedInvoice;
  /** True for anything not yet sent — the template watermarks it. */
  isDraft: boolean;
  generatedAt: string;
}

export async function getInvoicePdfData(
  supabase: SupabaseClient<Database>,
  invoiceId: string
): Promise<InvoicePdfData | null> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) return null;

  const [companyRes, projectRes, linesRes] = await Promise.all([
    supabase
      .from('companies')
      .select(
        'name, logo_url, brand_color, address_line1, address_line2, city, state, zip, phone, email, license_number, timezone'
      )
      .eq('id', invoice.company_id)
      .single(),
    supabase
      .from('projects')
      .select('name, project_number, contact_id')
      .eq('id', invoice.project_id)
      .maybeSingle(),
    supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true }),
  ]);

  const company = companyRes.data;
  if (!company) return null;

  let client: InvoicePdfData['client'] = null;
  if (projectRes.data?.contact_id) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('first_name, last_name, company_name')
      .eq('id', projectRes.data.contact_id)
      .maybeSingle();
    if (contact) {
      client = {
        name: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—',
        companyName: contact.company_name,
      };
    }
  }

  // §11 [S97] — an invoice may span instruments (§2), and full detail groups by
  // instrument, so each line needs its instrument's NAME. Change orders are
  // read once here; the originating estimate is always "Original Contract".
  const coIds = [
    ...new Set(
      (linesRes.data ?? [])
        .map((l) => l.source_change_order_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const coLabels = new Map<string, string>();
  if (coIds.length > 0) {
    const { data: cos } = await supabase
      .from('change_orders')
      .select('id, co_number, title')
      .in('id', coIds);
    for (const co of cos ?? []) {
      coLabels.set(co.id, `${co.co_number}${co.title ? ` — ${co.title}` : ''}`);
    }
  }

  // §11 — the client sees BILLED amounts, never the calculated figure (§8:
  // 7G exports and 7H report billed). cost_basis is the row's actual,
  // UNBURDENED cost (§6.4 — burden never reaches a client bill).
  const lines: PresentationLine[] = (linesRes.data ?? []).map((l) => ({
    description: l.description,
    category: l.category as PresentationLine['category'],
    costBasis: l.cost_basis === null ? null : Number(l.cost_basis),
    amount: Number(l.billed_amount),
    lineType: l.line_type as InvoiceLineType,
    instrumentKey: lineInstrumentKey(l),
    instrumentLabel: l.source_change_order_id
      ? coLabels.get(l.source_change_order_id) ?? 'Change order'
      : l.source_estimate_id
        ? 'Original Contract'
        : '',
  }));

  const level = invoice.presentation_level as PresentationLevel;

  return {
    company: {
      name: company.name,
      logoUrl: company.logo_url,
      brandColor: company.brand_color || '#1f2937',
      addressLine1: company.address_line1,
      addressLine2: company.address_line2,
      city: company.city,
      state: company.state,
      zip: company.zip,
      phone: company.phone,
      email: company.email,
      licenseNumber: company.license_number,
      timezone: company.timezone,
    },
    invoice: {
      id: invoice.id,
      number: invoice.invoice_number,
      title: invoice.title,
      status: invoice.status,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date ?? null,
      isDeposit: invoice.invoice_type === 'deposit',
      presentationLevel: level,
      retainagePercent: invoice.retainage_percent === null ? null : Number(invoice.retainage_percent),
      retainageWithheld: Number(invoice.retainage_withheld),
      billedTotal: Number(invoice.billed_total),
      amountReceivable: Number(invoice.amount_receivable),
      notes: invoice.notes,
    },
    project: projectRes.data
      ? { name: projectRes.data.name, number: projectRes.data.project_number }
      : null,
    client,
    presented: presentInvoice(lines, level),
    isDraft: invoice.status === 'draft' || invoice.status === 'pending_approval',
    generatedAt: new Date().toISOString(),
  };
}
