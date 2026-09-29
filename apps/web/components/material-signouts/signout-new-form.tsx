'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/language-provider';
import { SignatureCapture, type SignatureCaptureLabels } from '@/components/signature/signature-capture';
import {
  RELEASE_CONDITIONS,
  RELEASE_CONDITION_KEY,
  blankToNull,
  type ReleaseCondition,
} from '@/lib/material-signouts/signout';
import { createMaterialSignout } from '@/lib/services/material-signouts-client';
import type { T } from '@/lib/i18n/messages';

// S118 item 11 — a new sign-out, desktop and /m (PARITY: one form). Sections
// 1–4 of the paper form, then the WP release signature. Saving creates the
// record AWAITING the receiving party; the record page then takes the release
// photos (at least one — the database refuses the receiver's signature
// without) and the receiver's signature.

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

export function SignoutNewForm({
  projectId,
  defaultJobName,
  defaultJobAddress,
  defaultSignerName,
  today,
  hrefBase,
}: {
  projectId: string;
  defaultJobName: string;
  defaultJobAddress: string;
  defaultSignerName: string;
  today: string;
  /** The record route without the id — a string, since a server page renders this. */
  hrefBase: string;
}) {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({
    job_address: defaultJobAddress,
    job_name: defaultJobName,
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
    receiver_vehicle: '',
    released_title: '',
  });
  const [condition, setCondition] = useState<ReleaseCondition>('undamaged');
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const ready =
    f.job_name.trim() !== '' &&
    f.material_type.trim() !== '' &&
    f.quantity.trim() !== '' &&
    f.expected_return_date !== '' &&
    f.signout_date !== '' &&
    f.receiver_company.trim() !== '';

  function openSignature() {
    setError(null);
    if (!ready) {
      setError(t('signout.required'));
      return;
    }
    setSigning(true);
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s1')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('signout.jobAddress')} value={f.job_address} onChange={set('job_address')} testId="so-job-address" />
          <Field label={t('signout.jobName')} value={f.job_name} onChange={set('job_name')} testId="so-job-name" required />
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
          <Field label={t('signout.receiverVehicle')} value={f.receiver_vehicle} onChange={set('receiver_vehicle')} testId="so-receiver-vehicle" />
        </div>
      </div>

      <div className={sectionCls}>
        <p className={sectionTitleCls}>{t('signout.s5')}</p>
        <Field label={t('signout.yourTitle')} value={f.released_title} onChange={set('released_title')} testId="so-released-title" />
        {error ? (
          <p data-testid="so-error" className="mt-3 text-[13px] text-[#c0362c]">
            {error}
          </p>
        ) : null}
        {signing ? (
          <SignatureCapture
            title={t('signout.signRelease')}
            defaultName={defaultSignerName}
            consentText={t('signout.releaseConsent')}
            submitLabel={t('signout.save')}
            busyLabel={t('signout.saving')}
            labels={signatureLabels(t)}
            testId="so-release-sig"
            onCancel={() => setSigning(false)}
            onSubmit={async (sig) => {
              const res = await createMaterialSignout({
                project_id: projectId,
                job_address: blankToNull(f.job_address),
                job_name: f.job_name.trim(),
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
                receiver_vehicle: blankToNull(f.receiver_vehicle),
                released_signer_name: sig.signer_name,
                released_title: blankToNull(f.released_title),
                released_signature_type: sig.signature_type,
                released_signature_data: sig.signature_data,
              });
              if (!res.success) return res.error;
              router.push(`${hrefBase}/${res.data.id}`);
              router.refresh();
              return null;
            }}
          />
        ) : (
          <button
            type="button"
            onClick={openSignature}
            data-testid="so-sign-release"
            className="mt-3 min-h-[44px] rounded-[9px] bg-[#2f49d1] px-[16px] text-[14px] font-semibold text-white"
          >
            {t('signout.signRelease')}
          </button>
        )}
      </div>
    </div>
  );
}
