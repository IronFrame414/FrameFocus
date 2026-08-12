import { createClient } from '@/lib/supabase-browser';
import { uploadFile } from '@/lib/services/files-client';
import { canVoidRelease } from '@/lib/services/lien-releases-shared';
import type {
  BoxKind,
  ReleaseDirection,
  ReleaseType,
} from '@/lib/services/lien-releases-shared';
import type { Database } from '@framefocus/shared/types/database';

// Module 7F — client mutations. Owner/Admin by RLS on every table (§8.2);
// these return friendly errors on top (the 7C/7D/7E precedent).
//
// ⚠️ TYPE-ONLY IMPORTS FROM THE SHARED FILE, never from `lien-releases.ts`.
// A value import from the server file pulls `next/headers` into the client
// bundle and tsc does not catch it (§11.1).

type TemplateInsert = Database['public']['Tables']['lien_release_templates']['Insert'];
type TemplateUpdate = Database['public']['Tables']['lien_release_templates']['Update'];
type BoxInsert = Database['public']['Tables']['lien_release_template_boxes']['Insert'];

type MutationResult = { success: boolean; error?: string; warning?: string };
type CreateResult = { success: boolean; id?: string; error?: string };

function friendly(message: string): string {
  if (/row-level security|violates row-level/i.test(message)) {
    return 'Lien releases are Owner/Admin only.';
  }
  if (/lien_releases_one_per_invoice_type|duplicate key/i.test(message)) {
    return 'A release of this type already exists for this invoice. Void it before issuing another.';
  }
  if (/lien_releases_subject_check/i.test(message)) {
    return 'A release must point at exactly one invoice.';
  }
  if (/lien_release_template_boxes_bounds_check/i.test(message)) {
    return 'That box falls outside the page.';
  }
  if (/lien_release_template_boxes_payload_check/i.test(message)) {
    return 'A value box needs a field, and a custom box needs a label.';
  }
  return message;
}

// ── Templates (Company Settings) ────────────────────────────────────────────

export async function createTemplate(input: {
  name: string;
  type: ReleaseType;
  is_final: boolean;
  jurisdiction_state?: string | null;
  direction?: ReleaseDirection;
}): Promise<CreateResult> {
  const supabase = createClient();
  const row: TemplateInsert = {
    name: input.name,
    type: input.type,
    is_final: input.is_final,
    jurisdiction_state: input.jurisdiction_state ?? null,
    direction: input.direction ?? 'client_outbound',
  };
  const { data, error } = await supabase
    .from('lien_release_templates')
    .insert(row)
    .select('id')
    .single();
  if (error) return { success: false, error: friendly(error.message) };
  return { success: true, id: data.id };
}

export async function updateTemplate(
  id: string,
  updates: TemplateUpdate
): Promise<MutationResult> {
  const supabase = createClient();
  // Triggers handle updated_at / updated_by; never set them here.
  const { error } = await supabase.from('lien_release_templates').update(updates).eq('id', id);
  if (error) return { success: false, error: friendly(error.message) };
  return { success: true };
}

export async function softDeleteTemplate(id: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase
    .from('lien_release_templates')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, error: friendly(error.message) };
  return { success: true };
}

/** Upload the company's own form and attach it to a template. */
export async function uploadTemplatePdf(
  file: File,
  templateId: string
): Promise<MutationResult> {
  if (file.type !== 'application/pdf') {
    return { success: false, error: 'The form must be a PDF.' };
  }
  // Company-scoped: a template belongs to the company, not to any job.
  const uploaded = await uploadFile(file, {
    project_id: null,
    path_segment: `lien-releases/templates/${templateId}`,
    category: 'lien_releases',
  });
  if (!uploaded.success || !uploaded.id) {
    return { success: false, error: uploaded.error ?? 'Upload failed.' };
  }
  return updateTemplate(templateId, { pdf_file_id: uploaded.id });
}

// ── Box map ─────────────────────────────────────────────────────────────────

export interface BoxInput {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: BoxKind;
  value_key?: string | null;
  custom_label?: string | null;
}

/**
 * Replace a template's whole box map in one call.
 *
 * REPLACE, NOT MERGE — the placement UI owns the entire map while it is open,
 * and a merge would silently resurrect a box the user just deleted. The
 * approve_expense reconciliation (7A A-6) is the precedent: replace, never
 * append.
 */
export async function saveBoxMap(
  templateId: string,
  boxes: BoxInput[]
): Promise<MutationResult> {
  const supabase = createClient();

  const { error: clearError } = await supabase
    .from('lien_release_template_boxes')
    .delete()
    .eq('template_id', templateId);
  if (clearError) return { success: false, error: friendly(clearError.message) };

  if (boxes.length === 0) return { success: true };

  const rows: BoxInsert[] = boxes.map((b) => ({
    template_id: templateId,
    page: b.page,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    kind: b.kind,
    value_key: b.kind === 'value' ? (b.value_key ?? null) : null,
    custom_label: b.kind === 'custom' ? (b.custom_label ?? null) : null,
  }));

  const { error } = await supabase.from('lien_release_template_boxes').insert(rows);
  if (error) return { success: false, error: friendly(error.message) };
  return { success: true };
}

// ── Releases ────────────────────────────────────────────────────────────────

export async function voidRelease(
  id: string,
  status: Parameters<typeof canVoidRelease>[0],
  reason: string
): Promise<MutationResult> {
  const decision = canVoidRelease(status, reason);
  if (!decision.allowed) return { success: false, error: decision.reason };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // The void-shape CHECK requires all three together, so they are written
  // together — a partial void is refused by the database, not by this code.
  const { error } = await supabase
    .from('lien_releases')
    .update({
      status: 'voided',
      void_reason: reason,
      voided_by: user.id,
      voided_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { success: false, error: friendly(error.message) };
  return { success: true };
}

/** §8.1 — a corrected release issues with an optional supersedes-link. */
export async function markReleaseSent(id: string): Promise<MutationResult> {
  const supabase = createClient();
  const { error } = await supabase.from('lien_releases').update({ status: 'sent' }).eq('id', id);
  if (error) return { success: false, error: friendly(error.message) };
  return { success: true };
}

/**
 * §7 — the notary path: the company prints the blank, has it notarized, and
 * uploads the executed copy. BOTH files are retained — only the upload is
 * legally operative, and the pair is the audit trail.
 */
export async function attachNotarizedCopy(
  releaseId: string,
  file: File
): Promise<MutationResult> {
  if (file.type !== 'application/pdf') {
    return { success: false, error: 'The notarized copy must be a PDF.' };
  }
  const uploaded = await uploadFile(file, {
    project_id: null,
    path_segment: `lien-releases/${releaseId}`,
    category: 'lien_releases',
  });
  if (!uploaded.success || !uploaded.id) {
    return { success: false, error: uploaded.error ?? 'Upload failed.' };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from('lien_releases')
    .update({ notarized_pdf_file_id: uploaded.id, status: 'notarized' })
    .eq('id', releaseId);
  if (error) return { success: false, error: friendly(error.message) };
  return { success: true };
}
