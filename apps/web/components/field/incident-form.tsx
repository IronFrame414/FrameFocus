'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABELS,
  type IncidentType,
} from '@framefocus/shared';
import {
  createIncident,
  updateIncident,
  setIncidentInjuries,
  setIncidentWitnesses,
  uploadIncidentPhoto,
  generateIncidentPdf,
  type InjuryRowInput,
  type PersonRowInput,
} from '@/lib/services/safety-client';

// 6C §U — incident create/edit form (path A — no handoff design; mobile
// foundation). Injured parties and witnesses are member-OR-outsider rows
// (num_nonnulls identity, live CHECK). The witness section ASKS ("Was anyone
// else present?") instead of rendering a blank grid (§2.2 build note).
// Photos queue and upload after save (incident-bound, Q5); a project-less
// (shop/yard) incident skips photos in v1 — file storage paths are
// project-keyed.

const card = 'rounded-[13px] border border-[#e6e9ef] bg-white p-[18px]';
const label = 'mb-[6px] block text-[11px] font-semibold uppercase tracking-wide text-[#8a919c]';
const input =
  'w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]';

export const NO_PROJECT = '__none__';

export interface RosterOption {
  id: string;
  display_name: string;
}

interface PersonRowState {
  id?: string;
  member_id: string; // '' = outsider
  name: string;
  treatment_sought: boolean;
  treatment_notes: string;
}

interface IncidentFormProps {
  mode: 'create' | 'edit';
  incidentId?: string;
  /** Selectable projects (company-level create) — null locks to fixedProjectId. */
  projects: { id: string; name: string }[] | null;
  fixedProjectId?: string | null;
  roster: RosterOption[];
  initialFields: {
    project_id: string | null;
    incident_date: string;
    incident_type: IncidentType;
    description: string;
    prevention_notes: string | null;
  };
  initialInjuries: (InjuryRowInput & { display_name?: string | null })[];
  initialWitnesses: (PersonRowInput & { display_name?: string | null })[];
}

function toRowState(r: {
  id?: string;
  member_id?: string | null;
  name?: string | null;
  treatment_sought?: boolean;
  treatment_notes?: string | null;
}): PersonRowState {
  return {
    id: r.id,
    member_id: r.member_id ?? '',
    name: r.name ?? '',
    treatment_sought: r.treatment_sought ?? false,
    treatment_notes: r.treatment_notes ?? '',
  };
}

