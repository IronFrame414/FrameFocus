'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createChangeOrder, type ChangeOrderType } from '@/lib/services/change-orders-client';
import { useT } from '@/components/i18n/language-provider';
import type { MsgKey } from '@/lib/i18n/messages';
import { SetMobileHeader } from '../../../../mobile-header';
import {
  ErrorNotice,
  OfflineNotice,
  OptionStack,
  PrimaryButton,
  TextAreaField,
  TextField,
  useOnline,
} from '../../../../write-ui';

// M6M §4.11.12 — M-32, create half.
//
// ===========================================================================
// ALL THREE TYPES SHIP — D-62, AND THE ORDERING WAS THE RULING
// ===========================================================================
// §4.11.12 originally proposed offering `fixed_price` ONLY, because a PM
// authoring a cost_plus or T&M change order hit an RLS floor on
// `instrument_rates` and could not recalculate it (#140). D-62 REJECTED that
// interim: the fix ships first, then all three types. c87e370 landed the fix
// (§4.11.12a — a privileged server path that reads rates under the service role
// and returns no rate value to the caller), so the restriction never exists to
// be forgotten about.
//
// A build that reinstated a fixed_price-only picker here would be reversing
// D-62, not being cautious.
//
// ===========================================================================
// WHAT THIS FORM DOES NOT HAVE, AND WHY THAT IS THE POINT
// ===========================================================================
// **NO AMOUNT FIELD.** `createChangeOrder` accepts no value and there is
// nowhere to put one: `change_orders.net_delta` is computed from line rows by
// `recalculateChangeOrderTotals()`. A build that added a "Amount" input here
// would have to write it somewhere, and the only somewhere is a column the
// recalculation overwrites.
//
// CUT: attachments (§4.11.6's cut stands — /m has no document-upload path).
// CUT: company_id, author_member_id, created_by — all column defaults, and
//      §4.11.12 is explicit that the page must not set them.

// S110 H — message keys, resolved with t() at render time.
const CO_TYPES: readonly { value: ChangeOrderType; labelKey: MsgKey; subKey: MsgKey }[] = [
  {
    value: 'fixed_price',
    labelKey: 'project.coCreate.typeFixed',
    subKey: 'project.coCreate.typeFixedSub',
  },
  {
    value: 'cost_plus',
    labelKey: 'project.coCreate.typeCostPlus',
    subKey: 'project.coCreate.typeCostPlusSub',
  },
  {
    value: 'time_and_materials',
    labelKey: 'project.coCreate.typeTm',
    subKey: 'project.coCreate.typeTmSub',
  },
];

export function CoCreateForm({
  projectId,
  projectName,
  defaultType,
}: {
  projectId: string;
  projectName: string;
  defaultType: ChangeOrderType;
}) {
  const router = useRouter();
  const online = useOnline();
  const t = useT();
  const coTypes = CO_TYPES.map((c) => ({ value: c.value, label: t(c.labelKey), sub: t(c.subKey) }));

  const [title, setTitle] = useState('');
  const [coType, setCoType] = useState<ChangeOrderType>(defaultType);
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [scheduleDays, setScheduleDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = title.trim().length > 0;

  async function submit() {
    if (!ready || !online) return;
    setBusy(true);
    setError(null);

    const days = scheduleDays.trim();
    const result = await createChangeOrder({
      project_id: projectId,
      title: title.trim(),
      description: description.trim() || null,
      co_type: coType,
      reason_category: reason.trim() || null,
      // An empty box is "no schedule impact stated", which is NULL — not 0.
      // 0 is a claim that the change costs no time.
      schedule_impact_days: days === '' ? null : Number(days),
    });

    if (!result.success || !result.id) {
      setBusy(false);
      setError(result.error ?? t('project.coCreate.failed'));
      return;
    }

    // Straight into the editor with the new id. `router.refresh()` makes the
    // server component re-read the CO it is about to render — without it the
    // editor mounts against a stale cache entry and shows no line items.
    router.replace(`/m/p/${projectId}/changes/new?co=${result.id}`);
    router.refresh();
  }

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title={t('project.changes.new')} sub={projectName} />

      <h1 className="text-[17px] font-bold leading-tight text-m6m-navy">{t('project.changes.new')}</h1>
      <p className="mt-[2px] font-mono text-[11px] text-m6m-muted">
        {t('project.coCreate.numberAssigned')}
      </p>

      {!online ? (
        <div className="mt-[14px]">
          <OfflineNotice what={t('project.coCreate.offlineWhat')} testId="m-co-offline" />
        </div>
      ) : null}

      <TextField
        label={t('project.co.titleField')}
        value={title}
        onChange={setTitle}
        testId="m-co-title"
        required
        placeholder={t('project.coCreate.titlePlaceholder')}
      />

      <div className="mt-[14px]">
        <p className="mb-[6px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          {t('project.coCreate.type')}
        </p>
        <OptionStack
          options={coTypes}
          value={coType}
          onChange={setCoType}
          testIdPrefix="m-co-type"
        />
      </div>

      <TextAreaField
        label={t('project.co.description')}
        value={description}
        onChange={setDescription}
        testId="m-co-description"
      />

      <TextField
        label={t('project.co.reason')}
        value={reason}
        onChange={setReason}
        testId="m-co-reason"
        placeholder={t('project.coCreate.reasonPlaceholder')}
      />

      <TextField
        label={t('project.co.scheduleImpactDays')}
        value={scheduleDays}
        onChange={(v) => setScheduleDays(v.replace(/[^0-9-]/g, ''))}
        testId="m-co-schedule-days"
        inputMode="numeric"
      />

      {error ? <ErrorNotice message={error} testId="m-co-create-error" /> : null}

      {/* The consequence line — this screen creates a DRAFT and nothing else.
          Sending is a separate, explicit action on M-31, so "save a draft" and
          "commit to a number in front of a client" are never one tap
          (§4.11.12). */}
      <p className="mt-[14px] text-center text-[12px] text-m6m-muted">
        {t('project.coCreate.savesDraft')}
      </p>
      <PrimaryButton
        label={t('project.coCreate.createDraft')}
        busyLabel={t('project.coCreate.creating')}
        onClick={submit}
        disabled={!ready || !online}
        busy={busy}
        testId="m-co-create"
      />
    </div>
  );
}
