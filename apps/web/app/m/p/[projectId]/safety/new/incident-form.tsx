'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  INCIDENT_TYPES,
  INCIDENT_TYPE_LABELS,
  type IncidentType,
} from '@framefocus/shared/constants/safety';
import { createIncident, uploadIncidentPhoto } from '@/lib/services/safety-client';
import { SetMobileHeader } from '../../../../mobile-header';

// M6M §4.12.5 — the 7e form, verified against the live schema:
//   · the three type options ARE safety_incidents_incident_type_check, sourced
//     from the shared constant rather than retyped;
//   · "Who was hurt" and Witnesses are the member-OR-typed-outsider model
//     (member_id XOR name — the zod refine and the DB both enforce exactly-one);
//   · an `injury` MUST name a party — DB-enforced (D-30 rule 2 found it already
//     live), and the submit gate here keeps the form from composing a payload
//     the trigger would reject;
//   · filing emails Owner, Admin, PM & Foreman and writes the PDF — both the
//     server route's job (createIncident → /api/safety-incidents), stated on
//     the consequence line so it is never a surprise.
//
// D-29 — nothing on this screen persists ANYTHING until "File report". The
// hazard-escalation entry (`?date=`, from 7c) pre-fills state only.
//
// The red identity (#c0362c) — "the only screen that gets it. The severity of
// the action is the design" — is the screen's own header block; the shell's
// app bar stays the shell's.

export type RosterMember = { id: string; display_name: string; member_type: string };

type Party = { member_id: string | null; name: string | null };

