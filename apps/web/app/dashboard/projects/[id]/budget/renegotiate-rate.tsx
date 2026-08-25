'use client';

// Money representation §7.1 S-4 (amended 2026-07-31), stage 3 — the
// "Renegotiate rate" action on the project rate section. Owner/Admin only
// by mount position (the section renders inside the page's isOwnerAdmin
// gate); the instrument_rates INSERT policy backs that at the DB. The DB
// backdating guard is the authority on dates — the client mirrors its one
// check (floor = latest live rate + 1 day, since same-date correction is
// supersede's job) so a typed date fails fast with the same wording. There
// is NO upper bound: future-dating is permitted (P5 as amended 2026-07-31,
// migration 20260731010000) — a future rate sits pending, not in force,
// until its date arrives. Supersede is stage 4 — not here.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addInstrumentRate,
  todayForCompany,
  type InstrumentRateType,
} from '@/lib/services/instrument-rates-client';
import { recalculateChangeOrderTotals } from '@/lib/services/change-orders-client';
import { color, font } from '@/lib/theme';

function friendlyRateError(message: string): string {
  if (message.includes('duplicate key')) {
    return 'A rate of this type is already recorded for that date. Correcting a mistyped rate is a supersede (Owner) — not a same-date re-entry.';
  }
  return message;
}

/** YYYY-MM-DD + 1 day, in UTC to match the date-only column. */
function nextDay(date: string): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);
}

interface RenegotiateRateProps {
  /** Exactly one of these — the instrument the new rate row lands on. */
  estimateId?: string;
  changeOrderId?: string;
  rateType: InstrumentRateType;
  label: string;
  percent: boolean;
  /** Latest live (non-superseded) effective_from for this type, or null
   *  when this is the instrument's first rate of the type (free backdate —
   *  P5 signing-date rule). */
  floor: string | null;
  /** Prefill for the rate input, applied when the panel OPENS (so a value
   *  fetched after mount still lands). S97 ruling: a CO's first rate of a
   *  type defaults to the source estimate's rate in force — editable, and
   *  the row written is still the CO's own. Null/undefined = start blank. */
  defaultRate?: number | null;
  /** Set when the instrument is a DRAFT change order — its totals reprice
   *  at the new rate. NEVER set for the estimate instrument.
   *
   *  ⚠️ THE REASON HERE WAS FALSE UNTIL S175, and it was load-bearing — this
   *  comment is why the prop is never set. _Superseded: "on a converted/frozen
   *  estimate recalculateEstimateTotals is a silent no-op that fakes success"._
   *  That was true only for a PM: `estimates_update_manager` carries
   *  `status = 'draft'` only on its project-manager arm, and S174 proved an
   *  Owner rewriting `grand_total` on a sent estimate live. Since
   *  20261031000000 the estimate's totals are frozen at `sent`, so the call now
   *  RAISES rather than half-succeeding. The rule is unchanged; its reason is.
   *  (spec §7.1 S-4, corrected in the same pass) */
  recomputeDraftCoId?: string;
  /** Client-state refresh hook for parents that hold rates in useState
   *  (router.refresh() only re-renders server components — #114 posture). */
  onSaved?: () => void;
}

