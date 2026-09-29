'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/language-provider';
import { SignatureCapture } from '@/components/signature/signature-capture';
import { UploadBatchList } from '@/components/uploads/upload-batch-list';
import { makeAttachWorker } from '@/lib/uploads/upload-batch';
import { useUploadBatches } from '@/lib/uploads/use-upload-batches';
import {
  RECEIPT_ACKNOWLEDGEMENT,
  RELEASE_CONDITION_KEY,
  RETURN_CONDITIONS,
  RETURN_CONDITION_KEY,
  STATUS_KEY,
  blankToNull,
  isOverdue,
  type PhotoStage,
  type ReturnCondition,
} from '@/lib/material-signouts/signout';
import {
  closeMaterialSignout,
  generateSignoutPdf,
  linkSignoutPhoto,
  recordSignoutReceipt,
  uploadSignoutPhotoFile,
  type SignoutDetail,
  type SignoutPhoto,
} from '@/lib/services/material-signouts-client';
import { statusTone } from './signout-list';
import { inputCls, labelCls, sectionCls, sectionTitleCls, signatureLabels } from './signout-new-form';

// S118 item 11 — one sign-out record, desktop and /m (PARITY: one component;
// the route decides only the chrome). What renders follows the STATE:
//
//   pending_receipt  release photos (at least one), then the receiving party
//                    signs on this device. ⚠️ No skip control — RULED: staff
//                    carry paper copies for a dead phone. The database refuses
//                    the signature without a release photo in any case.
//   open             return photos (any staff); the office (Owner/Admin/PM/PE
//                    — `canClose`) records the return and signs.
//   closed           read-only.
//
// ⚠️ TWO PHOTO SETS, NEVER MERGED: "at release" and "at return" render side by
// side, each photo with who took it and when.

function fmtWhen(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#f4f6f9] py-[6px] text-[14px]">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-right font-semibold text-[#14213d]">{value && value.trim() ? value : '—'}</span>
    </div>
  );
}

