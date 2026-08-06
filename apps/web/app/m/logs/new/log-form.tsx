'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  createDailyLog,
  listProjectDayPresence,
  uploadDailyLogPhoto,
  type DayPresence,
  type SubEntryInput,
} from '@/lib/services/daily-logs-client';
import { useOfflineSync } from '../../offline-sync';
import { buildDailyLogEntry, buildPhotoEntry } from '@/lib/offline/capture';
import { SetMobileHeader } from '../../mobile-header';

// M6M §4.12.3 — the 7c form. Work performed is THE required field (the D-30
// CHECK behind it rejects NULL and blank alike); crew hours are READ-ONLY,
// derived from 6A presence; sub hours are manual.
//
// ---------------------------------------------------------------------------
// D-29 — THE HAZARD ESCALATION IS CONTEXT ONLY.
// ---------------------------------------------------------------------------
// The hazard toggle backs daily_logs.hazards_present + hazard_notes (the
// hazard-notes CHECK requires notes with the flag). On successful submit with
// the flag on, the confirmation OFFERS "File an incident report" — a LINK to a
// blank 7e pre-filled with project and date through the URL. NO DRAFT INCIDENT
// ROW IS WRITTEN; nothing persists unless the user submits 7e. A hazard flag
// is not an incident.
//
// The camera tile routes through the ordinary file input (capture-first, D-8)
// — no second camera implementation. Photos are held as File objects and
// uploaded through uploadDailyLogPhoto AFTER the log row exists, so they bind
// to their log (S87's log-bound rule) rather than pooling on the day.

export type SubMember = { id: string; display_name: string };
type Project = { id: string; name: string; project_number: string };

