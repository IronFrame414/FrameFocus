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
