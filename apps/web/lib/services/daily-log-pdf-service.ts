import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { Database } from '@framefocus/shared/types/database';
import { DailyLogDocument, type DailyLogPdfData } from '@/lib/daily-logs/daily-log-template';
import { CLOSEOUT_ITEMS, type CloseoutKey } from '@/lib/daily-logs/closeout';
import { format } from '@/lib/i18n/messages';
import {
  getDailyLog,
  getLogPhotos,
  getProjectDayPresence,
} from '@/lib/services/daily-logs';
import { getDeliveriesForProjectDay } from '@/lib/services/deliveries';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { downloadPhotoBase64 } from '@/lib/change-orders/co-data';

// 6B — daily-log PDF pipeline, server-only (6B-1 §2.3 + Phase 2 Q5 decision).
// Regenerate-on-edit, ONE current PDF per log: upload the new artifact, insert
// its files row, repoint daily_logs.pdf_file_id, then hard-remove the stale
// blob + row via the service-role client. The admin client does the repoint
// and cleanup because the files DELETE policy is Owner/Admin-only — a crew
// author regenerating their own log's PDF could not purge the stale file
// under RLS. Reads happen through the caller's RLS client, so a caller who
// cannot see the log generates nothing.

const BUCKET = 'project-files';

// Embedded-photo cap (S87 revision: photos render IN the PDF, not as a
// count). 12 bounds the file size on photo-heavy days; the caption reports
// the remainder left in Module 3.
const MAX_EMBEDDED_PHOTOS = 12;

// react-pdf decodes only JPEG and PNG. Anything else (HEIC from iPhones,
// webp, gif) would fail the whole render if fed in as a data URI — those
// photos stay counted but not embedded; the caption reports the remainder.
const EMBEDDABLE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'log'
  );
}

/**
 * Generate the current PDF for a daily log and replace the stored artifact.
 * Returns the new files.id.
 */
