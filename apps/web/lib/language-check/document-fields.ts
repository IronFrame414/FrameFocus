import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CheckedField } from '@/lib/language-check/english-check';

// S110 H, Q14 — WHICH FIELDS OF A CLIENT-FACING DOCUMENT ARE CHECKED FOR ENGLISH.
// Named for the sender in their own terms ("Line 3 name"), so the warning points
// at something they can find and fix. Read on the SENDER's session (RLS), the
// same reads the document itself is built from.

/** The proposal: FILL-H.9's live case is the estimate NAME, which a site visit's
 *  crew-typed title becomes — the proposal title and the email subject. */
export async function proposalFieldsForCheck(
  supabase: SupabaseClient,
  estimateId: string,
  email: { subject: string; body: string }
): Promise<CheckedField[]> {
  const [{ data: est }, { data: lines }] = await Promise.all([
    supabase
      .from('estimates')
      .select('name, scope_summary, cover_letter, legal_description')
      .eq('id', estimateId)
      .maybeSingle(),
    supabase
      .from('estimate_line_items')
      .select('name, description, sort_order')
      .eq('estimate_id', estimateId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
  ]);
  const e = (est ?? {}) as Record<string, string | null>;
  const fields: CheckedField[] = [
    { field: 'Estimate name (the proposal title)', text: e.name },
    { field: 'Scope summary', text: e.scope_summary },
    { field: 'Cover letter', text: e.cover_letter },
    { field: 'Legal description', text: e.legal_description },
    { field: 'Email subject', text: email.subject },
    { field: 'Email message', text: email.body },
  ];
  (lines ?? []).forEach((l: { name: string | null; description: string | null }, i: number) => {
    fields.push({ field: `Line ${i + 1} name`, text: l.name });
    fields.push({ field: `Line ${i + 1} description`, text: l.description });
  });
  return fields;
}

/** A change order: its title and description, and every line. */
export async function changeOrderFieldsForCheck(
  supabase: SupabaseClient,
  coId: string,
  email: { subject?: string; body?: string }
): Promise<CheckedField[]> {
  const [{ data: co }, { data: lines }] = await Promise.all([
    supabase.from('change_orders').select('title, description').eq('id', coId).maybeSingle(),
    supabase
      .from('change_order_line_items')
      .select('name, description, sort_order')
      .eq('change_order_id', coId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true }),
  ]);
  const c = (co ?? {}) as Record<string, string | null>;
  const fields: CheckedField[] = [
    { field: 'Change order title', text: c.title },
    { field: 'Change order description', text: c.description },
    { field: 'Email subject', text: email.subject },
    { field: 'Email message', text: email.body },
  ];
  (lines ?? []).forEach((l: { name: string | null; description: string | null }, i: number) => {
    fields.push({ field: `Line ${i + 1} name`, text: l.name });
    fields.push({ field: `Line ${i + 1} description`, text: l.description });
  });
  return fields;
}

/** An invoice: every line description — FILL-H.9 #3, an expense's crew-typed
 *  description becomes an invoice line. */
export async function invoiceFieldsForCheck(
  supabase: SupabaseClient,
  invoiceId: string,
  email: { subject?: string; body?: string }
): Promise<CheckedField[]> {
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('description, sort_order')
    .eq('invoice_id', invoiceId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  const fields: CheckedField[] = [
    { field: 'Email subject', text: email.subject },
    { field: 'Email message', text: email.body },
  ];
  (lines ?? []).forEach((l: { description: string | null }, i: number) =>
    fields.push({ field: `Line ${i + 1}`, text: l.description })
  );
  return fields;
}
