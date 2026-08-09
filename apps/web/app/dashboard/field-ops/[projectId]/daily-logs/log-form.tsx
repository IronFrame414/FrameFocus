'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createDailyLog,
  updateDailyLog,
  setDailyLogCrew,
  setDailyLogSubEntries,
  listProjectDayPresence,
  uploadDailyLogPhoto,
  generateDailyLogPdf,
  type DailyLogFields,
  type SubEntryInput,
} from '@/lib/services/daily-logs-client';

// 6B-1 §4 — shared create/edit form (path A: no handoff design; ui-01
// tokens). Crew auto-fills from the presence RPC on date change (create
// mode); hours are never shown or edited here — they derive at read time on
// the detail view. Sub hours are manual rows and never enter 6A. Saving
// regenerates the PDF (§2.3); a PDF failure never loses the log — it
// surfaces and the save stands.

export interface RosterMember {
  id: string;
  display_name: string;
  member_type: 'crew' | 'subcontractor';
}

interface LogFormProps {
  mode: 'create' | 'edit';
  projectId: string;
  logId?: string;
  roster: RosterMember[];
  initialFields: Partial<DailyLogFields> & { log_date: string; hazards_present: boolean };
  initialCrewIds: string[];
  initialSubs: SubEntryInput[];
}

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white p-[18px]';
const label = 'mb-[6px] block text-[11px] font-semibold uppercase tracking-wide text-[#8a919c]';
const input =
  'w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]';