export function IncidentForm({
  projectId,
  projectName,
  roster,
  initialDate,
}: {
  projectId: string;
  projectName: string;
  roster: RosterMember[];
  initialDate: string;
}) {
  const router = useRouter();

  const [type, setType] = useState<IncidentType | null>(null);
  const [injured, setInjured] = useState<Party[]>([]);
  const [outsiderName, setOutsiderName] = useState('');
  const [addingOutsider, setAddingOutsider] = useState(false);
  const [description, setDescription] = useState('');
  const [treatmentSought, setTreatmentSought] = useState(false);
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [witnesses, setWitnesses] = useState<Party[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const injuryNeedsParty = type === 'injury' && injured.length === 0;
  const ready = type !== null && description.trim().length > 0 && !injuryNeedsParty;

  function toggleMember(id: string) {
    setInjured((cur) =>
      cur.some((p) => p.member_id === id)
        ? cur.filter((p) => p.member_id !== id)
        : [...cur, { member_id: id, name: null }]
    );
  }

  async function submit() {
    if (!ready || type === null) return;
    setBusy(true);
    setError(null);

    const result = await createIncident({
      project_id: projectId,
      incident_date: initialDate,
      incident_type: type,
      description: description.trim(),
      injuries: injured.map((p) => ({
        member_id: p.member_id,
        name: p.name,
        treatment_sought: treatmentSought,
        treatment_notes: treatmentSought ? treatmentNotes.trim() || null : null,
      })),
      witnesses,
    });

    if (!result.success || !result.incidentId) {
      setBusy(false);
      setError(result.error ?? 'The report could not be filed.');
      return;
    }

    for (const file of photos) {
      const up = await uploadIncidentPhoto(file, projectId, result.incidentId);
      if (!up.success) setError(up.error ?? 'A photo failed to upload; the report is filed.');
    }

    setBusy(false);
    router.push(`/m/p/${projectId}/safety`);
    router.refresh();
  }

  return (
    <div className="pb-[18px]">
      <SetMobileHeader title="Report incident" sub={projectName} />

      {/* The red header block — 7e's identity. */}
      <header
        data-testid="m-incident-header"
        className="bg-m6m-danger px-[18px] pb-[14px] pt-[10px]"
      >
        <p className="text-[18px] font-extrabold text-white">Report incident</p>
        <p className="mt-[2px] font-mono text-[11px] text-white/80">
          {projectName} · {initialDate}
        </p>
      </header>

      <div className="px-[18px] pt-[14px]">
        {/* TYPE — three stacked options; the selected one fills red with a
            check. Never colour alone: the check mark carries the state too. */}
        <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          TYPE
        </h2>
        <div data-testid="m-incident-types" className="flex flex-col gap-[8px]">
          {INCIDENT_TYPES.map((t) => {
            const on = type === t;
            return (
              <button
                key={t}
                type="button"
                data-testid={`m-incident-type-${t}`}
                data-active={on ? 'true' : 'false'}
                aria-pressed={on}
                onClick={() => setType(t)}
                className={`flex min-h-[58px] items-center justify-between rounded-[14px] border px-[14px] text-[15px] font-bold ${
                  on
                    ? 'border-m6m-danger bg-m6m-danger text-white'
                    : 'border-m6m-border bg-m6m-card text-m6m-navy'
                }`}
              >
                {INCIDENT_TYPE_LABELS[t]}
                {on ? <span aria-hidden>✓</span> : null}
              </button>
            );
          })}
        </div>

        {/* WHO WAS HURT — required for an injury. Member rows OR a typed
            outsider; each party is exactly one of the two. */}
        {type === 'injury' ? (
          <section data-testid="m-injured-block" className="mt-[16px]">
            <div className="mb-[8px] flex items-center justify-between">
              <h2 className="font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
                WHO WAS HURT
              </h2>
              <span className="rounded-full bg-[#fdf1f0] px-[8px] py-[2px] font-mono text-[10px] font-semibold text-m6m-danger">
                Required
              </span>
            </div>
            <ul className="overflow-hidden rounded-[14px] border border-m6m-border bg-m6m-card">
              {roster.map((m) => {
                const on = injured.some((p) => p.member_id === m.id);
                return (
                  <li key={m.id} className="border-b border-m6m-border last:border-b-0">
                    <button
                      type="button"
                      data-testid="m-injured-member"
                      data-member-id={m.id}
                      data-active={on ? 'true' : 'false'}
                      onClick={() => toggleMember(m.id)}
                      className={`flex min-h-[58px] w-full items-center justify-between px-[14px] text-left ${
                        on ? 'border-l-[3px] border-m6m-danger bg-[#fdf1f0]' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold text-m6m-navy">
                          {m.display_name}
                        </span>
                        <span className="block font-mono text-[11px] text-m6m-muted">
                          {m.member_type}
                        </span>
                      </span>
                      {on ? <span aria-hidden className="text-m6m-danger">✓</span> : null}
                    </button>
                  </li>
                );
              })}
              {injured
                .filter((p) => p.name)
                .map((p, i) => (
                  <li
                    key={`outsider-${i}`}
                    data-testid="m-injured-outsider"
                    className="flex min-h-[58px] items-center justify-between border-b border-m6m-border px-[14px] last:border-b-0"
                  >
                    <span className="text-[15px] font-bold text-m6m-navy">{p.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => setInjured((cur) => cur.filter((x) => x.name !== p.name))}
                      className="flex h-11 w-11 items-center justify-center text-m6m-muted"
                    >
                      ✕
                    </button>
                  </li>
                ))}
            </ul>

            {addingOutsider ? (
              <div className="mt-[8px] flex items-center gap-[8px]">
                <input
                  data-testid="m-outsider-name"
                  value={outsiderName}
                  onChange={(e) => setOutsiderName(e.target.value)}
                  placeholder="Name"
                  className="h-11 min-w-0 flex-1 rounded-[10px] border border-m6m-border px-[12px] text-[15px]"
                />
                <button
                  type="button"
                  data-testid="m-outsider-add"
                  onClick={() => {
                    if (outsiderName.trim()) {
                      setInjured((cur) => [...cur, { member_id: null, name: outsiderName.trim() }]);
                      setOutsiderName('');
                      setAddingOutsider(false);
                    }
                  }}
                  className="flex h-11 items-center rounded-[10px] border border-m6m-border px-[14px] text-[14px] font-semibold text-m6m-navy"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="m-add-outsider"
                onClick={() => setAddingOutsider(true)}
                className="mt-[8px] flex min-h-[52px] w-full items-center justify-center rounded-[14px] border border-dashed border-m6m-border bg-m6m-card text-[14px] font-semibold text-m6m-navy"
              >
                + Someone not on the team
              </button>
            )}
          </section>
        ) : null}

        {/* WHAT HAPPENED. */}
        <section className="mt-[16px]">
          <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
            WHAT HAPPENED
          </h2>
          <textarea
            data-testid="m-incident-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-[14px] border border-m6m-border bg-m6m-card px-[14px] py-[10px] text-[15px] text-m6m-navy"
          />
        </section>

        {/* Disclosure rows — Treatment given, Witnesses, Photos. */}
        <section className="mt-[14px] overflow-hidden rounded-[14px] border border-m6m-border bg-m6m-card">
          <Row id="treatment" label="Treatment given" open={openRow} onToggle={setOpenRow}
            badge={treatmentSought ? 'Yes' : null}>
            <label className="flex min-h-[44px] items-center justify-between text-[15px] font-semibold text-m6m-navy">
              Treatment was sought
              <input
                type="checkbox"
                data-testid="m-treatment-toggle"
                checked={treatmentSought}
                onChange={(e) => setTreatmentSought(e.target.checked)}
                className="h-[26px] w-[44px]"
              />
            </label>
            {treatmentSought ? (
              <textarea
                data-testid="m-treatment-notes"
                value={treatmentNotes}
                onChange={(e) => setTreatmentNotes(e.target.value)}
                rows={2}
                placeholder="What treatment?"
                className="mt-[8px] w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px]"
              />
            ) : null}
          </Row>
          <Row id="witnesses" label="Witnesses" open={openRow} onToggle={setOpenRow}
            badge={witnesses.length > 0 ? String(witnesses.length) : null}>
            <div className="flex flex-col gap-[6px]">
              {roster.map((m) => {
                const on = witnesses.some((w) => w.member_id === m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-testid="m-witness-member"
                    data-active={on ? 'true' : 'false'}
                    onClick={() =>
                      setWitnesses((cur) =>
                        on
                          ? cur.filter((w) => w.member_id !== m.id)
                          : [...cur, { member_id: m.id, name: null }]
                      )
                    }
                    className={`flex min-h-[44px] items-center justify-between rounded-[10px] border px-[12px] text-[14px] font-semibold ${
                      on ? 'border-m6m-blue bg-[#f5f7ff] text-m6m-blue' : 'border-m6m-border text-m6m-navy'
                    }`}
                  >
                    {m.display_name}
                    {on ? <span aria-hidden>✓</span> : null}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row id="photos" label="Photos" open={openRow} onToggle={setOpenRow}
            badge={photos.length > 0 ? String(photos.length) : null}>
            <label className="flex min-h-[52px] cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-m6m-border text-[14px] font-semibold text-m6m-blue">
              Add photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                data-testid="m-incident-photo-input"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhotos((cur) => [...cur, f]);
                  e.target.value = '';
                }}
              />
            </label>
          </Row>
        </section>

        {error ? (
          <p
            data-testid="m-incident-error"
            role="alert"
            className="mt-[12px] rounded-[10px] border border-m6m-danger-border bg-[#fdf1f0] px-[12px] py-[8px] text-[14px] text-m6m-danger"
          >
            {error}
          </p>
        ) : null}

        {/* The consequence line, directly above the button. */}
        <p className="mt-[14px] text-center text-[12px] text-m6m-muted">
          Emails Owner, Admin, PM &amp; Foreman immediately
        </p>
        <button
          type="button"
          data-testid="m-file-report"
          disabled={!ready || busy}
          onClick={submit}
          className="mt-[6px] flex h-[60px] w-full items-center justify-center rounded-[14px] bg-m6m-danger text-[17px] font-bold text-white disabled:opacity-40"
        >
          {busy ? 'Filing…' : 'File report'}
        </button>
      </div>
    </div>
  );
}

function Row({
  id,
  label,
  badge,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  badge: string | null;
  open: string | null;
  onToggle: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div className="border-b border-m6m-border last:border-b-0">
      <button
        type="button"
        data-testid={`m-incident-row-${id}`}
        aria-expanded={isOpen}
        onClick={() => onToggle(isOpen ? null : id)}
        className="flex min-h-[58px] w-full items-center justify-between px-[14px] text-[15px] font-semibold text-m6m-navy"
      >
        {label}
        <span className="flex items-center gap-[8px]">
          {badge ? (
            <span className="font-mono text-[12px] font-semibold text-m6m-blue">{badge}</span>
          ) : null}
          <span aria-hidden className={`text-m6m-muted ${isOpen ? 'rotate-90' : ''}`}>
            ›
          </span>
        </span>
      </button>
      {isOpen ? <div className="px-[14px] pb-[14px]">{children}</div> : null}
    </div>
  );
}
