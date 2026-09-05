import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { Database } from '@framefocus/shared/types/database';
import { DeliveryDocument, type DeliveryPdfData } from '@/lib/deliveries/delivery-template';
import {
  getDelivery,
  getDeliveryLevelPhotos,
  getDeliveryPhotos,
  poTitle,
} from '@/lib/services/deliveries';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { downloadPhotoBase64 } from '@/lib/change-orders/co-data';

// 6D — delivery record PDF pipeline, server-only (S90 new scope; mechanics
// identical to daily-log-pdf-service.ts). Regenerate-on-edit, ONE current PDF
// per delivery: upload the new artifact, insert its files row (category
// 'deliveries'), repoint deliveries.pdf_file_id, then hard-remove the stale
// blob + row via the service-role client. The admin client does the repoint
// and cleanup because the files DELETE policy is Owner/Admin-only — a crew
// receiver regenerating their own delivery's PDF could not purge the stale
// file under RLS. Reads happen through the caller's RLS client, so a caller
// who cannot see the delivery generates nothing.

const BUCKET = 'project-files';

// Embedded-photo cap across the whole delivery — same bound as the 6B log
// PDF. Photos beyond the cap stay counted per line; the caption reports the
// remainder left in Module 3.
const MAX_EMBEDDED_PHOTOS = 12;

// react-pdf decodes only JPEG and PNG (HEIC/webp/gif stay counted, not
// embedded — same guard as 6B).
const EMBEDDABLE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'delivery'
  );
}

/**
 * Generate the current PDF for a delivery and replace the stored artifact.
 * Returns the new files.id.
 */
export async function regenerateDeliveryPdf(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  deliveryId: string
): Promise<{ fileId: string | null; error: string | null }> {
  const delivery = await getDelivery(deliveryId);
  if (!delivery) return { fileId: null, error: 'Delivery not found' };

  const { timezone } = await getCompanyTimeSettings();

  const [{ data: project }, { data: company }, photos, generalPhotos] = await Promise.all([
    rls.from('projects').select('name').eq('id', delivery.project_id).maybeSingle(),
    rls.from('companies').select('name').eq('id', delivery.company_id).maybeSingle(),
    getDeliveryPhotos(delivery.items.map((i) => i.id)),
    getDeliveryLevelPhotos(deliveryId),
  ]);

  // Photo bytes come through the caller's RLS client — a caller who cannot
  // read the files embeds nothing. Failed downloads are skipped, not fatal.
  // The cap is delivery-wide, spent in line order.
  const photosByItem = new Map<string, typeof photos>();
  for (const photo of photos) {
    if (!photo.delivery_item_id) continue; // line-bound query; null can't occur
    const list = photosByItem.get(photo.delivery_item_id) ?? [];
    list.push(photo);
    photosByItem.set(photo.delivery_item_id, list);
  }
  let embedBudget = MAX_EMBEDDED_PHOTOS;

  const lines: DeliveryPdfData['lines'] = [];
  for (const item of delivery.items) {
    const itemPhotos = photosByItem.get(item.id) ?? [];
    const embedded: { dataUri: string }[] = [];
    for (const photo of itemPhotos) {
      if (embedBudget <= 0) break;
      if (!EMBEDDABLE_MIME_TYPES.has(photo.mime_type)) continue;
      const embed = await downloadPhotoBase64(rls, BUCKET, photo);
      if (embed) {
        embedded.push({ dataUri: `data:${embed.mimeType};base64,${embed.base64}` });
        embedBudget -= 1;
      }
    }
    lines.push({
      description: item.description,
      qtyReceived: Number(item.qty_received),
      qtyDamaged: Number(item.qty_damaged),
      issueNote: item.issue_note,
      photos: embedded,
      photoCount: itemPhotos.length,
    });
  }

  // General whole-delivery photos spend whatever budget the lines left —
  // line photos (the damage evidence) take priority.
  const embeddedGeneral: { dataUri: string }[] = [];
  for (const photo of generalPhotos) {
    if (embedBudget <= 0) break;
    if (!EMBEDDABLE_MIME_TYPES.has(photo.mime_type)) continue;
    const embed = await downloadPhotoBase64(rls, BUCKET, photo);
    if (embed) {
      embeddedGeneral.push({ dataUri: `data:${embed.mimeType};base64,${embed.base64}` });
      embedBudget -= 1;
    }
  }

  const data: DeliveryPdfData = {
    companyName: company?.name ?? 'Company',
    projectName: project?.name ?? 'Project',
    vendorName: delivery.vendor_name,
    deliveryDate: delivery.delivery_date,
    receiverName: delivery.receiver?.display_name ?? 'Unknown',
    poTitle: delivery.purchase_order
      ? poTitle({ ...delivery.purchase_order, ordered_at: null })
      : null,
    hasExceptions: delivery.has_exceptions,
    notes: delivery.notes,
    lines,
    generalPhotos: embeddedGeneral,
    generalPhotoCount: generalPhotos.length,
    generatedAt: new Date().toISOString(),
    timeZone: timezone,
  };

  const buffer = await renderToBuffer(DeliveryDocument({ data }));

  const fileName = `delivery-${delivery.delivery_date}-${slug(delivery.vendor_name)}-${deliveryId.slice(0, 8)}.pdf`;
  const storagePath = `${delivery.company_id}/${delivery.project_id}/${randomUUID()}-${fileName}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
  if (uploadError) return { fileId: null, error: `Upload failed: ${uploadError.message}` };

  // category 'deliveries' (migration 20260723010000) is not in the FileCategory
  // union's backing CHECK snapshot in database.ts until the next type regen —
  // the insert shape itself is already loose enough (category is string).
  const { data: fileRow, error: insertError } = await admin
    .from('files')
    .insert({
      company_id: delivery.company_id,
      project_id: delivery.project_id,
      category: 'deliveries',
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

  // pdf_file_id (migration 20260723010000) is not in database.ts until the
  // next type regen — swap to a plain typed update then.
  const previousFileId =
    (delivery as unknown as { pdf_file_id?: string | null }).pdf_file_id ?? null;
  const repoint = { pdf_file_id: fileRow.id } as unknown as Database['public']['Tables']['deliveries']['Update'];
  const { error: pointError } = await admin
    .from('deliveries')
    .update(repoint)
    .eq('id', deliveryId);
  if (pointError) return { fileId: fileRow.id, error: `Repoint failed: ${pointError.message}` };

  // Stale artifact cleanup — one always-current PDF, no versioning.
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