export function LogForm({
  mode,
  projectId,
  logId,
  roster,
  initialFields,
  initialCrewIds,
  initialSubs,
}: LogFormProps) {
  const router = useRouter();

  const [fields, setFields] = useState<DailyLogFields>({
    log_date: initialFields.log_date,
    weather: initialFields.weather ?? '',
    work_performed: initialFields.work_performed ?? '',
    material_used: initialFields.material_used ?? '',
    material_needed: initialFields.material_needed ?? '',
    equipment_used: initialFields.equipment_used ?? '',
    tasks_tomorrow: initialFields.tasks_tomorrow ?? '',
    notes: initialFields.notes ?? '',
    hazards_present: initialFields.hazards_present,
    hazard_notes: initialFields.hazard_notes ?? '',
  });
  const [crewIds, setCrewIds] = useState<string[]>(initialCrewIds);
  const [subs, setSubs] = useState<SubEntryInput[]>(initialSubs);
  // Photos are LOG-BOUND (S87 revision): they need the log's id to link, so
  // selections queue here and upload at save — create mode has no id earlier.
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfWarning, setPdfWarning] = useState<string | null>(null);

  const memberName = (id: string) => roster.find((m) => m.id === id)?.display_name ?? 'Member';
  const subRoster = roster.filter((m) => m.member_type === 'subcontractor');

  function set<K extends keyof DailyLogFields>(key: K, value: DailyLogFields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function handleDateChange(ymd: string) {
    set('log_date', ymd);
    if (mode === 'create' && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      // Re-snapshot the crew for the newly selected day (§4 auto-fill).
      const presence = await listProjectDayPresence(projectId, ymd);
      setCrewIds(presence.map((p) => p.member_id));
    }
  }

  function handlePhotoSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPendingPhotos((p) => [...p, ...Array.from(files)]);
  }

  async function handleSave() {
    setError(null);
    setPdfWarning(null);
    // #133 / D-30 — work_performed is REQUIRED by the database as of migration
    // 20260824000000: CHECK (work_performed IS NOT NULL AND btrim(work_performed) <> '').
    // This guard sits ahead of the create/update branch on purpose, so it covers
    // BOTH paths: without it the payload below writes NULL on an empty textarea
    // and Postgres answers with a raw 23514 naming a constraint rather than a
    // field — including when someone merely re-saves a pre-constraint log.
    //
    // THE CLIENT CHECK IS DELIBERATELY STRICTER THAN THE DATABASE. JS .trim()
    // removes all whitespace; Postgres btrim() with one argument removes SPACES
    // ONLY, so a value of just a tab or newline satisfies the CHECK but is
    // refused here. That asymmetry is the safe direction — this form can never
    // send a row the database will reject — and it is written down so nobody
    // "aligns" the two later and reopens the 23514 path.
    if (!fields.work_performed?.trim()) {
      setError('Work performed is required.');
      return;
    }
    if (fields.hazards_present && !fields.hazard_notes?.trim()) {
      setError('Hazard notes are required when a hazard is flagged.');
      return;
    }
    for (const s of subs) {
      if (!s.member_id || !(s.hours >= 0)) {
        setError('Every subcontractor row needs a sub and a non-negative hours value.');
        return;
      }
    }
    setSaving(true);

    const payload: DailyLogFields = {
      ...fields,
      weather: fields.weather?.trim() || null,
      // #133 CLOSED [S122] — NOT `|| null` like its neighbours, and that is the
      // point. Every other field here is genuinely optional, so coercing blank
      // to NULL is right for them. `work_performed` is NOT NULL-and-non-blank in
      // the database (20260824000000), so the same expression could only ever
      // produce a row Postgres refuses with a raw 23514 naming a constraint
      // instead of a field. The guard above already returned on a blank value,
      // so `.trim()` here is the same string by construction — this line exists
      // so the payload cannot express the invalid state at all, rather than
      // relying on a check twenty lines away staying put.
      work_performed: fields.work_performed.trim(),
      material_used: fields.material_used?.trim() || null,
      material_needed: fields.material_needed?.trim() || null,
      equipment_used: fields.equipment_used?.trim() || null,
      tasks_tomorrow: fields.tasks_tomorrow?.trim() || null,
      notes: fields.notes?.trim() || null,
      hazard_notes: fields.hazards_present ? (fields.hazard_notes?.trim() ?? null) : null,
    };

    let targetId = logId;
    if (mode === 'create') {
      const result = await createDailyLog(projectId, payload, crewIds, subs);
      if (!result.success || !result.id) {
        setSaving(false);
        setError(result.error ?? 'Save failed');
        return;
      }
      targetId = result.id;
    } else if (logId) {
      const updated = await updateDailyLog(logId, payload);
      if (!updated.success) {
        setSaving(false);
        setError(updated.error ?? 'Save failed');
        return;
      }
      const crewResult = await setDailyLogCrew(logId, crewIds);
      if (!crewResult.success) {
        setSaving(false);
        setError(crewResult.error ?? 'Crew update failed');
        return;
      }
      const subResult = await setDailyLogSubEntries(logId, subs);
      if (!subResult.success) {
        setSaving(false);
        setError(subResult.error ?? 'Sub entries update failed');
        return;
      }
    }

    if (targetId) {
      // Log-bound photo uploads (S87) — now that the log id exists. Failures
      // don't lose the log; they surface before the redirect.
      const failed: string[] = [];
      for (const file of pendingPhotos) {
        const result = await uploadDailyLogPhoto(file, projectId, targetId);
        if (!result.success) failed.push(`${file.name}: ${result.error ?? 'upload failed'}`);
      }
      if (failed.length > 0) {
        window.alert(
          `The log saved, but ${failed.length} photo(s) did not attach:\n${failed.join('\n')}\nYou can re-attach them from Edit.`
        );
      }

      const pdf = await generateDailyLogPdf(targetId);
      if (!pdf.success) {
        // The log is saved; the PDF can be regenerated from the detail view.
        setPdfWarning(pdf.error ?? 'PDF generation failed — the log itself is saved.');
      }
      router.push(`/dashboard/field-ops/${projectId}/daily-logs/${targetId}`);
      router.refresh();
      return;
    }
    setSaving(false);
  }

  return (
    <div className="grid grid-cols-[1fr_320px] items-start gap-[18px]">
      {/* Left column */}
      <div className="flex flex-col gap-4">
        <div className={card}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Log date</label>
              <input
                type="date"
                className={input}
                value={fields.log_date}
                onChange={(e) => void handleDateChange(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>Weather (manual)</label>
              <input
                type="text"
                className={input}
                placeholder="92°, humid, brief rain 2pm"
                value={fields.weather ?? ''}
                onChange={(e) => set('weather', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className={card}>
          <label className={label}>Work performed (required)</label>
          <textarea
            className={`${input} min-h-[96px]`}
            placeholder="What was accomplished today"
            value={fields.work_performed ?? ''}
            onChange={(e) => set('work_performed', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ['material_used', 'Material used'],
              ['material_needed', 'Material needed'],
              ['equipment_used', 'Equipment used'],
              ['tasks_tomorrow', 'Tasks for tomorrow'],
            ] as const
          ).map(([key, title]) => (
            <div key={key} className={card}>
              <label className={label}>{title}</label>
              <textarea
                className={`${input} min-h-[64px]`}
                value={fields[key] ?? ''}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className={card}>
          <label className={label}>Notes</label>
          <textarea
            className={`${input} min-h-[64px]`}
            placeholder="Conversations, decisions, anything worth a dated record"
            value={fields.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        <div className={card}>
          <label className={label}>Photos</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handlePhotoSelect(e.target.files)}
            className="text-[13px] text-[#374151]"
          />
          <p className="mt-2 text-[11px] text-[#9aa1ac]">
            Photos attach to this log when you save (not shown in the client photo library;
            toggle per-photo sharing from the log view).
          </p>
          {pendingPhotos.length > 0 ? (
            <ul className="mt-1">
              {pendingPhotos.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center gap-2 py-[2px] text-[12px] text-[#374151]">
                  {file.name}
                  <button
                    type="button"
                    onClick={() => setPendingPhotos((p) => p.filter((_, j) => j !== i))}
                    className="text-[#c0362c] hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {/* Right rail */}
      <div className="flex flex-col gap-4">
        <div className="rounded-[13px] border border-[#f3e2c4] bg-[#fdf6ec] p-[16px]">
          <label className="flex items-center gap-2 text-[13px] font-bold text-[#8a5a12]">
            <input
              type="checkbox"
              checked={fields.hazards_present}
              onChange={(e) => set('hazards_present', e.target.checked)}
            />
            Hazard present today
          </label>
          {fields.hazards_present ? (
            <textarea
              className={`${input} mt-3 min-h-[64px] border-[#f3e2c4]`}
              placeholder="Required: describe the hazard"
              value={fields.hazard_notes ?? ''}
              onChange={(e) => set('hazard_notes', e.target.value)}
            />
          ) : null}
        </div>

        <div className={card}>
          <div className="mb-1 text-[13px] font-bold uppercase text-[#14213d]">
            Crew present{' '}
            <span className="text-[11px] font-medium normal-case text-[#9aa1ac]">
              · auto-filled, editable
            </span>
          </div>
          <div className="mt-2 flex flex-col">
            {crewIds.length === 0 ? (
              <p className="py-1 text-[12px] text-[#9aa1ac]">
                Nobody clocked time on this project-day yet.
              </p>
            ) : (
              crewIds.map((id) => (
                <div
                  key={id}
                  className="flex items-center justify-between border-b border-[#f4f6f9] py-2 last:border-0"
                >
                  <span className="text-[13px] text-[#374151]">{memberName(id)}</span>
                  <button
                    type="button"
                    onClick={() => setCrewIds((c) => c.filter((x) => x !== id))}
                    className="text-[12px] text-[#c0362c] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
          <select
            className={`${input} mt-2`}
            value=""
            onChange={(e) => {
              if (e.target.value) setCrewIds((c) => [...c, e.target.value]);
            }}
          >
            <option value="">+ Add member…</option>
            {roster
              .filter((m) => !crewIds.includes(m.id))
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
          </select>
          <p className="mt-2 text-[11px] text-[#9aa1ac]">
            Employee hours are read-only, from time tracking (6A) — shown on the log view.
          </p>
        </div>

        <div className={card}>
          <div className="mb-1 text-[13px] font-bold uppercase text-[#14213d]">
            Subs on site{' '}
            <span className="text-[11px] font-medium normal-case text-[#9aa1ac]">· manual</span>
          </div>
          {subs.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="mt-2 rounded-[9px] border border-[#eef1f6] p-2">
              <select
                className={input}
                value={s.member_id}
                onChange={(e) =>
                  setSubs((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, member_id: e.target.value } : r))
                  )
                }
              >
                <option value="">Select sub…</option>
                {subRoster.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  className={`${input} w-24`}
                  placeholder="Hours"
                  value={Number.isFinite(s.hours) ? s.hours : ''}
                  onChange={(e) =>
                    setSubs((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, hours: parseFloat(e.target.value) } : r
                      )
                    )
                  }
                />
                <input
                  type="text"
                  className={input}
                  placeholder="Note (e.g. rough-in 2nd flr)"
                  value={s.note ?? ''}
                  onChange={(e) =>
                    setSubs((rows) =>
                      rows.map((r, j) => (j === i ? { ...r, note: e.target.value } : r))
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setSubs((rows) => rows.filter((_, j) => j !== i))}
                  className="shrink-0 text-[12px] text-[#c0362c] hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSubs((rows) => [...rows, { member_id: '', hours: 0, note: '' }])}
            className="mt-2 text-[13px] font-semibold text-[#2f49d1] hover:underline"
          >
            + Add sub
          </button>
          <p className="mt-2 text-[11px] text-[#9aa1ac]">
            Sub hours are manual and never enter time tracking.
          </p>
        </div>

        {error ? (
          <div className="rounded-[9px] border border-[#f5c6c0] bg-[#fbe4e2] p-3 text-[13px] text-[#c0362c]">
            {error}
          </div>
        ) : null}
        {pdfWarning ? (
          <div className="rounded-[9px] border border-[#f3e2c4] bg-[#fdf6ec] p-3 text-[13px] text-[#8a5a12]">
            {pdfWarning}
          </div>
        ) : null}

        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-[9px] bg-[#2f49d1] px-[15px] py-[10px] text-[13px] font-semibold text-white transition-colors hover:bg-[#2438a8] disabled:opacity-50"
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Save daily log' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
