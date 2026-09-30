'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/language-provider';
import { SignatureCapture, type SignatureCaptureLabels } from '@/components/signature/signature-capture';
import {
  RECEIPT_ACKNOWLEDGEMENT,
  RELEASE_CONDITIONS,
  RELEASE_CONDITION_KEY,
  blankToNull,
  type ReleaseCondition,
} from '@/lib/material-signouts/signout';
import {
  createMaterialSignout,
  generateSignoutPdf,
  linkSignoutPhoto,
  recordSignoutReceipt,
  uploadSignoutPhotoFile,
} from '@/lib/services/material-signouts-client';
import type { SignoutJobChoice } from '@/lib/services/material-signouts';
import type { T } from '@/lib/i18n/messages';

// S118 item 11 — a new sign-out, desktop and /m (PARITY: one form). Sections
// 1–4 of the paper form, then section 5.
//
// [S121 Part 3, RULED Josh 2026-09-30] SECTION 5 IS NOW THE WHOLE RELEASE, ON
// PAGE 1, IN THIS ORDER:
//   1. the employee signs — as THEMSELVES (name fixed; ASK-15; the DB trigger
//      is the rule, not this form)
//   2. ONE required photo of the material going out (ASK-13)
//   3. the external party signs DIRECTLY UNDER the employee (3-E)
// then ONE Save runs: create → upload + link the photo(s) → the receiver's
// signature (record_material_signout_receipt, which itself refuses without a
// release photo) → the PDF.
// SUPERSEDED [S118]: "Saving creates the record AWAITING the receiving party;
// the record page then takes the release photos … and the receiver's
// signature." The record page still carries that path, now only as the place a
// save that failed part-way is FINISHED — nothing saved is lost.

export const inputCls =
  'w-full rounded-[9px] border border-[#e0e4ea] bg-white px-[10px] py-[9px] text-[16px] text-[#14213d]';
export const labelCls = 'mb-1 block text-[12.5px] font-semibold text-[#374151]';
export const sectionCls = 'rounded-[13px] border border-[#e6e9ef] bg-white p-4';
export const sectionTitleCls = 'mb-3 text-[12px] font-bold uppercase tracking-wide text-[#6b7280]';

/** The signature capture's own words, in the surface's language. */
export function signatureLabels(t: T): SignatureCaptureLabels {
  return {
    fullName: t('signout.sig.fullName'),
    typeIt: t('signout.sig.typeIt'),
    drawIt: t('signout.sig.drawIt'),
    typePlaceholder: t('signout.sig.typePlaceholder'),
    drawFirst: t('signout.sig.drawFirst'),
    cancel: t('signout.cancel'),
  };
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  testId,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'date' | 'tel';
  testId: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className={inputCls}
      />
    </label>
  );
}

type Sig = { signature_type: 'draw' | 'type'; signature_data: string; signer_name: string };

/** The record's route, per surface. ⚠️ The ONE place the two surfaces differ
 *  here: /m and /dashboard file the same record under different paths. */
function recordHref(surface: 'm' | 'desktop', projectId: string, id: string): string {
  return surface === 'm'
    ? `/m/p/${projectId}/signouts/${id}`
    : `/dashboard/field-ops/${projectId}/signouts/${id}`;
}