export function IncidentForm({
  mode,
  incidentId,
  projects,
  fixedProjectId,
  roster,
  initialFields,
  initialInjuries,
  initialWitnesses,
}: IncidentFormProps) {
  const router = useRouter();

  const [projectId, setProjectId] = useState<string>(
    fixedProjectId ?? initialFields.project_id ?? NO_PROJECT
  );
  const [date, setDate] = useState(initialFields.incident_date);
  const [type, setType] = useState<IncidentType>(initialFields.incident_type);
  const [description, setDescription] = useState(initialFields.description);
  const [prevention, setPrevention] = useState(initialFields.prevention_notes ?? '');
  const [injuries, setInjuries] = useState<PersonRowState[]>(initialInjuries.map(toRowState));
  const [askWitnesses, setAskWitnesses] = useState(initialWitnesses.length > 0);
  const [witnesses, setWitnesses] = useState<PersonRowState[]>(initialWitnesses.map(toRowState));
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveProjectId =
    fixedProjectId ?? (projectId === NO_PROJECT ? null : projectId || null);

  function personRow(): PersonRowState {
    return { member_id: '', name: '', treatment_sought: false, treatment_notes: '' };
  }

  function validateRows(rows: PersonRowState[], what: string): string | null {
    for (const r of rows) {
      if (!r.member_id && !r.name.trim()) {
        return `Each ${what} needs a roster member or a typed outside name.`;
      }
    }
    return null;
  }

  async function handleSave() {
    setError(null);
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    if (type === 'injury' && injuries.length === 0) {
      setError('An injury must name at least one injured party.');
      return;
    }
    const rowError =
      validateRows(injuries, 'injured party') ??
      validateRows(askWitnesses ? witnesses : [], 'witness');
    if (rowError) {
      setError(rowError);
      return;
    }
    setSaving(true);

    const injuryPayload = injuries.map((r) => ({
      id: r.id,
      member_id: r.member_id || null,
      name: r.member_id ? null : r.name.trim(),
      treatment_sought: r.treatment_sought,
      treatment_notes: r.treatment_notes.trim() || null,
    }));
    const witnessPayload = (askWitnesses ? witnesses : []).map((r) => ({
      id: r.id,
      member_id: r.member_id || null,
      name: r.member_id ? null : r.name.trim(),
    }));

    let targetId = incidentId;
    let createEmailErrors: string[] | undefined;
    if (mode === 'create') {
      const result = await createIncident({
        project_id: effectiveProjectId,
        incident_date: date,
        incident_type: type,
        description: description.trim(),
        prevention_notes: prevention.trim() || null,
        injuries: injuryPayload.map(({ id: _id, ...rest }) => rest),
        witnesses: witnessPayload.map(({ id: _id, ...rest }) => rest),
      });
      if (!result.success || !result.incidentId) {
        setSaving(false);
        setError(result.error ?? 'Save failed');
        return;
      }
      targetId = result.incidentId;
      createEmailErrors = result.emailErrors;
    } else if (incidentId) {
      const updated = await updateIncident(incidentId, {
        incident_date: date,
        incident_type: type,
        description: description.trim(),
        prevention_notes: prevention.trim() || null,
      });
      if (!updated.success) {
        setSaving(false);
        setError(updated.error ?? 'Save failed');
        return;
      }
      const injuriesResult = await setIncidentInjuries(incidentId, injuryPayload);
      if (!injuriesResult.success) {
        setSaving(false);
        setError(injuriesResult.error ?? 'Injured-party update failed');
        return;
      }
      const witnessesResult = await setIncidentWitnesses(incidentId, witnessPayload);
      if (!witnessesResult.success) {
        setSaving(false);
        setError(witnessesResult.error ?? 'Witness update failed');
        return;
      }
    }

    if (targetId) {
      const failed: string[] = [];
      if (effectiveProjectId) {
        for (const file of pendingPhotos) {
          const result = await uploadIncidentPhoto(file, effectiveProjectId, targetId);
          if (!result.success) failed.push(`${file.name}: ${result.error ?? 'upload failed'}`);
        }
      }
      if (failed.length > 0) {
        window.alert(
          `The incident saved, but ${failed.length} photo(s) did not attach:\n${failed.join('\n')}`
        );
      }
      // Edits (and post-create photo attaches) regenerate the PDF (§7).
      if (mode === 'edit' || pendingPhotos.length > 0) {
        await generateIncidentPdf(targetId);
      }
      if (createEmailErrors && createEmailErrors.length > 0) {
        window.alert(
          `Incident recorded, but some notifications failed (retry is available to Owner/Admin on the incident page):\n${createEmailErrors.join('\n')}`
        );
      }
      router.push(`/dashboard/field-ops/safety/${targetId}`);
      router.refresh();
      return;
    }
    setSaving(false);
  }

  function PersonRows({
    rows,
    setRows,
    withTreatment,
    what,
  }: {
    rows: PersonRowState[];
    setRows: (updater: (rows: PersonRowState[]) => PersonRowState[]) => void;
    withTreatment: boolean;
    what: string;
  }) {
    return (
      <>
        {rows.map((row, i) => (
          <div key={row.id ?? `new-${i}`} className="mb-2 rounded-[9px] border border-[#eef1f6] p-3">
            <div className="flex gap-2">
              <select
                className={input}
                value={row.member_id}
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, j) => (j === i ? { ...r, member_id: e.target.value } : r))
                  )
                }
              >
                <option value="">— Outside person (type a name) —</option>
                {roster.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
              {!row.member_id ? (
                <input
                  type="text"
                  className={input}
                  placeholder={`${what} name`}
                  value={row.name}
                  onChange={(e) =>
                    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))
                  }
                />
              ) : null}
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                className="shrink-0 text-[12px] text-[#c0362c] hover:underline"
              >
                Remove
              </button>
            </div>
            {withTreatment ? (
              <div className="mt-2 flex items-center gap-2">
                <label className="flex shrink-0 items-center gap-2 text-[13px] text-[#374151]">
                  <input
                    type="checkbox"
                    checked={row.treatment_sought}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((r, j) =>
                          j === i ? { ...r, treatment_sought: e.target.checked } : r
                        )
                      )
                    }
                  />
                  Treatment sought
                </label>
                {row.treatment_sought ? (
                  <input
                    type="text"
                    className={input}
                    placeholder='e.g. "Urgent care, stitches."'
                    value={row.treatment_notes}
                    onChange={(e) =>
                      setRows((rs) =>
                        rs.map((r, j) => (j === i ? { ...r, treatment_notes: e.target.value } : r))
                      )
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </>
    );
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <div className={card}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={label}>Project</label>
            {projects ? (
              <select
                className={input}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value={NO_PROJECT}>No project (shop/yard)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="py-[9px] text-[13px] font-semibold text-[#14213d]">
                (this project)
              </div>
            )}
          </div>
          <div>
            <label className={label}>Incident date</label>
            <input
              type="date"
              className={input}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className={label}>Type</label>
            <select
              className={input}
              value={type}
              onChange={(e) => setType(e.target.value as IncidentType)}
            >
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INCIDENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={card}>
        <label className={label}>What happened</label>
        <textarea
          className={`${input} min-h-[96px]`}
          placeholder="Factual description — what, where, how"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className={card}>
        <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">
          Injured parties{' '}
          {type === 'injury' ? (
            <span className="text-[11px] font-medium normal-case text-[#c0362c]">
              · required for an injury
            </span>
          ) : (
            <span className="text-[11px] font-medium normal-case text-[#9aa1ac]">· if any</span>
          )}
        </div>
        <PersonRows rows={injuries} setRows={setInjuries} withTreatment what="Injured" />
        <button
          type="button"
          onClick={() => setInjuries((rs) => [...rs, personRow()])}
          className="text-[13px] font-semibold text-[#2f49d1] hover:underline"
        >
          + Add injured party
        </button>
      </div>

      <div className={card}>
        <div className="mb-2 text-[13px] font-bold uppercase text-[#14213d]">Witnesses</div>
        {!askWitnesses ? (
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#374151]">Was anyone else present?</span>
            <button
              type="button"
              onClick={() => {
                setAskWitnesses(true);
                setWitnesses((rs) => (rs.length === 0 ? [personRow()] : rs));
              }}
              className="text-[13px] font-semibold text-[#2f49d1] hover:underline"
            >
              Yes — add witnesses
            </button>
            <span className="text-[12px] text-[#9aa1ac]">No — leave empty</span>
          </div>
        ) : (
          <>
            <PersonRows rows={witnesses} setRows={setWitnesses} withTreatment={false} what="Witness" />
            <button
              type="button"
              onClick={() => setWitnesses((rs) => [...rs, personRow()])}
              className="text-[13px] font-semibold text-[#2f49d1] hover:underline"
            >
              + Add witness
            </button>
          </>
        )}
      </div>

      <div className={card}>
        <label className={label}>Prevention — what keeps this from happening again</label>
        <textarea
          className={`${input} min-h-[64px]`}
          value={prevention}
          onChange={(e) => setPrevention(e.target.value)}
        />
      </div>

      <div className={card}>
        <label className={label}>Photos</label>
        {effectiveProjectId ? (
          <>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                if (e.target.files) setPendingPhotos((p) => [...p, ...Array.from(e.target.files!)]);
              }}
              className="text-[13px] text-[#374151]"
            />
            {pendingPhotos.length > 0 ? (
              <ul className="mt-1">
                {pendingPhotos.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-2 py-[2px] text-[12px] text-[#374151]"
                  >
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
            <p className="mt-2 text-[11px] text-[#9aa1ac]">
              Photos attach to this incident on save (category Safety; never client-visible).
            </p>
          </>
        ) : (
          <p className="text-[12px] text-[#9aa1ac]">
            Photo attach needs a project in v1 — shop/yard incidents record without photos.
          </p>
        )}
      </div>

      {error ? (
        <div className="rounded-[9px] border border-[#f5c6c0] bg-[#fbe4e2] p-3 text-[13px] text-[#c0362c]">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="self-start rounded-[9px] bg-[#c0362c] px-[16px] py-[10px] text-[13px] font-semibold text-white transition-colors hover:bg-[#a52d24] disabled:opacity-50"
      >
        {saving ? 'Saving…' : mode === 'create' ? 'File incident report' : 'Save changes'}
      </button>
      {mode === 'create' ? (
        <p className="-mt-2 text-[11px] text-[#9aa1ac]">
          Filing notifies everyone above your role immediately, and files a PDF to the Safety
          folder.
        </p>
      ) : null}
    </div>
  );
}
