'use client';

// S122 Part 3 — THE CRITICAL PATH PART OF A TASK'S LINE SHEET.
//
// Shown only on a project whose schedule runs on Critical Path. In place of
// the two typed dates it asks for what the engine needs — a duration in
// working days, the start anchor (ruling 1 + 10), and, for work in progress,
// the working days LEFT (ruling 13, Q1-A) — and it states, BEFORE saving,
// WHICH kind of edit is being made and what it does to the projected finish
// [Josh, Q19: "this moves the finish by N days" is not enough on its own].
//
// ⚠️ A start anchor is a PIN. Same model and same words as a pinned invoice
// line (Part 0-C): a deliberate act, visibly marked, released in one action
// [Josh, Q19 addition]. A forgotten pin is how a schedule stops predicting.
//
// ⚠️ percent_complete is SHOWN beside days left and never used for dates
// (ruling 13). Days left is never pre-filled from it or from elapsed time.

import type { CpTask } from '@framefocus/shared/utils/critical-path';
import {
  consequenceSentence,
  editSentence,
  shortDate,
  type EditPreview,
} from '@framefocus/shared/utils/critical-path-writes';

export type AnchorChoice = 'none' | 'not_before' | 'fixed';

export interface CriticalPathFieldValues {
  duration: string; // text box contents; '' = not set
  anchor: AnchorChoice;
  anchorDate: string; // YYYY-MM-DD or ''
  daysLeft: string; // '' = not entered
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 500,
  marginBottom: '0.25rem',
};
const note: React.CSSProperties = { fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' };

/** Whole working days, 1–3650; '' → null; anything else → an error string. */
export function parseWorkingDays(text: string, min: number): number | null | string {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return 'Enter a whole number of working days.';
  const n = Number(t);
  if (n < min || n > 3650) return `Enter ${min}–3650 working days.`;
  return n;
}

export function pinLabel(constraint: CpTask['startConstraint'], date: string | null): string | null {
  if (!constraint || !date) return null;
  return constraint === 'fixed' ? `Pinned · starts on ${shortDate(date)}` : `Pinned · not before ${shortDate(date)}`;
}

export function CriticalPathFields({
  saved,
  values,
  onChange,
  computed,
  percentComplete,
  status,
  canEdit,
  preview,
  previewError,
  newlyCriticalTitles,
  onRelease,
  busy,
}: {
  /** The task as stored (null when creating). */
  saved: CpTask | null;
  values: CriticalPathFieldValues;
  onChange: (v: CriticalPathFieldValues) => void;
  /** The engine's dates for this task as stored, if it has any. */
  computed: { start: string | null; finish: string | null; float: number | null } | null;
  percentComplete: number | null;
  status: CpTask['status'];
  canEdit: boolean;
  preview: EditPreview | null;
  previewError: string | null;
  newlyCriticalTitles: string[];
  onRelease: (() => void) | null;
  busy: boolean;
}) {
  const savedPin = saved ? pinLabel(saved.startConstraint, saved.constraintDate) : null;
  const noDuration = saved && saved.durationDays === null;

  return (
    <div
      data-testid="cp-fields"
      style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '0.75rem' }}
    >
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        Critical Path
      </div>

      {savedPin && (
        <div data-testid="cp-pin" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span
            data-testid="cp-pinned"
            style={{ fontSize: '10px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', border: '1px solid #bfdbfe', borderRadius: '0.25rem', padding: '1px 6px' }}
          >
            {savedPin}
          </span>
          {canEdit && onRelease && (
            <button
              type="button"
              data-testid="cp-release"
              onClick={onRelease}
              disabled={busy}
              style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
            >
              Release — let the schedule move it freely
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label style={labelStyle} htmlFor="cp-duration">Duration (working days)</label>
          <input
            id="cp-duration"
            data-testid="cp-duration"
            inputMode="numeric"
            value={values.duration}
            onChange={(e) => onChange({ ...values, duration: e.target.value })}
            style={inputStyle}
            disabled={!canEdit}
            placeholder="Not set"
          />
          {noDuration && saved?.startDate && saved?.dueDate && (
            <p data-testid="cp-duration-not-set" style={note}>
              Duration not set: using the dates typed on this task ({shortDate(saved.startDate)} – {shortDate(saved.dueDate)}).
            </p>
          )}
          {noDuration && !(saved?.startDate && saved?.dueDate) && (
            <p data-testid="cp-needs-duration" style={note}>
              Needs a duration: until one is entered this task is left out of the schedule.
            </p>
          )}
        </div>
        <div>
          <label style={labelStyle} htmlFor="cp-anchor">Starts</label>
          <select
            id="cp-anchor"
            data-testid="cp-anchor"
            value={values.anchor}
            onChange={(e) => onChange({ ...values, anchor: e.target.value as AnchorChoice })}
            style={inputStyle}
            disabled={!canEdit}
          >
            <option value="none">After its links only</option>
            <option value="not_before">After its links, but not before…</option>
            <option value="fixed">On a fixed date…</option>
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="cp-anchor-date">Anchor date</label>
          <input
            id="cp-anchor-date"
            data-testid="cp-anchor-date"
            type="date"
            value={values.anchorDate}
            onChange={(e) => onChange({ ...values, anchorDate: e.target.value })}
            style={inputStyle}
            disabled={!canEdit || values.anchor === 'none'}
          />
        </div>
      </div>

      {status === 'in_progress' && (
        <div style={{ marginTop: '0.75rem', maxWidth: '360px' }}>
          <label style={labelStyle} htmlFor="cp-days-left">Working days left</label>
          <input
            id="cp-days-left"
            data-testid="cp-days-left"
            inputMode="numeric"
            value={values.daysLeft}
            onChange={(e) => onChange({ ...values, daysLeft: e.target.value })}
            style={inputStyle}
            disabled={!canEdit}
            placeholder="Not entered"
          />
          <p data-testid="cp-days-left-as-of" style={note}>
            {saved?.daysLeft != null && saved.daysLeftAsOf
              ? `${saved.daysLeft} entered as of ${shortDate(saved.daysLeftAsOf)}. Saving a new figure stamps today.`
              : 'Days left not entered: using the planned finish.'}
          </p>
          <p data-testid="cp-percent-reference" style={note}>
            {percentComplete ?? 0}% complete: shown for reference, not used for dates.
          </p>
        </div>
      )}

      {computed && (computed.start || computed.finish) && (
        <p data-testid="cp-computed" style={{ ...note, marginTop: '0.5rem' }}>
          Scheduled: {computed.start ? shortDate(computed.start) : '—'} → {computed.finish ? shortDate(computed.finish) : '—'}
          {computed.float !== null ? ` · ${computed.float} working day${computed.float === 1 ? '' : 's'} of float` : ''}
        </p>
      )}

      {(preview?.parts.length || previewError) && (
        <div
          data-testid="cp-preview"
          style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.375rem', fontSize: '0.8125rem', color: '#1e3a8a' }}
        >
          {previewError ? (
            <div data-testid="cp-preview-error" style={{ color: '#991b1b' }}>{previewError}</div>
          ) : (
            preview && (
              <>
                {preview.parts.map((p, i) => (
                  <div key={i} data-testid={`cp-edit-${p.kind}`}>{editSentence(p)}</div>
                ))}
                <div data-testid="cp-consequence" style={{ fontWeight: 600, marginTop: '0.25rem' }}>
                  {consequenceSentence(preview)}
                </div>
                {newlyCriticalTitles.length > 0 && (
                  <div data-testid="cp-newly-critical">Newly critical: {newlyCriticalTitles.join(', ')}.</div>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