export function LogForm({
  projects,
  initialProjectId,
  subs,
  today,
}: {
  projects: Project[];
  initialProjectId: string | null;
  subs: SubMember[];
  /**
   * The company's calendar day, resolved SERVER-SIDE [S106]. `log_date` is a
   * calendar date, and this form must not derive it from the handset — that is
   * neither the company's zone (a crew member can be in another one) nor UTC.
   * It was `new Date().toISOString().slice(0, 10)`, which recorded TOMORROW
   * for any log filed after ~20:00 EDT.
   */
  today: string;
}) {
  const router = useRouter();
  const offlineSync = useOfflineSync();

  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [workPerformed, setWorkPerformed] = useState('');
  const [presence, setPresence] = useState<DayPresence[]>([]);
  const [subEntries, setSubEntries] = useState<SubEntryInput[]>([]);
  const [materials, setMaterials] = useState('');
  const [equipment, setEquipment] = useState('');
  const [tomorrow, setTomorrow] = useState('');
  const [hazard, setHazard] = useState(false);
  const [hazardNotes, setHazardNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    logId: string;
    hazard: boolean;
    queued: boolean;
    rosterDropped: boolean;
  } | null>(null);

  // Crew & hours — "auto from clock", read-only (§4.12.3). The 6A presence RPC
  // is the named source; nothing here is editable.
  useEffect(() => {
    if (!projectId) {
      setPresence([]);
      return;
    }
    let cancelled = false;
    listProjectDayPresence(projectId, today).then((rows) => {
      if (!cancelled) setPresence(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, today]);

  const ready = projectId !== null && workPerformed.trim().length > 0 && (!hazard || hazardNotes.trim());

  async function submit() {
    if (!ready || !projectId) return;
    setBusy(true);
    setError(null);

    // §5.1 / §5.5.3 — OFFLINE, the log queues as one insert entry and each
    // photo as its own entry gated on it (depends_on), the Blob riding in the
    // payload. On reconnect the photos upload THROUGH uploadFile — HEIC
    // conversion included — with their client-generated fileId (§5.3).
    //
    // What the queue CANNOT carry: daily_log_crew and daily_log_sub_entries
    // rows — §5.2's entity set is closed at four. Offline the presence RPC
    // returns [] anyway; manually-entered sub hours would be silently lost,
    // so the confirmation says so instead of pretending (§5.2.6's principle).
    if (!navigator.onLine && offlineSync) {
      const captured_at = new Date().toISOString();
      const logId = crypto.randomUUID();
      const logEntryId = crypto.randomUUID();
      await offlineSync.enqueue(
        buildDailyLogEntry({
          entryId: logEntryId,
          logId,
          projectId,
          fields: {
            log_date: today,
            work_performed: workPerformed.trim(),
            material_used: materials.trim() || null,
            equipment_used: equipment.trim() || null,
            tasks_tomorrow: tomorrow.trim() || null,
            hazards_present: hazard,
            hazard_notes: hazard ? hazardNotes.trim() : null,
          },
          captured_at,
        })
      );
      for (const file of photos) {
        await offlineSync.enqueue(
          buildPhotoEntry({
            entryId: crypto.randomUUID(),
            fileId: crypto.randomUUID(),
            projectId,
            blob: file,
            fileName: file.name,
            captured_at,
            dependsOn: logEntryId,
            dailyLogId: logId,
          })
        );
      }
      setBusy(false);
      setDone({
        logId,
        hazard,
        queued: true,
        rosterDropped:
          presence.length > 0 || subEntries.some((s) => s.member_id && s.hours > 0),
      });
      return;
    }

    const result = await createDailyLog(
      projectId,
      {
        log_date: today,
        work_performed: workPerformed.trim(),
        material_used: materials.trim() || null,
        equipment_used: equipment.trim() || null,
        tasks_tomorrow: tomorrow.trim() || null,
        hazards_present: hazard,
        hazard_notes: hazard ? hazardNotes.trim() : null,
      },
      presence.map((p) => p.member_id),
      subEntries.filter((s) => s.member_id && s.hours > 0)
    );

    if (!result.success || !result.id) {
      setBusy(false);
      setError(result.error ?? 'Could not save the log.');
      return;
    }

    // Photos bind to THIS log via daily_log_id — uploaded after the row
    // exists, through the shared uploadFile path (HEIC conversion included).
    for (const file of photos) {
      const up = await uploadDailyLogPhoto(file, projectId, result.id);
      if (!up.success) {
        setError(up.error ?? 'A photo failed to upload; the log itself is saved.');
      }
    }

    setBusy(false);
    setDone({ logId: result.id, hazard, queued: false, rosterDropped: false });
  }

  // -------------------------------------------------------------------------
  // SUBMITTED. With the hazard flag on, the D-29 offer: a LINK, nothing
  // written. Without it, straight back to the logs list.
  // -------------------------------------------------------------------------
  if (done) {
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title="Log the day" sub={null} />
        <p
          data-testid="m-log-saved"
          className="rounded-[15px] border border-m6m-border bg-m6m-card px-[16px] py-[18px] text-center text-[16px] font-bold text-m6m-navy"
        >
          {done.queued ? 'Log saved offline — it will sync when you’re back online.' : 'Log submitted.'}
        </p>
        {done.rosterDropped ? (
          <p
            data-testid="m-log-roster-dropped"
            className="mt-[10px] rounded-[10px] border border-m6m-border bg-m6m-strip-bg px-[12px] py-[8px] text-[13px] text-m6m-navy"
          >
            Crew and sub hours can&apos;t be saved offline — open the log and add them once
            you&apos;re back online.
          </p>
        ) : null}
        {done.hazard && projectId ? (
          <Link
            // D-29 — a BLANK 7e pre-filled with project (the route segment)
            // and date (the query). No draft row exists behind this link.
            href={`/m/p/${projectId}/safety/new?date=${today}&from=log`}
            data-testid="m-file-incident-offer"
            className="mt-[12px] flex min-h-[56px] w-full items-center justify-center rounded-[14px] border border-m6m-danger-border bg-[#fdf1f0] text-[15px] font-bold text-m6m-danger"
          >
            File an incident report
          </Link>
        ) : null}
        <button
          type="button"
          data-testid="m-log-done"
          onClick={() => {
            router.push('/m/logs');
            router.refresh();
          }}
          className="mt-[12px] flex min-h-[52px] w-full items-center justify-center rounded-[14px] border border-m6m-border bg-m6m-card text-[15px] font-semibold text-m6m-navy"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Log the day" sub={today} />

      {/* Project — pre-filled from M-3's button, else a required picker. */}
      {initialProjectId === null ? (
        <section data-testid="m-log-project-block" className="mb-[14px]">
          <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
            PROJECT
          </h2>
          <select
            data-testid="m-log-project"
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="h-[52px] w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] text-[15px] text-m6m-navy"
          >
            <option value="">Choose a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.project_number}
              </option>
            ))}
          </select>
        </section>
      ) : null}

      {/* WORK PERFORMED — the one required field. */}
      <section className="rounded-[15px] border-[1.5px] border-m6m-blue bg-m6m-card p-[15px]">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
            WORK PERFORMED
          </h2>
          <span className="rounded-full bg-[#f5f7ff] px-[8px] py-[2px] font-mono text-[10px] font-semibold text-m6m-blue">
            Required
          </span>
        </div>
        <textarea
          data-testid="m-work-performed"
          value={workPerformed}
          onChange={(e) => setWorkPerformed(e.target.value)}
          rows={3}
          placeholder="What got done today?"
          className="mt-[8px] w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px] text-m6m-navy"
        />
      </section>

      {/* CREW & HOURS — auto from clock, read-only. */}
      <section className="mt-[14px]">
        <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          CREW &amp; HOURS · AUTO FROM CLOCK
        </h2>
        {presence.length === 0 ? (
          <p data-testid="m-presence-empty" className="text-[14px] text-m6m-muted">
            No clocked hours on this project today.
          </p>
        ) : (
          <div data-testid="m-presence-pills" className="flex flex-wrap gap-[6px]">
            {presence.map((p) => (
              <span
                key={p.member_id}
                data-testid="m-presence-pill"
                className="rounded-full border border-m6m-border bg-m6m-card px-[10px] py-[6px] font-mono text-[12px] text-m6m-navy"
              >
                {p.hours}h
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Photos — camera-first input, gallery as the fallback (D-8). */}
      <section className="mt-[14px]">
        <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          PHOTOS{photos.length > 0 ? ` · ${photos.length}` : ''}
        </h2>
        <label
          data-testid="m-log-photo-input"
          className="flex min-h-[56px] cursor-pointer items-center justify-center rounded-[14px] border border-dashed border-m6m-border bg-m6m-card text-[15px] font-semibold text-m6m-blue"
        >
          Add photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setPhotos((cur) => [...cur, f]);
              e.target.value = '';
            }}
          />
        </label>
      </section>

      {/* The three disclosure rows (§4.12.3). */}
      <section className="mt-[14px] overflow-hidden rounded-[14px] border border-m6m-border bg-m6m-card">
        <Disclosure
          id="materials"
          label="Materials & equipment"
          open={openRow}
          onToggle={setOpenRow}
          badge={materials.trim() || equipment.trim() ? '✓' : null}
        >
          <textarea
            data-testid="m-materials"
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
            rows={2}
            placeholder="Materials used"
            className="w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px]"
          />
          <textarea
            data-testid="m-equipment"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            rows={2}
            placeholder="Equipment used"
            className="mt-[8px] w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px]"
          />
        </Disclosure>
        <Disclosure
          id="subs"
          label="Subs on site"
          open={openRow}
          onToggle={setOpenRow}
          badge={subEntries.length > 0 ? String(subEntries.length) : null}
        >
          {subs.length === 0 ? (
            <p className="text-[14px] text-m6m-muted">No subcontractors on the roster.</p>
          ) : (
            <div className="flex flex-col gap-[8px]">
              {subEntries.map((entry, i) => (
                <div key={i} className="flex items-center gap-[8px]">
                  <select
                    value={entry.member_id}
                    onChange={(e) =>
                      setSubEntries((cur) =>
                        cur.map((s, j) => (j === i ? { ...s, member_id: e.target.value } : s))
                      )
                    }
                    className="h-[44px] min-w-0 flex-1 rounded-[10px] border border-m6m-border px-[8px] text-[14px]"
                  >
                    {subs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.display_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={entry.hours}
                    aria-label="Hours"
                    onChange={(e) =>
                      setSubEntries((cur) =>
                        cur.map((s, j) => (j === i ? { ...s, hours: Number(e.target.value) } : s))
                      )
                    }
                    className="h-[44px] w-[76px] rounded-[10px] border border-m6m-border px-[8px] text-right font-mono text-[14px]"
                  />
                </div>
              ))}
              <button
                type="button"
                data-testid="m-add-sub"
                onClick={() =>
                  setSubEntries((cur) => [...cur, { member_id: subs[0].id, hours: 0 }])
                }
                className="flex min-h-[44px] items-center justify-center rounded-[10px] border border-dashed border-m6m-border text-[14px] font-semibold text-m6m-blue"
              >
                Add sub
              </button>
            </div>
          )}
        </Disclosure>
        <Disclosure
          id="tomorrow"
          label="Tomorrow's tasks"
          open={openRow}
          onToggle={setOpenRow}
          badge={tomorrow.trim() ? '✓' : null}
        >
          <textarea
            data-testid="m-tomorrow"
            value={tomorrow}
            onChange={(e) => setTomorrow(e.target.value)}
            rows={2}
            className="w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px]"
          />
        </Disclosure>
      </section>

      {/* The hazard toggle card. Notes required with the flag (DB CHECK). */}
      <section
        data-testid="m-hazard-card"
        className={`mt-[14px] rounded-[15px] border p-[15px] ${
          hazard ? 'border-m6m-amber bg-m6m-strip-bg' : 'border-m6m-border bg-m6m-card'
        }`}
      >
        <label className="flex min-h-[44px] items-center justify-between text-[15px] font-bold text-m6m-navy">
          Flag a hazard
          <input
            type="checkbox"
            data-testid="m-hazard-toggle"
            checked={hazard}
            onChange={(e) => setHazard(e.target.checked)}
            className="h-[26px] w-[44px]"
          />
        </label>
        {hazard ? (
          <textarea
            data-testid="m-hazard-notes"
            value={hazardNotes}
            onChange={(e) => setHazardNotes(e.target.value)}
            rows={2}
            placeholder="What's the hazard? (required)"
            className="mt-[8px] w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px]"
          />
        ) : null}
      </section>

      {error ? (
        <p
          data-testid="m-log-error"
          role="alert"
          className="mt-[12px] rounded-[10px] border border-m6m-danger-border bg-[#fdf1f0] px-[12px] py-[8px] text-[14px] text-m6m-danger"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="m-submit-log"
        disabled={!ready || busy}
        onClick={submit}
        className="mt-[16px] flex h-[60px] w-full items-center justify-center rounded-[14px] bg-m6m-amber text-[17px] font-bold text-m6m-navy disabled:opacity-40"
      >
        {busy ? 'Submitting…' : 'Submit log'}
      </button>
    </div>
  );
}

/** The handoff's 58px disclosure row — label left, value/count + chevron right. */
function Disclosure({
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
        data-testid={`m-disclosure-${id}`}
        aria-expanded={isOpen}
        onClick={() => onToggle(isOpen ? null : id)}
        className="flex min-h-[58px] w-full items-center justify-between px-[14px] text-[15px] font-semibold text-m6m-navy"
      >
        {label}
        <span className="flex items-center gap-[8px]">
          {badge ? (
            <span className="font-mono text-[12px] font-semibold text-m6m-blue">{badge}</span>
          ) : null}
          <span aria-hidden className={`text-m6m-muted transition-transform ${isOpen ? 'rotate-90' : ''}`}>
            ›
          </span>
        </span>
      </button>
      {isOpen ? <div className="px-[14px] pb-[14px]">{children}</div> : null}
    </div>
  );
}
