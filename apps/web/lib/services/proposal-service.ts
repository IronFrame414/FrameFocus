import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { Database } from '@framefocus/shared/types/database';
import { getProposalData, type ProposalData } from '@/lib/proposal/proposal-data';
import { ProposalDocument } from '@/lib/proposal/proposal-template';
import { brand } from '@/lib/brand';

// Spec 2 (4E/4F) — PDF orchestration, server-only.
// E3: unsigned PDFs are regenerated on demand from estimate data and
// never stored (avoids stale-PDF drift). Only the signed PDF (4F
// output) is stored in Module 3.

/**
 * Renders the branded proposal PDF for an estimate. The Supabase
 * client decides visibility: server client (RLS) for dashboard
 * callers, service-role client for the public signing flow.
 */
export async function generateProposalPDF(
  supabase: SupabaseClient<Database>,
  estimateId: string
): Promise<{ buffer: Buffer; data: ProposalData } | null> {
  const data = await getProposalData(supabase, estimateId);
  if (!data) return null;

  const buffer = await renderToBuffer(ProposalDocument({ data }));
  return { buffer, data };
}

/**
 * F6 — overlays the captured signature onto the unsigned PDF with
 * pdf-lib: signature image + printed name + date on the signature
 * area of the last page, plus a small audit line.
 */
export async function compositeSignedPDF(
  pdfBuffer: Buffer,
  params: {
    signatureImageBase64: string; // data URL or raw base64 PNG
    signerName: string;
    signedAtIso: string;
  }
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = pages[pages.length - 1];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const base64 = params.signatureImageBase64.replace(/^data:image\/\w+;base64,/, '');
  const pngBytes = Buffer.from(base64, 'base64');
  const png = await pdfDoc.embedPng(pngBytes);

  // The template's signature line sits at the bottom of the content
  // flow; draw the signature block in the reserved area above the
  // footer. Coordinates are from the page's bottom-left.
  const margin = 48;
  const baselineY = 96;
  const sigMaxWidth = 180;
  const sigMaxHeight = 48;
  const scale = Math.min(sigMaxWidth / png.width, sigMaxHeight / png.height, 1);

  lastPage.drawImage(png, {
    x: margin,
    y: baselineY,
    width: png.width * scale,
    height: png.height * scale,
  });

  const signedDate = new Date(params.signedAtIso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  lastPage.drawText(`Signed by: ${params.signerName}`, {
    x: margin,
    y: baselineY - 14,
    size: 10,
    font: boldFont,
    color: rgb(0.07, 0.09, 0.15),
  });
  lastPage.drawText(`Date: ${signedDate}`, {
    x: margin,
    y: baselineY - 28,
    size: 10,
    font,
    color: rgb(0.07, 0.09, 0.15),
  });
  // FORWARD-ONLY [S99]. This runs at signing time and stamps the artifact being
  // generated right now. Already-signed PDFs in project-files keep the name they
  // were signed under — they are executed documents and are never rewritten.
  // A rebrand does not reach backwards into a signed record.
  lastPage.drawText(
    `Signed electronically via ${brand.name} on ${new Date(params.signedAtIso).toISOString()}`,
    {
      x: margin,
      y: baselineY - 42,
      size: 7,
      font,
      color: rgb(0.42, 0.45, 0.5),
    }
  );

  const out = await pdfDoc.save();
  return Buffer.from(out);
}

/**
 * Stores the signed PDF in Module 3: project-files bucket at
 * {company_id}/proposals/{uuid}-{estimate_number}-signed.pdf with a
 * files row (project_id NULL until Module 5). Service-role client —
 * the signer has no authenticated context.
 */
export async function storeSignedPDF(
  admin: SupabaseClient<Database>,
  params: {
    companyId: string;
    estimateNumber: string;
    signedPdfBuffer: Buffer;
  }
): Promise<{ fileId: string | null; error: string | null }> {
  const fileName = `${params.estimateNumber}-signed.pdf`;
  const storagePath = `${params.companyId}/proposals/${randomUUID()}-${fileName}`;

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
      project_id: null,
      category: 'contracts',
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
