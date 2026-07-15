import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { Database } from '@framefocus/shared/types/database';
import {
  getChangeOrderData,
  type ChangeOrderData,
  type ChangeOrderDataOptions,
} from '@/lib/change-orders/co-data';
import { ChangeOrderDocument } from '@/lib/change-orders/co-template';

// Signed-artifact spec §6 — CO PDF pipeline, server-only. Mirrors
// proposal-service.ts: render the branded document and store the artifact in
// Module 3. Signatures are rendered NATIVELY by co-template.tsx — there is no
// post-render pdf-lib compositing step. Two artifacts per signed CO (spec §6):
//   v1 — contractor-signed, client-unsigned. Created at send (render with the
//        contractor signature, which is already on the CO row). Attached to the
//        send email.
//   v2 — fully signed. Created at client signature (render with the contractor
//        signature from the row PLUS the client signature passed in via
//        `signatureOverride`, since it is not yet persisted). Attached to both
//        confirmation emails.
// Both persist; v1 is never overwritten. The Supabase client is a parameter so
// this works under RLS (send route) AND with the service-role client (public
// signing completion).

/**
 * Renders the branded CO PDF. The signature marks are drawn from the CO row
 * (contractor) and from `options.signatureOverride` (client, v2 only) — see
 * getChangeOrderData. With no override this yields v1 (contractor only); with a
 * client override it yields v2 (both blocks).
 */
export async function generateChangeOrderPDF(
  supabase: SupabaseClient<Database>,
  changeOrderId: string,
  options: ChangeOrderDataOptions = {}
): Promise<{ buffer: Buffer; data: ChangeOrderData } | null> {
  const data = await getChangeOrderData(supabase, changeOrderId, options);
  if (!data) return null;
  const buffer = await renderToBuffer(ChangeOrderDocument({ data }));
  return { buffer, data };
}

/**
 * Stores a signed CO artifact in Module 3: project-files bucket at
 * {company_id}/change-orders/{uuid}-{co_number}-{variant}.pdf, with a files
 * row. Service-role client — the signer has no authenticated context. Mirrors
 * proposal-service.storeSignedPDF; project_id is set (Module 5 is live).
 */
export async function storeSignedCoPDF(
  admin: SupabaseClient<Database>,
  params: {
    companyId: string;
    projectId: string;
    coNumber: string;
    variant: 'v1' | 'v2';
    signedPdfBuffer: Buffer;
  }
): Promise<{ fileId: string | null; error: string | null }> {
  const fileName = `${params.coNumber}-${params.variant}.pdf`;
  const storagePath = `${params.companyId}/change-orders/${randomUUID()}-${fileName}`;

  const { error: uploadError } = await admin.storage
    .from('project-files')
    .upload(storagePath, params.signedPdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (uploadError) return { fileId: null, error: uploadError.message };

  const { data, error: insertError } = await admin
    .from('files')
    .insert({
      company_id: params.companyId,
      project_id: params.projectId,
      category: 'change_orders',
      file_name: fileName,
      file_path: storagePath,
      file_size: params.signedPdfBuffer.byteLength,
      mime_type: 'application/pdf',
    })
    .select('id')
    .single();
  if (insertError) return { fileId: null, error: insertError.message };
  return { fileId: data.id, error: null };
}

// downloadImageBase64 now lives in co-data (its sole consumer). Re-exported here
// so the historical `@/lib/services/co-pdf-service` import path stays valid.
export { downloadImageBase64 } from '@/lib/change-orders/co-data';
