import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { Database } from '@framefocus/shared/types/database';
import { getChangeOrderData, type ChangeOrderData } from '@/lib/change-orders/co-data';
import { ChangeOrderDocument } from '@/lib/change-orders/co-template';

// Signed-artifact spec §6 — CO PDF pipeline, server-only. Mirrors
// proposal-service.ts: generate the branded document, composite a signature
// block, store the artifact in Module 3. Two artifacts per signed CO (spec §6):
//   v1 — contractor-signed, client-unsigned. Created at send. Attached to the
//        send email.
//   v2 — fully signed. Created at client signature. Attached to both
//        confirmation emails.
// Both persist; v1 is never overwritten. The Supabase client is a parameter so
// this works under RLS (send route) AND with the service-role client (public
// signing completion).

/** Renders the branded CO PDF (unsigned base). */
export async function generateChangeOrderPDF(
  supabase: SupabaseClient<Database>,
  changeOrderId: string
): Promise<{ buffer: Buffer; data: ChangeOrderData } | null> {
  const data = await getChangeOrderData(supabase, changeOrderId);
  if (!data) return null;
  const buffer = await renderToBuffer(ChangeOrderDocument({ data }));
  return { buffer, data };
}

export interface CoSignatureStamp {
  block: 'contractor' | 'client';
  /** PNG data URL / base64. Null => typed-name signature (render the name). */
  signatureImageBase64: string | null;
  signerName: string;
  signedAtIso: string;
  /**
   * Client block only. DIVERGENCE from proposal-service.compositeSignedPDF,
   * which stamps NO IP: the CO client block prints signer_ip per spec §6 (a
   * convenience copy — the stored co_signing_sessions.signer_ip row is the
   * record of weight, §3). The estimate composite is intentionally NOT
   * retrofitted (finding 5, confirmed Session 64).
   */
  signerIp?: string | null;
}

/**
 * Stamps one signature block onto the CO PDF with pdf-lib. Contractor = left
 * column, client = right column, both in the reserved signature area at the
 * bottom of the last page (the template leaves room via the page's bottom
 * padding). v2 is produced by stamping the contractor block then the client
 * block onto the same buffer.
 */
export async function compositeSignedCoPDF(
  pdfBuffer: Buffer,
  params: CoSignatureStamp
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const scriptFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 48;
  const gutter = 32;
  const colWidth = (lastPage.getWidth() - margin * 2 - gutter) / 2;
  const x = params.block === 'contractor' ? margin : margin + colWidth + gutter;
  const baselineY = 96;

  if (params.signatureImageBase64) {
    const base64 = params.signatureImageBase64.replace(/^data:image\/\w+;base64,/, '');
    const png = await pdfDoc.embedPng(Buffer.from(base64, 'base64'));
    const scale = Math.min(160 / png.width, 40 / png.height, 1);
    lastPage.drawImage(png, {
      x,
      y: baselineY,
      width: png.width * scale,
      height: png.height * scale,
    });
  } else {
    // Typed-name signature — render the printed name as the mark.
    lastPage.drawText(params.signerName, {
      x,
      y: baselineY + 6,
      size: 18,
      font: scriptFont,
      color: rgb(0.07, 0.09, 0.15),
    });
  }

  const signedDate = new Date(params.signedAtIso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const label = params.block === 'contractor' ? 'Contractor' : 'Client';

  lastPage.drawText(`${label}: ${params.signerName}`, {
    x,
    y: baselineY - 14,
    size: 9,
    font: boldFont,
    color: rgb(0.07, 0.09, 0.15),
  });
  lastPage.drawText(`Date: ${signedDate}`, {
    x,
    y: baselineY - 27,
    size: 9,
    font,
    color: rgb(0.07, 0.09, 0.15),
  });

  let auditY = baselineY - 40;
  if (params.block === 'client' && params.signerIp) {
    lastPage.drawText(`IP: ${params.signerIp}`, {
      x,
      y: auditY,
      size: 7,
      font,
      color: rgb(0.42, 0.45, 0.5),
    });
    auditY -= 10;
  }
  lastPage.drawText(
    `Signed electronically via FrameFocus on ${new Date(params.signedAtIso).toISOString()}`,
    { x, y: auditY, size: 7, font, color: rgb(0.42, 0.45, 0.5) }
  );

  const out = await pdfDoc.save();
  return Buffer.from(out);
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

/**
 * Downloads a stored image (e.g. the company's saved contractor signature) as
 * base64 for compositing. Returns null on any failure — a missing image must
 * not block the signing flow (the typed-name path is always available).
 */
export async function downloadImageBase64(
  admin: SupabaseClient<Database>,
  bucket: 'project-files',
  path: string
): Promise<string | null> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString('base64');
}
