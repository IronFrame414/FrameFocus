import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { Database } from '@framefocus/shared/types/database';
import { getInvoicePdfData, type InvoicePdfData } from '@/lib/invoices/invoice-data';
import { InvoiceDocument } from '@/lib/invoices/invoice-template';

// 7D §13 — invoice PDF pipeline, server-only. Follows the SHIPPED pattern:
// render via co-pdf-service's shape (generate* returns { buffer, data }) and
// store via delivery-pdf-service's shape (upload to project-files, insert the
// files row, then hard-remove the stale artifact so there is ONE current PDF).
// No new mechanism, no new branding.
//
// WHAT THIS IS NOT: email delivery (RESEND, §13) and the pay link (7G) are
// deliberately NOT here. This is §13's OTHER path — print/download — which the
// Pre-M9 gate does not block because nothing leaves the company.
//
// Reads go through the CALLER'S RLS client, so a caller who cannot see the
// invoice generates nothing. The admin client does the storage write, the files
// insert and the stale-artifact cleanup, mirroring delivery-pdf-service: the
// files DELETE policy is Owner/Admin-only, and a PM regenerating an invoice PDF
// could not purge the stale blob under RLS.

const BUCKET = 'project-files';

/** Render only — no storage. Used for the draft preview and for streaming. */
export async function generateInvoicePDF(
  supabase: SupabaseClient<Database>,
  invoiceId: string
): Promise<{ buffer: Buffer; data: InvoicePdfData } | null> {
  const data = await getInvoicePdfData(supabase, invoiceId);
  if (!data) return null;
  const buffer = await renderToBuffer(InvoiceDocument({ data }));
  return { buffer, data };
}

function fileNameFor(data: InvoicePdfData): string {
  const stem = data.invoice.number ?? `draft-${data.invoice.id.slice(0, 8)}`;
  return `invoice-${stem}.pdf`;
}

/**
 * Render an ISSUED invoice and store it against the project, replacing any
 * previous artifact for the same invoice. Returns the files.id.
 *
 * A DRAFT is never stored — §13's draft affordance is a preview, and a
 * watermarked draft sitting in the project's Files list alongside real invoices
 * is exactly the confusion the watermark exists to prevent. The route renders
 * drafts and streams them without calling this.
 */
export async function storeInvoicePdf(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  invoiceId: string
): Promise<{ fileId: string | null; buffer: Buffer | null; error: string | null }> {
  const rendered = await generateInvoicePDF(rls, invoiceId);
  if (!rendered) return { fileId: null, buffer: null, error: 'Invoice not found' };
  const { buffer, data } = rendered;

  if (data.isDraft) {
    return { fileId: null, buffer, error: null }; // preview only, never stored
  }

  const { data: invoiceRow } = await rls
    .from('invoices')
    .select('company_id, project_id')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoiceRow) return { fileId: null, buffer, error: 'Invoice not found' };

  const fileName = fileNameFor(data);
  const storagePath = `${invoiceRow.company_id}/${invoiceRow.project_id}/${randomUUID()}-${fileName}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
  if (uploadError) return { fileId: null, buffer, error: `Upload failed: ${uploadError.message}` };

  // The stale artifact for THIS invoice, found via files.invoice_id
  // (migration 20260802000000). Category 'invoices' was already in
  // files_category_check and already gated to Owner/Admin/PM.
  const { data: previous } = await admin
    .from('files')
    .select('id, file_path')
    .eq('invoice_id', invoiceId);

  const { data: fileRow, error: insertError } = await admin
    .from('files')
    .insert({
      company_id: invoiceRow.company_id,
      project_id: invoiceRow.project_id,
      invoice_id: invoiceId,
      category: 'invoices',
      file_name: fileName,
      file_path: storagePath,
      file_size: buffer.byteLength,
      mime_type: 'application/pdf',
    })
    .select('id')
    .single();
  if (insertError) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { fileId: null, buffer, error: `File insert failed: ${insertError.message}` };
  }

  for (const old of previous ?? []) {
    await admin.storage.from(BUCKET).remove([old.file_path]);
    await admin.from('files').delete().eq('id', old.id);
  }

  return { fileId: fileRow.id, buffer, error: null };
}