export function RenegotiateRate({
  estimateId,
  changeOrderId,
  rateType,
  label,
  percent,
  floor,
  defaultRate,
  recomputeDraftCoId,
  onSaved,
}: RenegotiateRateProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState('');
  // Default effective date only — any date is selectable, future included
  // (the guard no longer references CURRENT_DATE, so old debt #111 is moot).
  //
  // [S97] This is a COMPANY-timezone calendar date, resolved before the panel
  // opens. It used to be new Date().toISOString().slice(0, 10) — the UTC day —
  // so an evening entry pre-filled TOMORROW and, since future-dating is
  // permitted (P5 as amended 2026-07-31), saved quietly as a dormant rate that
  // priced nothing today. Resolved at open rather than on mount so the input
  // never renders a wrong date first; todayForCompany memoizes its one
  // settings read, so reopening is instant.
  const [today, setToday] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const min = floor ? nextDay(floor) : undefined;

  function reset() {
    setOpen(false);
    setRate('');
    setEffectiveFrom(today);
    setError(null);
  }

  async function save() {
    const parsed = Number(rate.trim());
    if (rate.trim() === '' || Number.isNaN(parsed)) {
      setError('Enter a rate');
      return;
    }
    if (parsed < 0) {
      setError('The rate must be zero or more.');
      return;
    }
    // Defensive: the panel resolves the company-tz date before it opens, so
    // this cannot normally be empty. Refuse rather than let addInstrumentRate
    // fall back to its own default and hide a cleared date [S97].
    if (!effectiveFrom) {
      setError('Pick an effective date.');
      return;
    }
    // Mirror the input's floor so a typed (unpicked) date fails fast with
    // the same wording; the DB guard remains the authority. No future
    // check — future-dating is permitted (P5 as amended 2026-07-31).
    if (floor && effectiveFrom <= floor) {
      setError(
        `A renegotiated rate must be dated after the latest existing rate (${floor}). Correcting that rate is a supersede (Owner).`
      );
      return;
    }

    setSaving(true);
    setError(null);
    const ref = estimateId
      ? { estimate_id: estimateId }
      : { change_order_id: changeOrderId as string };
    const result = await addInstrumentRate(ref, rateType, parsed, effectiveFrom);
    if (!result.success) {
      setSaving(false);
      setError(friendlyRateError(result.error || 'Save failed'));
      return;
    }
    if (recomputeDraftCoId) {
      const r = await recalculateChangeOrderTotals(recomputeDraftCoId);
      if (!r.success) {
        setSaving(false);
        setError(`Rate saved, but the change order did not reprice: ${r.error ?? 'recompute failed'}`);
        onSaved?.(); // the rate DID land — parents must not show stale rates
        router.refresh();
        return;
      }
    }
    setSaving(false);
    reset();
    // Re-render the server section so the new rate appears immediately
    // (#114: never leave the panel stale until a manual reload).
    onSaved?.();
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={async () => {
          // Read the prefill at open time — it may have been fetched after
          // this component mounted.
          setRate(defaultRate != null ? String(defaultRate) : '');
          // [S97] Company-tz today, resolved BEFORE the panel opens so the
          // date input never shows a UTC date even for one frame.
          const t = await todayForCompany();
          setToday(t);
          setEffectiveFrom(t);
          setOpen(true);
        }}
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: color.primary,
          backgroundColor: 'transparent',
          border: `1px solid ${color.cardBorder}`,
          borderRadius: '0.25rem',
          padding: '2px 8px',
          cursor: 'pointer',
        }}
      >
        {floor ? 'Renegotiate' : 'Set rate'}
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <input
        inputMode="decimal"
        value={rate}
        onChange={(e) => setRate(e.target.value)}
        placeholder={percent ? `${label} %` : `${label} $`}
        disabled={saving}
        autoFocus
        style={{
          padding: '2px 6px',
          border: `1px solid ${error ? color.danger : color.primary}`,
          borderRadius: '0.25rem',
          fontSize: '12px',
          fontFamily: font.mono,
          width: '90px',
        }}
      />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: color.faint }}>
        effective
        <input
          type="date"
          value={effectiveFrom}
          min={min}
          disabled={saving}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          title={
            floor
              ? `Renegotiation: any date after ${floor} — a future date sits pending until it arrives`
              : 'First rate of this type: any date — backdate to the contract date, or future-date a not-yet-started deal'
          }
          style={{
            padding: '2px 4px',
            border: `1px solid ${color.cardBorder}`,
            borderRadius: '0.25rem',
            fontSize: '11px',
          }}
        />
      </label>
      <button
        onClick={save}
        disabled={saving}
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#fff',
          backgroundColor: color.primary,
          border: 'none',
          borderRadius: '0.25rem',
          padding: '3px 10px',
          cursor: saving ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        onClick={reset}
        disabled={saving}
        style={{
          fontSize: '11px',
          color: color.mutedAlt,
          backgroundColor: 'transparent',
          border: 'none',
          padding: '3px 4px',
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
      {error && (
        <span style={{ display: 'block', width: '100%', color: color.danger, fontSize: '11px' }}>
          {error}
        </span>
      )}
    </span>
  );
}