export function SignoutNewForm({
  projectId,
  jobs,
  defaultJobAddress,
  defaultSignerName,
  today,
  surface,
}: {
  /** The project the form was opened from — the picker's default. */
  projectId: string;
  /** [S121 3-A] Open jobs this viewer may file against (getSignoutJobChoices). */
  jobs: SignoutJobChoice[];
  defaultJobAddress: string;
  defaultSignerName: string;
  today: string;
  surface: 'm' | 'desktop';
}) {
  const t = useT();
  const router = useRouter();
  const opened = jobs.find((j) => j.id === projectId) ?? null;
  const [jobId, setJobId] = useState<string>(opened?.id ?? '');
  const [f, setF] = useState({
    job_address: opened ? defaultJobAddress || opened.address : '',
    signout_date: today,
    material_type: '',
    color_pattern: '',
    manufacturer: '',
    model_sku: '',
    item_number: '',
    quantity: '',
    dimensions: '',
    condition_notes: '',
    work_to_be_performed: '',
    expected_return_date: '',
    return_location: '',
    receiver_company: '',
    receiver_contact_name: '',
    receiver_phone: '',
    receiver_driver_name: '',
    receiver_title: '',
  });
  const [condition, setCondition] = useState<ReleaseCondition>('undamaged');
  const [releaseSig, setReleaseSig] = useState<Sig | null>(null);
  const [receiverSig, setReceiverSig] = useState<Sig | null>(null);
  const [signingRelease, setSigningRelease] = useState(false);
  const [signingReceiver, setSigningReceiver] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the record EXISTS: a later step failed, and the form must not
  // create a second one. The user finishes on the record page.
  const [savedId, setSavedId] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const job = jobs.find((j) => j.id === jobId) ?? null;

  const ready =
    job !== null &&
    f.material_type.trim() !== '' &&
    f.quantity.trim() !== '' &&
    f.expected_return_date !== '' &&
    f.signout_date !== '' &&
    f.receiver_company.trim() !== '';

  /** The first missing piece, in page order — the error the user reads. */
  function missing(): string | null {
    if (!ready) return t('signout.required');
    if (!releaseSig) return t('signout.errReleaseSig');
    if (photos.length === 0) return t('signout.errReleasePhoto');
    if (!receiverSig) return t('signout.errReceiverSig');
    return null;
  }

  async function save() {
    setError(null);
    const why = missing();
    if (why || !job || !releaseSig || !receiverSig) {
      setError(why);
      return;
    }
    setBusy(true);
    try {
      const res = await createMaterialSignout({
        project_id: job.id,
        job_address: blankToNull(f.job_address),
        job_name: job.name,
        signout_date: f.signout_date,
        material_type: f.material_type.trim(),
        color_pattern: blankToNull(f.color_pattern),
        manufacturer: blankToNull(f.manufacturer),
        model_sku: blankToNull(f.model_sku),
        item_number: blankToNull(f.item_number),
        quantity: f.quantity.trim(),
        dimensions: blankToNull(f.dimensions),
        condition_at_release: condition,
        condition_notes: blankToNull(f.condition_notes),
        work_to_be_performed: blankToNull(f.work_to_be_performed),
        expected_return_date: f.expected_return_date,
        return_location: blankToNull(f.return_location),
        receiver_company: f.receiver_company.trim(),
        receiver_contact_name: blankToNull(f.receiver_contact_name),
        receiver_phone: blankToNull(f.receiver_phone),
        receiver_driver_name: blankToNull(f.receiver_driver_name),
        released_signer_name: releaseSig.signer_name,
        released_signature_type: releaseSig.signature_type,
        released_signature_data: releaseSig.signature_data,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      const id = res.data.id;
      setSavedId(id);
      // The release photo(s). Each uploaded, then linked (stage 'release').
      for (const file of photos) {
        const up = await uploadSignoutPhotoFile(file, job.id);
        if (!up.success || !up.id) {
          setError(t('signout.savedIncomplete', { error: up.error ?? t('signout.errReleasePhoto') }));
          return;
        }
        const link = await linkSignoutPhoto(up.id, id, 'release');
        if (!link.success) {
          setError(t('signout.savedIncomplete', { error: link.error ?? t('signout.errReleasePhoto') }));
          return;
        }
      }
      // The receiving party's signature. The DATABASE refuses it without a
      // live release photo — the photo requirement is enforced here, not only
      // by the disabled button above.
      const receipt = await recordSignoutReceipt(id, {
        signer_name: receiverSig.signer_name,
        title: blankToNull(f.receiver_title),
        signature_type: receiverSig.signature_type,
        signature_data: receiverSig.signature_data,
      });
      if (!receipt.success) {
        setError(t('signout.savedIncomplete', { error: receipt.error }));
        return;
      }
      await generateSignoutPdf(id);
      router.push(recordHref(surface, job.id, id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s1')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* [S121 3-A] The job is a PICKER over open jobs, not free text.
              SUPERSEDED [S118]: a free-text "Project / job name" field
              (so-job-name) prefilled with the URL project's name. */}
          <label className="block">
            <span className={labelCls}>{t('signout.job')} *</span>
            {jobs.length === 0 ? (
              <p data-testid="so-no-jobs" className="text-[14px] text-[#8a5a00]">
                {t('signout.noJobs')}
              </p>
            ) : (
              <select
                value={jobId}
                onChange={(e) => {
                  const next = jobs.find((j) => j.id === e.target.value);
                  setJobId(e.target.value);
                  if (next) set('job_address')(next.address);
                }}
                data-testid="so-job"
                className={inputCls}
              >
                <option value="">{t('signout.jobPick')}</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          <Field label={t('signout.jobAddress')} value={f.job_address} onChange={set('job_address')} testId="so-job-address" />
          <Field label={t('signout.date')} value={f.signout_date} onChange={set('signout_date')} type="date" testId="so-date" required />
        </div>
      </div>

      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s2')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('signout.materialType')} value={f.material_type} onChange={set('material_type')} testId="so-material" required />
          <Field label={t('signout.color')} value={f.color_pattern} onChange={set('color_pattern')} testId="so-color" />
          <Field label={t('signout.manufacturer')} value={f.manufacturer} onChange={set('manufacturer')} testId="so-manufacturer" />
          <Field label={t('signout.model')} value={f.model_sku} onChange={set('model_sku')} testId="so-model" />
          <Field label={t('signout.itemNumber')} value={f.item_number} onChange={set('item_number')} testId="so-item" />
          <Field label={t('signout.quantity')} value={f.quantity} onChange={set('quantity')} testId="so-quantity" required />
          <Field label={t('signout.dimensions')} value={f.dimensions} onChange={set('dimensions')} testId="so-dimensions" />
        </div>
        <fieldset className="mt-3">
          <legend className={labelCls}>{t('signout.conditionAtRelease')} *</legend>
          <div className="flex flex-wrap gap-2">
            {RELEASE_CONDITIONS.map((c) => (
              <label
                key={c}
                className={`flex min-h-[40px] items-center gap-2 rounded-[9px] border px-3 text-[14px] ${
                  condition === c ? 'border-[#2f49d1] bg-[#e8edfb] text-[#2f49d1]' : 'border-[#e0e4ea] text-[#374151]'
                }`}
              >
                <input
                  type="radio"
                  name="condition_at_release"
                  checked={condition === c}
                  onChange={() => setCondition(c)}
                  data-testid={`so-cond-${c}`}
                />
                {t(RELEASE_CONDITION_KEY[c])}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-3 block">
          <span className={labelCls}>{t('signout.conditionNotes')}</span>
          <textarea
            value={f.condition_notes}
            onChange={(e) => set('condition_notes')(e.target.value)}
            rows={2}
            data-testid="so-condition-notes"
            className={inputCls}
          />
        </label>
      </div>

      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s3')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('signout.work')} value={f.work_to_be_performed} onChange={set('work_to_be_performed')} testId="so-work" />
          <Field
            label={t('signout.expectedReturn')}
            value={f.expected_return_date}
            onChange={set('expected_return_date')}
            type="date"
            testId="so-expected-return"
            required
          />
          <Field label={t('signout.returnLocation')} value={f.return_location} onChange={set('return_location')} testId="so-return-location" />
        </div>
      </div>

      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s4')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('signout.receiverCompany')} value={f.receiver_company} onChange={set('receiver_company')} testId="so-receiver-company" required />
          <Field label={t('signout.receiverContact')} value={f.receiver_contact_name} onChange={set('receiver_contact_name')} testId="so-receiver-contact" />
          <Field label={t('signout.receiverPhone')} value={f.receiver_phone} onChange={set('receiver_phone')} type="tel" testId="so-receiver-phone" />
          <Field label={t('signout.receiverDriver')} value={f.receiver_driver_name} onChange={set('receiver_driver_name')} testId="so-receiver-driver" />
          {/* [S121 3-B] "Vehicle / unit #" (so-receiver-vehicle) is REMOVED from
              the form. The column `receiver_vehicle` is KEPT — hidden, not
              dropped (production: 1 row, 0 values; S121 §1.4). */}
        </div>
      </div>

      <div className={sectionCls} data-testid="so-section-5">
        <p className={sectionTitleCls}>{t('signout.s5')}</p>
        {/* [S121 3-C] "Your title" (so-released-title) is REMOVED. */}

        {/* 1 — the employee signs, as themselves */}
        <p className={labelCls}>{t('signout.releasedBy')} *</p>
        {releaseSig && !signingRelease ? (
          <SignedLine
            testId="so-release-signed"
            text={t('signout.signedAs', { name: releaseSig.signer_name })}
            changeLabel={t('signout.change')}
            onChange={() => setSigningRelease(true)}
            disabled={busy || savedId !== null}
          />
        ) : signingRelease ? (
          <SignatureCapture
            title={t('signout.signRelease')}
            defaultName={defaultSignerName}
            lockName
            consentText={t('signout.releaseConsent')}
            submitLabel={t('signout.sign')}
            busyLabel={t('signout.saving')}
            labels={signatureLabels(t)}
            testId="so-release-sig"
            onCancel={() => setSigningRelease(false)}
            onSubmit={async (sig) => {
              setReleaseSig(sig);
              setSigningRelease(false);
              return null;
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setSigningRelease(true)}
            data-testid="so-sign-release"
            className="min-h-[44px] rounded-[9px] bg-[#2f49d1] px-[16px] text-[14px] font-semibold text-white"
          >
            {t('signout.signRelease')}
          </button>
        )}

        {/* 2 — ONE required photo of the material going out */}
        <p className={`${labelCls} mt-4`}>{t('signout.releasePhoto')} *</p>
        <div className="flex items-center gap-2">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[9px] border border-[#e0e4ea] bg-white px-[14px] text-[14px] font-semibold text-[#14213d]">
            {t('signout.takePhoto')}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              data-testid="so-release-photo-camera"
              disabled={busy || savedId !== null}
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                e.target.value = '';
                setPhotos((p) => [...p, ...list]);
              }}
            />
          </label>
          {/* SECONDARY library control — the /m check-in pattern (7-B). */}
          <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-[9px] border border-[#e0e4ea] bg-white px-[12px] text-[13px] text-[#374151]">
            {t('signout.fromLibrary')}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              data-testid="so-release-photo-library"
              disabled={busy || savedId !== null}
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                e.target.value = '';
                setPhotos((p) => [...p, ...list]);
              }}
            />
          </label>
        </div>
        {photos.length > 0 ? (
          <p data-testid="so-release-photo-count" className="mt-1 text-[13px] text-[#14213d]">
            {t('signout.photoCount', { n: photos.length })}
          </p>
        ) : null}

        {/* 3 — the external party signs DIRECTLY UNDER the employee (3-E).
            SUPERSEDED [S118]: the receiver signed on the RECORD page, after
            the record existed and after the release photos. */}
        <p className={`${labelCls} mt-4`}>{t('signout.receiverSignsBelow')} *</p>
        <label className="mb-2 block">
          <span className={labelCls}>{t('signout.receiverTitle')}</span>
          <input
            value={f.receiver_title}
            onChange={(e) => set('receiver_title')(e.target.value)}
            data-testid="so-receiver-title"
            className={inputCls}
            disabled={busy || savedId !== null}
          />
        </label>
        {receiverSig && !signingReceiver ? (
          <SignedLine
            testId="so-receipt-signed"
            text={t('signout.signedAs', { name: receiverSig.signer_name })}
            changeLabel={t('signout.change')}
            onChange={() => setSigningReceiver(true)}
            disabled={busy || savedId !== null}
          />
        ) : signingReceiver ? (
          <SignatureCapture
            title={t('signout.receiverSignTitle')}
            defaultName={f.receiver_driver_name || f.receiver_contact_name}
            consentText={RECEIPT_ACKNOWLEDGEMENT}
            submitLabel={t('signout.sign')}
            busyLabel={t('signout.signing')}
            labels={signatureLabels(t)}
            testId="so-receipt-sig"
            onCancel={() => setSigningReceiver(false)}
            onSubmit={async (sig) => {
              setReceiverSig(sig);
              setSigningReceiver(false);
              return null;
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setSigningReceiver(true)}
            data-testid="so-receiver-open"
            className="min-h-[44px] rounded-[9px] border border-[#2f49d1] bg-white px-[16px] text-[14px] font-semibold text-[#2f49d1]"
          >
            {t('signout.receiverSigns')}
          </button>
        )}

        {error ? (
          <p data-testid="so-error" className="mt-3 text-[13px] text-[#c0362c]">
            {error}
          </p>
        ) : null}
        {savedId && job ? (
          <a
            href={recordHref(surface, job.id, savedId)}
            data-testid="so-open-saved"
            className="mt-2 inline-block text-[14px] font-semibold text-[#2f49d1] underline"
          >
            {t('signout.openSaved')}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            data-testid="so-save"
            className="mt-4 min-h-[48px] w-full rounded-[9px] bg-[#14213d] px-[16px] text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('signout.saving') : t('signout.saveSignout')}
          </button>
        )}
      </div>
    </div>
  );
}

function SignedLine({
  text,
  changeLabel,
  onChange,
  disabled,
  testId,
}: {
  text: string;
  changeLabel: string;
  onChange: () => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-[44px] items-center justify-between rounded-[9px] border border-[#cfe6d6] bg-[#f0f7f1] px-[12px] text-[14px] font-semibold text-[#14213d]"
    >
      <span>✓ {text}</span>
      <button type="button" onClick={onChange} disabled={disabled} className="text-[13px] text-[#2f49d1] underline disabled:opacity-50">
        {changeLabel}
      </button>
    </div>
  );
}