function PhotoSet({
  title,
  photos,
  timeZone,
  testId,
}: {
  title: string;
  photos: SignoutPhoto[];
  timeZone: string;
  testId: string;
}) {
  const t = useT();
  return (
    <div data-testid={testId} className="min-w-0 flex-1">
      <p className="mb-2 text-[13px] font-bold text-[#14213d]">
        {title} · {photos.length}
      </p>
      {photos.length === 0 ? (
        <p className="text-[13px] text-[#9aa1ac]">{t('signout.photosNone')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <li key={p.id} data-testid={`${testId}-photo`}>
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                  <img src={p.url} alt={p.file?.file_name ?? ''} className="aspect-[4/3] w-full rounded-[8px] object-cover" />
                </a>
              ) : (
                <div className="aspect-[4/3] w-full rounded-[8px] bg-[#f4f6f9]" />
              )}
              <p className="mt-1 text-[11px] text-[#6b7280]">
                {t('signout.takenBy', {
                  name: p.taken_by?.display_name ?? '—',
                  when: fmtWhen(p.created_at, timeZone),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SignatureBlock({
  label,
  name,
  title,
  at,
  data,
  timeZone,
  testId,
}: {
  label: string;
  name: string | null;
  title: string | null;
  at: string | null;
  data: string | null;
  timeZone: string;
  testId: string;
}) {
  const t = useT();
  return (
    <div data-testid={testId} className="min-w-0 flex-1 rounded-[10px] border border-[#e6e9ef] p-3">
      <p className="text-[12px] font-semibold uppercase text-[#6b7280]">{label}</p>
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element -- a stored signature data URL
        <img src={data} alt={name ?? ''} className="mt-2 h-[56px] max-w-full object-contain" />
      ) : null}
      <p className="mt-1 text-[14px] font-semibold text-[#14213d]">
        {name ?? '—'}
        {title ? ` · ${title}` : ''}
      </p>
      {at ? <p className="text-[12px] text-[#6b7280]">{t('signout.signedAt', { when: fmtWhen(at, timeZone) })}</p> : null}
    </div>
  );
}

export function SignoutDetailView({
  record,
  photos,
  today,
  timeZone,
  canClose,
  pdfUrl,
  defaultSignerName,
}: {
  record: SignoutDetail;
  photos: SignoutPhoto[];
  today: string;
  timeZone: string;
  canClose: boolean;
  pdfUrl: string | null;
  defaultSignerName: string;
}) {
  const t = useT();
  const router = useRouter();
  const batches = useUploadBatches();
  const [receiving, setReceiving] = useState(false);
  const [receiverTitle, setReceiverTitle] = useState('');
  const [closing, setClosing] = useState(false);
  const [retCondition, setRetCondition] = useState<ReturnCondition | ''>('');
  const [retDate, setRetDate] = useState(today);
  const [retTime, setRetTime] = useState('');
  const [retNotes, setRetNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const release = photos.filter((p) => p.stage === 'release');
  const ret = photos.filter((p) => p.stage === 'return');
  const overdue = isOverdue(record, today);
  const closed = record.status !== 'pending_receipt' && record.status !== 'open';

  async function addPhotos(stage: PhotoStage, list: File[]) {
    if (list.length === 0) return;
    await batches.start(
      stage,
      list,
      makeAttachWorker(
        (file) => uploadSignoutPhotoFile(file, record.project_id),
        (fileId) => linkSignoutPhoto(fileId, record.id, stage)
      )
    );
    router.refresh();
  }

  function PhotoInput({ stage, label }: { stage: PhotoStage; label: string }) {
    return (
      <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[9px] border border-[#e0e4ea] bg-white px-[14px] text-[14px] font-semibold text-[#14213d]">
        {label}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          data-testid={`so-${stage}-input`}
          disabled={batches.busy(stage)}
          onChange={(e) => {
            // Read the list NOW, before the reset: a lazy read of e.target.files
            // after it sees nothing (the S116 selection-sheet bug).
            const list = Array.from(e.target.files ?? []);
            e.target.value = '';
            void addPhotos(stage, list);
          }}
        />
      </label>
    );
  }

  return (
    <div className="flex max-w-[860px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="so-status"
          data-status={record.status}
          className={`rounded-full px-[10px] py-[3px] text-[12px] font-semibold ${statusTone(record.status, false)}`}
        >
          {t(STATUS_KEY[record.status])}
        </span>
        {overdue ? (
          <span
            data-testid="so-overdue"
            className={`rounded-full px-[10px] py-[3px] text-[12px] font-semibold ${statusTone(record.status, true)}`}
          >
            {t('signout.overdue')}
          </span>
        ) : null}
        <span className="font-mono text-[12px] text-[#6b7280]">
          {t('signout.dueBack', { date: record.expected_return_date })}
        </span>
        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="so-pdf"
            className="ml-auto rounded-[9px] border border-[#e0e4ea] bg-white px-[12px] py-[6px] text-[13px] font-semibold text-[#14213d]"
          >
            {t('signout.pdf')}
          </a>
        ) : (
          <span className="ml-auto text-[12px] text-[#9aa1ac]">{t('signout.pdfPending')}</span>
        )}
      </div>

      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s1')}</p>
        <Row label={t('signout.jobAddress')} value={record.job_address} />
        <Row label={t('signout.jobName')} value={record.job_name} />
        <Row label={t('signout.date')} value={record.signout_date} />
      </div>

      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s2')}</p>
        <Row label={t('signout.materialType')} value={record.material_type} />
        <Row label={t('signout.color')} value={record.color_pattern} />
        <Row label={t('signout.manufacturer')} value={record.manufacturer} />
        <Row label={t('signout.model')} value={record.model_sku} />
        <Row label={t('signout.itemNumber')} value={record.item_number} />
        <Row label={t('signout.quantity')} value={record.quantity} />
        <Row label={t('signout.dimensions')} value={record.dimensions} />
        <Row label={t('signout.conditionAtRelease')} value={t(RELEASE_CONDITION_KEY[record.condition_at_release])} />
        <Row label={t('signout.conditionNotes')} value={record.condition_notes} />
      </div>

      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s3')}</p>
        <Row label={t('signout.work')} value={record.work_to_be_performed} />
        <Row label={t('signout.expectedReturn')} value={record.expected_return_date} />
        <Row label={t('signout.returnLocation')} value={record.return_location} />
      </div>

      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s4')}</p>
        <Row label={t('signout.receiverCompany')} value={record.receiver_company} />
        <Row label={t('signout.receiverContact')} value={record.receiver_contact_name} />
        <Row label={t('signout.receiverPhone')} value={record.receiver_phone} />
        <Row label={t('signout.receiverDriver')} value={record.receiver_driver_name} />
        <Row label={t('signout.receiverVehicle')} value={record.receiver_vehicle} />
      </div>

      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s5')}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <SignatureBlock
            label={t('signout.releasedBy')}
            name={record.released_signer_name}
            title={record.released_title}
            at={record.released_signed_at}
            data={record.released_signature_data}
            timeZone={timeZone}
            testId="so-sig-released"
          />
          <SignatureBlock
            label={t('signout.receivedBy')}
            name={record.receiver_signer_name}
            title={record.receiver_title}
            at={record.receiver_signed_at}
            data={record.receiver_signature_data}
            timeZone={timeZone}
            testId="so-sig-received"
          />
        </div>
        {record.receiver_consent_text ? (
          <p data-testid="so-ack" className="mt-2 text-[12px] italic text-[#6b7280]">
            {record.receiver_consent_text}
          </p>
        ) : null}
      </div>

      <div className={sectionCls}>
        <div className="flex flex-col gap-4 sm:flex-row">
          <PhotoSet title={t('signout.photosRelease')} photos={release} timeZone={timeZone} testId="so-photos-release" />
          <PhotoSet title={t('signout.photosReturn')} photos={ret} timeZone={timeZone} testId="so-photos-return" />
        </div>
        {record.status === 'pending_receipt' ? (
          <div className="mt-3">
            <PhotoInput stage="release" label={t('signout.addReleasePhotos')} />
          </div>
        ) : null}
        {record.status === 'open' ? (
          <div className="mt-3">
            <PhotoInput stage="return" label={t('signout.addReturnPhotos')} />
          </div>
        ) : null}
        {(['release', 'return'] as const).map((k) =>
          batches.items(k).length > 0 ? (
            <div key={k} className="mt-3">
              <UploadBatchList
                items={batches.items(k)}
                busy={batches.busy(k)}
                onRetry={() => void batches.retry(k).then(() => router.refresh())}
                testId={`so-${k}-batch`}
              />
            </div>
          ) : null
        )}
      </div>

      {error ? (
        <p data-testid="so-error" className="text-[13px] text-[#c0362c]">
          {error}
        </p>
      ) : null}

      {record.status === 'pending_receipt' ? (
        <div className={sectionCls}>
          <p className={sectionTitleCls}>{t('signout.receiverSigns')}</p>
          {release.length === 0 ? (
            <p data-testid="so-photo-first" className="text-[14px] text-[#8a5a00]">
              {t('signout.photoFirst')}
            </p>
          ) : receiving ? (
            <>
              <label className="mb-2 block">
                <span className={labelCls}>{t('signout.receiverTitle')}</span>
                <input
                  value={receiverTitle}
                  onChange={(e) => setReceiverTitle(e.target.value)}
                  data-testid="so-receiver-title"
                  className={inputCls}
                />
              </label>
              <SignatureCapture
                title={t('signout.receiverSignTitle')}
                defaultName={record.receiver_driver_name ?? record.receiver_contact_name ?? ''}
                consentText={RECEIPT_ACKNOWLEDGEMENT}
                submitLabel={t('signout.receiverSubmit')}
                busyLabel={t('signout.signing')}
                labels={signatureLabels(t)}
                testId="so-receipt-sig"
                onCancel={() => setReceiving(false)}
                onSubmit={async (sig) => {
                  const res = await recordSignoutReceipt(record.id, {
                    signer_name: sig.signer_name,
                    title: blankToNull(receiverTitle),
                    signature_type: sig.signature_type,
                    signature_data: sig.signature_data,
                  });
                  if (!res.success) return res.error;
                  const pdf = await generateSignoutPdf(record.id);
                  if (!pdf.success) setError(pdf.error ?? null);
                  setReceiving(false);
                  router.refresh();
                  return null;
                }}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setReceiving(true)}
              disabled={batches.anyBusy}
              data-testid="so-receiver-open"
              className="min-h-[44px] rounded-[9px] bg-[#2f49d1] px-[16px] text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {t('signout.receiverSigns')}
            </button>
          )}
        </div>
      ) : null}

      {record.status === 'open' && canClose ? (
        <div className={sectionCls}>
          <p className={sectionTitleCls}>{t('signout.s6')}</p>
          {closing ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>{t('signout.returnedDate')}</span>
                  <input type="date" value={retDate} onChange={(e) => setRetDate(e.target.value)} data-testid="so-ret-date" className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>{t('signout.returnedTime')}</span>
                  <input type="time" value={retTime} onChange={(e) => setRetTime(e.target.value)} data-testid="so-ret-time" className={inputCls} />
                </label>
              </div>
              <fieldset className="mt-3">
                <legend className={labelCls}>{t('signout.conditionAtReturn')}</legend>
                <div className="flex flex-wrap gap-2">
                  {RETURN_CONDITIONS.map((c) => (
                    <label
                      key={c}
                      className={`flex min-h-[40px] items-center gap-2 rounded-[9px] border px-3 text-[14px] ${
                        retCondition === c ? 'border-[#2f49d1] bg-[#e8edfb] text-[#2f49d1]' : 'border-[#e0e4ea] text-[#374151]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="condition_at_return"
                        checked={retCondition === c}
                        onChange={() => setRetCondition(c)}
                        data-testid={`so-ret-${c}`}
                      />
                      {t(RETURN_CONDITION_KEY[c])}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="mt-3 block">
                <span className={labelCls}>{t('signout.returnNotes')}</span>
                <textarea value={retNotes} onChange={(e) => setRetNotes(e.target.value)} rows={2} data-testid="so-ret-notes" className={inputCls} />
              </label>
              <SignatureCapture
                title={t('signout.receivedBack')}
                defaultName={defaultSignerName}
                consentText={t('signout.returnConsent')}
                submitLabel={t('signout.returnSubmit')}
                busyLabel={t('signout.closing')}
                labels={signatureLabels(t)}
                testId="so-return-sig"
                onCancel={() => setClosing(false)}
                onSubmit={async (sig) => {
                  if (!retCondition) return t('signout.pickCondition');
                  const res = await closeMaterialSignout(record.id, {
                    condition_at_return: retCondition,
                    returned_date: retDate,
                    returned_time: retTime || new Date().toTimeString().slice(0, 5),
                    return_notes: blankToNull(retNotes),
                    signer_name: sig.signer_name,
                    signature_type: sig.signature_type,
                    signature_data: sig.signature_data,
                  });
                  if (!res.success) return res.error;
                  const pdf = await generateSignoutPdf(record.id);
                  if (!pdf.success) setError(pdf.error ?? null);
                  setClosing(false);
                  router.refresh();
                  return null;
                }}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setClosing(true)}
              disabled={batches.anyBusy}
              data-testid="so-close-open"
              className="min-h-[44px] rounded-[9px] bg-[#14213d] px-[16px] text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {t('signout.closeOut')}
            </button>
          )}
        </div>
      ) : null}

      {closed ? (
        <div className={sectionCls} data-testid="so-return">
          <p className={sectionTitleCls}>{t('signout.s6')}</p>
          <Row label={t('signout.returnedDate')} value={record.returned_date} />
          <Row label={t('signout.returnedTime')} value={record.returned_time?.slice(0, 5) ?? null} />
          <Row
            label={t('signout.conditionAtReturn')}
            value={record.condition_at_return ? t(RETURN_CONDITION_KEY[record.condition_at_return]) : null}
          />
          <Row label={t('signout.returnNotes')} value={record.return_notes} />
          <div className="mt-3">
            <SignatureBlock
              label={t('signout.receivedBack')}
              name={record.return_signer_name}
              title={record.returned_to?.display_name ?? null}
              at={record.return_signed_at}
              data={record.return_signature_data}
              timeZone={timeZone}
              testId="so-sig-return"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
