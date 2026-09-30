import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import type { Database } from '@framefocus/shared/types/database';
import { SignoutDocument, type SignoutPdfData, type SignoutPdfPhotoSet } from '@/lib/material-signouts/signout-template';
import { RELEASE_CONDITION_KEY, RETURN_CONDITION_KEY, STATUS_KEY } from '@/lib/material-signouts/signout';
import { getMaterialSignout, getSignoutPhotos, type SignoutPhoto } from '@/lib/services/material-signouts';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { downloadPhotoBase64 } from '@/lib/change-orders/co-data';
import { makeT } from '@/lib/i18n/messages';

// S118 item 11 — the sign-out record PDF, server-only. The delivery pipeline's
// mechanics (delivery-pdf-service.ts): reads through the caller's RLS client,
// so a caller who cannot see the record generates nothing; the admin client
// uploads, inserts the files row (category 'material_signout', attached to the
// project like the other field records), repoints pdf_file_id — there is no
// UPDATE policy on the record, by design — and removes the stale artifact.

const BUCKET = 'project-files';
// Per SET, so a full release set can never crowd out the return evidence.
const MAX_EMBEDDED_PER_SET = 6;
const EMBEDDABLE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'material'
  );
}

export async function regenerateSignoutPdf(
  rls: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  signoutId: string
): Promise<{ fileId: string | null; error: string | null }> {
  const record = await getMaterialSignout(signoutId);
  if (!record || record.is_deleted) return { fileId: null, error: 'Sign-out not found' };
  if (record.status === 'pending_receipt') return { fileId: null, error: 'Not signed by the receiving party yet' };

  const t = makeT('en'); // an internal record: English, like every field PDF
  const { timezone } = await getCompanyTimeSettings();
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('en-US', { timeZone: timezone }) : null;

  const [{ data: company }, photos] = await Promise.all([
    rls.from('companies').select('name').eq('id', record.company_id).maybeSingle(),
    getSignoutPhotos(signoutId),
  ]);

  async function photoSet(title: string, set: SignoutPhoto[]): Promise<SignoutPdfPhotoSet> {
    const embedded: SignoutPdfPhotoSet['photos'] = [];
    for (const p of set) {
      if (embedded.length >= MAX_EMBEDDED_PER_SET) break;
      if (!p.file || !EMBEDDABLE_MIME_TYPES.has(p.file.mime_type)) continue;
      const embed = await downloadPhotoBase64(rls, BUCKET, { ...p.file, markup_data: null });
      if (embed) {
        embedded.push({
          dataUri: `data:${embed.mimeType};base64,${embed.base64}`,
          caption: `${title} · ${p.taken_by?.display_name ?? '—'} · ${when(p.created_at)}`,
        });
      }
    }
    return { title, photos: embedded, count: set.length };
  }

  const closed = record.return_signed_at !== null;
  const data: SignoutPdfData = {
    companyName: company?.name ?? 'Company',
    statusLabel: t(STATUS_KEY[record.status]),
    rows: [
      {
        section: t('signout.s1'),
        items: [
          [t('signout.jobAddress'), record.job_address],
          [t('signout.jobName'), record.job_name],
          [t('signout.date'), record.signout_date],
        ],
      },
      {
        section: t('signout.s2'),
        items: [
          [t('signout.materialType'), record.material_type],
          [t('signout.color'), record.color_pattern],
          [t('signout.manufacturer'), record.manufacturer],
          [t('signout.model'), record.model_sku],
          [t('signout.itemNumber'), record.item_number],
          [t('signout.quantity'), record.quantity],
          [t('signout.dimensions'), record.dimensions],
          [t('signout.conditionAtRelease'), t(RELEASE_CONDITION_KEY[record.condition_at_release])],
          [t('signout.conditionNotes'), record.condition_notes],
        ],
      },
      {
        section: t('signout.s3'),
        items: [
          [t('signout.work'), record.work_to_be_performed],
          [t('signout.expectedReturn'), record.expected_return_date],
          [t('signout.returnLocation'), record.return_location],
        ],
      },
      {
        section: t('signout.s4'),
        items: [
          [t('signout.receiverCompany'), record.receiver_company],
          [t('signout.receiverContact'), record.receiver_contact_name],
          [t('signout.receiverPhone'), record.receiver_phone],
          [t('signout.receiverDriver'), record.receiver_driver_name],
          [t('signout.receiverVehicle'), record.receiver_vehicle],
        ],
      },
    ],
    signatures: [
      {
        label: t('signout.releasedBy'),
        name: record.released_signer_name,
        title: record.released_title,
        signedAt: when(record.released_signed_at),
        dataUri: record.released_signature_data,
      },
      {
        label: t('signout.receivedBy'),
        name: record.receiver_signer_name,
        title: record.receiver_title,
        signedAt: when(record.receiver_signed_at),
        dataUri: record.receiver_signature_data,
      },
    ],
    acknowledgement: record.receiver_consent_text,
    returnRows: closed
      ? [
          [t('signout.returnedDate'), record.returned_date],
          [t('signout.returnedTime'), record.returned_time?.slice(0, 5) ?? null],
          [
            t('signout.conditionAtReturn'),
            record.condition_at_return ? t(RETURN_CONDITION_KEY[record.condition_at_return]) : null,
          ],
          [t('signout.returnNotes'), record.return_notes],
        ]
      : null,
    returnSignature: closed
      ? {
          label: t('signout.receivedBack'),
          name: record.return_signer_name,
          title: record.returned_to?.display_name ?? null,
          signedAt: when(record.return_signed_at),
          dataUri: record.return_signature_data,
        }
      : null,
    photoSets: [
      await photoSet(t('signout.photosRelease'), photos.filter((p) => p.stage === 'release')),
      await photoSet(t('signout.photosReturn'), photos.filter((p) => p.stage === 'return')),
    ],
    generatedAt: new Date().toISOString(),
    timeZone: timezone,
  };

  const buffer = await renderToBuffer(SignoutDocument({ data }));

  const fileName = `material-signout-${record.signout_date}-${slug(record.material_type)}-${signoutId.slice(0, 8)}.pdf`;
  const storagePath = `${record.company_id}/${record.project_id}/${randomUUID()}-${fileName}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
  if (uploadError) return { fileId: null, error: `Upload failed: ${uploadError.message}` };

  const { data: fileRow, error: insertError } = await admin
    .from('files')
    .insert({
      company_id: record.company_id,
      project_id: record.project_id,
      category: 'material_signout',
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

  const previousFileId = record.pdf_file_id;
  const { error: pointError } = await admin
    .from('material_signouts')
    .update({ pdf_file_id: fileRow.id })
    .eq('id', signoutId);
  if (pointError) return { fileId: fileRow.id, error: `Repoint failed: ${pointError.message}` };

  // One always-current PDF. The stale row is only ever this record's own
  // previous PDF (pdf_file_id), never a photo.
  if (previousFileId && previousFileId !== fileRow.id) {
    const { data: old } = await admin
      .from('files')
      .select('file_path, category')
      .eq('id', previousFileId)
      // #175 [S120]: and of this record's OWN company — the category check alone
      // would let a pointer reach another company's material_signout PDF.
      .eq('company_id', record.company_id)
      .maybeSingle();
    if (old && old.category === 'material_signout') {
      await admin.storage.from(BUCKET).remove([old.file_path]);
      await admin.from('files').delete().eq('id', previousFileId);
    }
  }

  return { fileId: fileRow.id, error: null };
}