export async function regenerateDailyLogPdf(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  logId: string
): Promise<{ fileId: string | null; error: string | null }> {
  const log = await getDailyLog(logId);
  if (!log) return { fileId: null, error: 'Daily log not found' };

  const { timezone } = await getCompanyTimeSettings();

  const [{ data: project }, { data: company }, presence, deliveries, photos] = await Promise.all([
    rls.from('projects').select('name').eq('id', log.project_id).maybeSingle(),
    rls.from('companies').select('name').eq('id', log.company_id).maybeSingle(),
    getProjectDayPresence(log.project_id, log.log_date),
    getDeliveriesForProjectDay(log.project_id, log.log_date),
    // Log-bound (S87): the PDF embeds only this log's attachments.
    getLogPhotos(logId),
  ]);

  // Photo bytes come through the caller's RLS client — a caller who cannot
  // read the files embeds nothing. Failed downloads are skipped, not fatal.
  // [S127 5a, RULED #5] The CLIENT-FACING photos (client_visible) go FIRST, so
  // the embed cap can never push them out, and each is marked in the PDF.
  const embeddable = photos
    .filter((p) => EMBEDDABLE_MIME_TYPES.has(p.mime_type))
    .sort((a, b) => Number(Boolean(b.client_visible)) - Number(Boolean(a.client_visible)));
  const embedded: { dataUri: string; clientFacing: boolean }[] = [];
  for (const photo of embeddable.slice(0, MAX_EMBEDDED_PHOTOS)) {
    const embed = await downloadPhotoBase64(rls, BUCKET, photo);
    if (embed)
      embedded.push({
        dataUri: `data:${embed.mimeType};base64,${embed.base64}`,
        clientFacing: Boolean(photo.client_visible),
      });
  }

  const hoursByMember = new Map(presence.map((p) => [p.member_id, p]));
  const data: DailyLogPdfData = {
    companyName: company?.name ?? 'Company',
    projectName: project?.name ?? 'Project',
    logDate: log.log_date,
    authorName: log.author?.display_name ?? 'Unknown',
    weather: log.weather,
    workPerformed: log.work_performed,
    materialUsed: log.material_used,
    materialNeeded: log.material_needed,
    equipmentUsed: log.equipment_used,
    tasksTomorrow: log.tasks_tomorrow,
    notes: log.notes,
    hazardsPresent: log.hazards_present,
    hazardNotes: log.hazard_notes,
    // [S118 item 12] The paper close-out form (English labels from the shared list).
    closeout: CLOSEOUT_ITEMS.map((i) => ({
      label: format('en', i.labelKey),
      value: (log[i.key as CloseoutKey] as boolean | null) ?? null,
    })),
    photosSentAt: log.photos_sent_at,
    tasksTomorrowDate: log.tasks_tomorrow_date,
    tasksDayAfter: log.tasks_day_after,
    tasksDayAfterDate: log.tasks_day_after_date,
    needs: log.material_needs.map((n) => ({
      item: n.item,
      qty: n.qty,
      unit: n.unit,
      neededBy: n.needed_by,
      vendor: n.vendor_source,
      orderedBy: n.ordered_at ? (n.orderer?.display_name ?? 'office') : null,
    })),
    blockers: log.blockers,
    clientPhotoSkipReason: (log as { client_photo_skip_reason?: string | null }).client_photo_skip_reason ?? null,
    officeReviewedBy: log.office_reviewed_at ? (log.reviewer?.display_name ?? 'office') : null,
    officeReviewedAt: log.office_reviewed_at,
    crew: log.crew.map((c) => {
      const p = hoursByMember.get(c.member_id);
      return {
        name: c.member?.display_name ?? 'Member',
        hours: p?.hours ?? null,
        warrantyOnly: p?.warranty_only ?? false,
      };
    }),
    subs: log.sub_entries.map((s) => ({
      name: s.member?.display_name ?? 'Subcontractor',
      hours: s.hours,
      note: s.note,
    })),
    deliveries: deliveries.map((d) => ({
      vendorName: d.vendor_name,
      hasExceptions: d.has_exceptions,
    })),
    photos: embedded,
    photoCount: photos.length,
    generatedAt: new Date().toISOString(),
    timeZone: timezone,
  };

  const buffer = await renderToBuffer(DailyLogDocument({ data }));

  // Filename disambiguates same-project same-date logs by author + short id
  // (6B-spec §9).
  const fileName = `daily-log-${log.log_date}-${slug(data.authorName)}-${logId.slice(0, 8)}.pdf`;
  const storagePath = `${log.company_id}/${log.project_id}/${randomUUID()}-${fileName}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
  if (uploadError) return { fileId: null, error: `Upload failed: ${uploadError.message}` };

  const { data: fileRow, error: insertError } = await admin
    .from('files')
    .insert({
      company_id: log.company_id,
      project_id: log.project_id,
      category: 'daily_logs',
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

  const previousFileId = log.pdf_file_id;
  const { error: pointError } = await admin
    .from('daily_logs')
    .update({ pdf_file_id: fileRow.id })
    .eq('id', logId);
  if (pointError) return { fileId: fileRow.id, error: `Repoint failed: ${pointError.message}` };

  // Stale artifact cleanup — one always-current PDF, no versioning (§2.3).
  if (previousFileId) {
    const { data: old } = await admin
      .from('files')
      .select('file_path')
      .eq('id', previousFileId)
      // #175 [S120]: only this record's OWN previous PDF — same company, same
      // category. The pointer is frozen to the service role (migration
      // 20262110000000), and this check means a pointer that reached a
      // foreign file by any other route still deletes nothing but our own.
      .eq('company_id', log.company_id)
      .eq('category', 'daily_logs')
      .maybeSingle();
    if (old) {
      await admin.storage.from(BUCKET).remove([old.file_path]);
      await admin.from('files').delete().eq('id', previousFileId);
    }
  }

  return { fileId: fileRow.id, error: null };
}
