import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { Database } from '@framefocus/shared/types/database';
import { IncidentDocument, type IncidentPdfData } from '@/lib/safety/incident-template';
import { getIncident, getIncidentPhotos } from '@/lib/services/safety';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { downloadImageBase64 } from '@/lib/change-orders/co-data';

// 6C §7 — incident PDF pipeline. Same shape as the 6B daily-log pipeline:
// render → upload new artifact (category 'safety') → repoint pdf_file_id →
// admin purges the stale blob + row. One always-current PDF, no versioning.
// Project-less (shop/yard) incidents store under a 'company' path segment —
// files.project_id stays NULL and storage-object RLS is company-keyed by the
// first path segment, which is unchanged.

const BUCKET = 'project-files';
const MAX_EMBEDDED_PHOTOS = 12;

// react-pdf decodes only JPEG and PNG — see daily-log-pdf-service.ts. Other
// image types (HEIC, webp, gif) stay counted but not embedded.
const EMBEDDABLE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'incident'
  );
}

export async function regenerateIncidentPdf(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  incidentId: string
): Promise<{ fileId: string | null; error: string | null }> {
  const incident = await getIncident(incidentId);
  if (!incident) return { fileId: null, error: 'Incident not found' };

  const { timezone } = await getCompanyTimeSettings();
  const [{ data: company }, photos] = await Promise.all([
    rls.from('companies').select('name').eq('id', incident.company_id).maybeSingle(),
    getIncidentPhotos(incidentId),
  ]);

  const embeddable = photos.filter((p) => EMBEDDABLE_MIME_TYPES.has(p.mime_type));
  const embedded: { dataUri: string }[] = [];
  for (const photo of embeddable.slice(0, MAX_EMBEDDED_PHOTOS)) {
    const base64 = await downloadImageBase64(rls, BUCKET, photo.file_path);
    if (base64) embedded.push({ dataUri: `data:${photo.mime_type};base64,${base64}` });
  }

  const data: IncidentPdfData = {
    companyName: company?.name ?? 'Company',
    projectName: incident.project?.name ?? 'No project (shop/yard)',
    incidentDate: incident.incident_date,
    incidentType: incident.incident_type,
    status: incident.status,
    reporterName: incident.reporter?.display_name ?? 'Unknown',
    description: incident.description,
    preventionNotes: incident.prevention_notes,
    outcome: incident.outcome,
    injuries: incident.injuries.map((p) => ({
      name: p.member?.display_name ?? p.injured_name ?? 'Unknown',
      isOutsider: p.member_id === null,
      treatmentSought: p.treatment_sought,
      treatmentNotes: p.treatment_notes,
    })),
    witnesses: incident.witnesses.map((w) => ({
      name: w.member?.display_name ?? w.witness_name ?? 'Unknown',
      isOutsider: w.member_id === null,
    })),
    photos: embedded,
    photoCount: photos.length,
    generatedAt: new Date().toISOString(),
    timeZone: timezone,
  };

  const buffer = await renderToBuffer(IncidentDocument({ data }));

  const fileName = `incident-${incident.incident_date}-${slug(data.reporterName)}-${incidentId.slice(0, 8)}.pdf`;
  const pathSegment = incident.project_id ?? 'company';
  const storagePath = `${incident.company_id}/${pathSegment}/${randomUUID()}-${fileName}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
  if (uploadError) return { fileId: null, error: `Upload failed: ${uploadError.message}` };

  const { data: fileRow, error: insertError } = await admin
    .from('files')
    .insert({
      company_id: incident.company_id,
      project_id: incident.project_id,
      category: 'safety',
      file_name: fileName,
      file_path: storagePath,
      file_size: buffer.byteLength,
      mime_type: 'application/pdf',
    })
    .select('id')
    .single();
  if (insertError) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { fileId: null, error: `File insert failed: ${insertError.message}` };
  }

  const previousFileId = incident.pdf_file_id;
  const { error: pointError } = await admin
    .from('safety_incidents')
    .update({ pdf_file_id: fileRow.id })
    .eq('id', incidentId);
  if (pointError) return { fileId: fileRow.id, error: `Repoint failed: ${pointError.message}` };

  if (previousFileId) {
    const { data: old } = await admin
      .from('files')
      .select('file_path')
      .eq('id', previousFileId)
      .maybeSingle();
    if (old) {
      await admin.storage.from(BUCKET).remove([old.file_path]);
      await admin.from('files').delete().eq('id', previousFileId);
    }
  }

  return { fileId: fileRow.id, error: null };
}
