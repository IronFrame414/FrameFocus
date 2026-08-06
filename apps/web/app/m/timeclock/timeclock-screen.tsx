'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionWithSegments, TimeSegment } from '@/lib/services/time-tracking';
import {
  clockIn,
  clockOut,
  getMyRecentProjectIds,
  type SegmentType,
} from '@/lib/services/time-tracking-client';
import { useOfflineSync, type OfflineSyncApi } from '../offline-sync';
import { buildClockInEntries, buildClockOutEntries } from '@/lib/offline/capture';
import type { QueueEntry } from '@/lib/offline/queue';
import { SetMobileHeader } from '../mobile-header';
import { captureGps } from './capture-gps';

// M6M §4.5 / §4.5a / §4.12.1 — the 7a interaction, exactly as D-27 shapes it.
//
// ---------------------------------------------------------------------------
// THE TYPE IS A REQUIRED CHOICE. NO DEFAULT, NO PRESELECTION (D-27, A-7b/A-7b2).
// ---------------------------------------------------------------------------
// `type` starts null and nothing sets it but a tap. The six options are the six
// members of time_segments_type_check — a seventh option, or a missing one, is
// a constraint violation waiting to happen.
//
// THE CHECK PARTITIONS THREE-AND-THREE, NOT WORK-VS-NOT-WORK. work,
// material_run and warranty REQUIRE a project; travel, shop and break FORBID
// one. §4.5a flags the trap verbatim: a build that treats "not work" as "no
// project" violates the constraint on two types. PROJECT_TYPES below is the
// authority for this file, and the project block is ABSENT — not disabled —
// for the other three (A-7c2): a greyed control invites a tap that can never
// succeed and implies a choice the constraint forbids.
//
// WHAT THIS SCREEN DELIBERATELY DOES NOT SHOW:
//   · No OT week line (D-35, A-7m) — companies.ot_threshold_hours exists and is
//     deliberately not surfaced; the figure is unstable under week re-bucketing
//     (#92) in a way only the setting's owner can interpret.
//   · No location notice (D-41, A-7n) — no banner, no caption under the button.
//   · No GPS opt-out (D-34 rule 1, A-7k4) — no setting, toggle or skip.
//   · No task picker — clock-in writes task_id NULL for every type (A-7e);
//     task attach is M-20's.
//   · No switch control acting in place — §4.5a: "7a gains no switch control".
//     The amber control NAVIGATES to M-20 (A-7j).

const ALL_TYPES: { id: SegmentType; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'material_run', label: 'Material run' },
  { id: 'warranty', label: 'Warranty' },
  { id: 'travel', label: 'Travel' },
  { id: 'shop', label: 'Shop' },
  { id: 'break', label: 'Break' },
];

/** The three types whose rows must carry a project — from the CHECK, verbatim. */
export const PROJECT_TYPES: ReadonlySet<SegmentType> = new Set(['work', 'material_run', 'warranty']);

export type PickerProject = { id: string; name: string; project_number: string };

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ALL_TYPES.map((t) => [t.id, t.label])
);

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function elapsed(fromIso: string, now: number): string {
  const ms = Math.max(0, now - new Date(fromIso).getTime());
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function TimeclockScreen({
  openSession,
  projects,
  todaySegments,
  isOwner,
}: {
  openSession: SessionWithSegments | null;
  projects: PickerProject[];
  todaySegments: TimeSegment[];
  /**
   * The role rides from the server so an OFFLINE clock-in can queue the right
   * approval status without an rpc it cannot make: owner sessions carry NO
   * approval state (6A §8), everyone else defaults to 'pending'.
   */
  isOwner: boolean;
}) {
  const router = useRouter();
  const offlineSync = useOfflineSync();
  const entries = offlineSync?.entries;
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  // §5 — THE QUEUE IS THE SHADOW OF UNSYNCED TRUTH. A shift clocked in offline
  // does not exist server-side, so `openSession` is null and the server props
  // would show "Not clocked in" — an invitation to a double clock-in that
  // §5.5.2's partial unique index will bounce on sync. Derive the queued open
  // shift from the queue itself (it survives reloads via IndexedDB): a queued
  // session INSERT with no queued clock-out UPDATE against the same target_id.
  // The insert's own payload never carries clock_out — the queue's fold rule
  // forbids it (§5.5.1) — so the clock-out is always its own update entry.
  const queuedShift = useMemo(() => {
    const list = entries ?? [];
    const sessionInsert = list.find(
      (e) =>
        e.entity === 'time_clock_session' &&
        e.op === 'insert' &&
        e.state === 'queued' &&
        !list.some(
          (u) => u.target_id === e.target_id && u.op === 'update' && 'clock_out' in u.payload
        )
    );
    if (!sessionInsert) return null;
    const segmentInsert =
      list.find(
        (e) =>
          e.entity === 'time_segment' &&
          e.state === 'queued' &&
          e.payload.session_id === sessionInsert.target_id
      ) ?? null;
    return { sessionInsert, segmentInsert };
  }, [entries]);

  // When the queued shift drains (reconnect sync landed it), the server now
  // holds the open session the props don't know about — refresh so the screen
  // doesn't show "Not clocked in" against a live session.
  const hadQueuedShift = useRef(false);
  useEffect(() => {
    if (queuedShift) {
      hadQueuedShift.current = true;
    } else if (hadQueuedShift.current && !openSession) {
      hadQueuedShift.current = false;
      router.refresh();
    }
  }, [queuedShift, openSession, router]);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Timeclock" sub={today} />
      {openSession ? (
        <OnTheClock session={openSession} projects={projects} offlineSync={offlineSync} />
      ) : queuedShift ? (
        <QueuedOnTheClock
          sessionInsert={queuedShift.sessionInsert}
          segmentInsert={queuedShift.segmentInsert}
          projects={projects}
          offlineSync={offlineSync}
        />
      ) : (
        <ClockInForm projects={projects} isOwner={isOwner} offlineSync={offlineSync} />
      )}
      <TodaySegments segments={todaySegments} />
    </div>
  );
}

// ===========================================================================
// CLOCKED OUT — the D-27 interaction: pick a type → pick a project where that
// type allows one → Clock in.
// ===========================================================================
function ClockInForm({
  projects,
  isOwner,
  offlineSync,
}: {
  projects: PickerProject[];
  isOwner: boolean;
  offlineSync: OfflineSyncApi | null;
}) {
  const router = useRouter();
  const [type, setType] = useState<SegmentType | null>(null); // NO DEFAULT
  const [projectId, setProjectId] = useState<string | null>(null); // NO PRESELECTION
  const [recent, setRecent] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D-44 — the recently-used order, from the named service function (A-7l3).
  useEffect(() => {
    let cancelled = false;
    getMyRecentProjectIds().then((ids) => {
      if (!cancelled) setRecent(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recently-used first (most recent first), then never-worked, alphabetical
  // by name — D-44's total order (A-7l2). Order only; selection stays empty.
  const ordered = useMemo(() => {
    const rank = new Map((recent ?? []).map((id, i) => [id, i]));
    return [...projects].sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      if (ra !== undefined && rb !== undefined) return ra - rb;
      if (ra !== undefined) return -1;
      if (rb !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [projects, recent]);

  const needsProject = type !== null && PROJECT_TYPES.has(type);
  const ready = type !== null && (!needsProject || projectId !== null);

  async function submit() {
    if (!ready || type === null) return;
    setBusy(true);
    setError(null);

    // D-34 — ALWAYS requested, NEVER blocking. captureGps() resolves to a fix
    // or to a failure record; either way the clock-in proceeds with it.
    // (GPS is hardware, not network — it works offline too.)
    const gps = await captureGps();

    const chosen = needsProject ? projectId : null;

    // §5.5.1 — OFFLINE, the clock-in queues as two entries: the session insert
    // and the first segment insert gated on it (A-7i). captured_at is the
    // business timestamp (§5.2.1) — a 6:58 clock-in synced at 11:20 is a 6:58
    // clock-in. No redirect: the hub is a server render the network can't
    // serve; the parent re-renders into the queued on-the-clock view instead.
    if (!navigator.onLine && offlineSync) {
      const captured_at = new Date().toISOString();
      const queued = buildClockInEntries({
        sessionEntryId: crypto.randomUUID(),
        segmentEntryId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        segmentId: crypto.randomUUID(),
        first_segment: { segment_type: type, project_id: chosen },
        gps_in: gps,
        captured_at,
        status: isOwner ? null : 'pending',
      });
      for (const entry of queued) await offlineSync.enqueue(entry);
      setBusy(false);
      return;
    }

    const result = await clockIn({
      first_segment: { segment_type: type, project_id: chosen },
      gps_in: gps,
    });

    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Clock-in failed.');
      return;
    }

    // D-12 as restated by §4.5a — THE REDIRECT FOLLOWS THE TYPE (A-7f).
    // A project type lands on that project's hub. A projectless type has no
    // project to navigate to; D-12 said "the dashboard", but D-38 [S100] cut
    // /m/dashboard from v1 — so the projectless landing is this screen's own
    // on-the-clock state. Flagged in the slice report as a D-12/D-38 collision
    // resolved in D-38's favour.
    if (chosen) {
      router.push(`/m/p/${chosen}`);
    }
    router.refresh();
  }

  return (
    <div>
      <p
        data-testid="m-clock-status"
        className="text-center font-mono text-[13px] font-medium uppercase tracking-wide text-m6m-muted"
      >
        Not clocked in
      </p>
      <p className="mt-[4px] text-center font-mono text-[52px] font-semibold leading-none text-m6m-navy">
        0:00
      </p>

      {/* ----------------------------------------------------------------- */}
      {/* THE TYPE ROW — required, six options, none preselected.            */}
      {/* ----------------------------------------------------------------- */}
      <h2 className="mb-[8px] mt-[18px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
        SEGMENT TYPE
      </h2>
      <div data-testid="m-type-grid" className="grid grid-cols-3 gap-[8px]">
        {ALL_TYPES.map((t) => {
          const on = type === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`m-type-${t.id}`}
              data-active={on ? 'true' : 'false'}
              aria-pressed={on}
              onClick={() => {
                setType(t.id);
                // A projectless type DROPS any chosen project rather than
                // carrying it into a row the constraint forbids (A-7c3's
                // context-carry-over trap).
                if (!PROJECT_TYPES.has(t.id)) setProjectId(null);
              }}
              className={`flex min-h-[58px] items-center justify-center rounded-[12px] px-[6px] text-[14px] font-semibold ${
                on
                  ? 'border-[1.5px] border-m6m-blue bg-[#f5f7ff] text-m6m-blue'
                  : 'border border-m6m-border bg-m6m-card text-m6m-navy'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* THE PROJECT BLOCK — present AND required for work/material_run/    */}
      {/* warranty; ABSENT for travel/shop/break. Not disabled: absent.      */}
      {/* ----------------------------------------------------------------- */}
      {needsProject ? (
        <section data-testid="m-project-block">
          <h2 className="mb-[8px] mt-[18px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
            PROJECT
          </h2>
          <ul className="overflow-hidden rounded-[14px] border border-m6m-border bg-m6m-card">
            {ordered.map((p) => {
              const on = projectId === p.id;
              return (
                <li key={p.id} className="border-b border-m6m-border last:border-b-0">
                  <button
                    type="button"
                    data-testid="m-clock-project"
                    data-project-id={p.id}
                    data-active={on ? 'true' : 'false'}
                    aria-pressed={on}
                    onClick={() => setProjectId(p.id)}
                    className={`flex min-h-[58px] w-full items-center gap-[10px] px-[14px] text-left ${
                      on ? 'border-l-[3px] border-m6m-blue bg-[#f5f7ff]' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[15px] font-bold leading-tight ${
                          on ? 'text-m6m-blue' : 'text-m6m-navy'
                        }`}
                      >
                        {p.name}
                      </span>
                      <span className="mt-[2px] block font-mono text-[11px] text-m6m-muted">
                        {p.project_number}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {error ? (
        <p
          data-testid="m-clock-error"
          role="alert"
          className="mt-[12px] rounded-[10px] border border-m6m-danger-border bg-[#fdf1f0] px-[12px] py-[8px] text-[14px] text-m6m-danger"
        >
          {error}
        </p>
      ) : null}

      {/* Enabled once the type, and any project the type requires, are set. */}
      <button
        type="button"
        data-testid="m-clock-in"
        disabled={!ready || busy}
        onClick={submit}
        className="mt-[18px] flex h-[60px] w-full items-center justify-center rounded-[14px] bg-m6m-amber text-[17px] font-bold text-m6m-navy transition-transform duration-150 ease-out active:scale-[.99] disabled:opacity-40"
      >
        {busy ? 'Clocking in…' : 'Clock in'}
      </button>
    </div>
  );
}

// ===========================================================================
// ON THE CLOCK — live elapsed, current segment, switch (navigates), clock out.
// ===========================================================================
function OnTheClock({
  session,
  projects,
  offlineSync,
}: {
  session: SessionWithSegments;
  projects: PickerProject[];
  offlineSync: OfflineSyncApi | null;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // An offline clock-out of THIS server-loaded session sits in the queue as an
  // update carrying clock_out. Derived from the queue, not local state, so it
  // survives a reload — while it exists the session is over in fact and the
  // clock-out controls stay hidden even though the server row is still open.
  const queuedClockOut = (offlineSync?.entries ?? []).some(
    (e) =>
      e.target_id === session.id &&
      e.op === 'update' &&
      e.state === 'queued' &&
      'clock_out' in e.payload
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const openSegment =
    session.segments.find((s) => s.segment_end === null && !s.is_deleted) ?? null;
  const project = openSegment?.project_id
    ? (projects.find((p) => p.id === openSegment.project_id) ?? null)
    : null;

  // §4.5a's table: ending any segment except `break` requires a note —
  // time_segments_note_on_end_check is DB-enforced (A-7h), so the field is a
  // hard requirement of clock-out, not a nicety.
  const noteRequired = openSegment !== null && openSegment.segment_type !== 'break';

  async function submitClockOut() {
    if (!openSegment) return;
    if (noteRequired && !note.trim()) return;
    setBusy(true);
    setError(null);

    // D-34 applies to clock-OUT the same as clock-in.
    const gps = await captureGps();

    // §5.5.1 / §5.6 — OFFLINE, the clock-out of a server-loaded shift queues
    // as two updates: segment end, and the session's clock_out. Their
    // `base_updated_at` is each row's updated_at AS LOADED (§5.2.2 — captured
    // on the read path, straight off the server props): if a desktop edit
    // lands on either row before this replays, §5.6 must see a basis to
    // conflict on, not a null.
    if (!navigator.onLine && offlineSync) {
      const captured_at = new Date().toISOString();
      const queued = buildClockOutEntries({
        segmentEntryId: crypto.randomUUID(),
        sessionUpdateEntryId: crypto.randomUUID(),
        sessionId: session.id,
        segmentId: openSegment.id,
        end: {
          segment_id: openSegment.id,
          segment_type: openSegment.segment_type,
          task_id: openSegment.task_id,
          note: noteRequired ? note.trim() : null,
        },
        gps_out: gps,
        captured_at,
        sessionInsertEntryId: null, // the session is already on the server
        base_session_updated_at: session.updated_at,
        base_segment_updated_at: openSegment.updated_at,
      });
      for (const entry of queued) await offlineSync.enqueue(entry);
      setBusy(false);
      setConfirming(false);
      setNote('');
      return;
    }

    const result = await clockOut({
      session_id: session.id,
      end: {
        segment_id: openSegment.id,
        segment_type: openSegment.segment_type,
        task_id: openSegment.task_id,
        note: noteRequired ? note.trim() : null,
      },
      gps_out: gps,
    });

    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Clock-out failed.');
      return;
    }
    setConfirming(false);
    setNote('');
    router.refresh();
  }

  return (
    <div>
      <p
        data-testid="m-clock-status"
        className="text-center font-mono text-[13px] font-medium uppercase tracking-wide text-m6m-blue"
      >
        On the clock
      </p>
      <p
        data-testid="m-clock-elapsed"
        className="mt-[4px] text-center font-mono text-[52px] font-semibold leading-none text-m6m-navy"
      >
        {elapsed(session.clock_in, now)}
      </p>

      {/* The state card: project, live segment type, since-when. */}
      <div
        data-testid="m-state-card"
        className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card p-[15px]"
      >
        <p className="text-[16px] font-bold leading-tight text-m6m-navy">
          {project ? project.name : TYPE_LABEL[openSegment?.segment_type ?? ''] ?? 'On the clock'}
        </p>
        <p className="mt-[3px] font-mono text-[12px] text-m6m-muted">
          {openSegment
            ? `${TYPE_LABEL[openSegment.segment_type]} · since ${hhmm(openSegment.segment_start)}`
            : 'Segment chain already ended'}
        </p>
      </div>

      {/* §4.12.1 — the amber switch control NAVIGATES to M-20; it acts nowhere
          in place (§4.5a: "7a gains no switch control"). */}
      <Link
        href="/m/timeclock/switch"
        data-testid="m-switch-link"
        className="mt-[12px] flex min-h-[52px] w-full items-center justify-center rounded-[14px] border border-m6m-amber text-[15px] font-bold text-m6m-amber"
      >
        Switch task or project
      </Link>

      {queuedClockOut ? (
        <p
          data-testid="m-clock-out-queued"
          className="mt-[12px] rounded-[10px] border border-m6m-border bg-m6m-strip-bg px-[12px] py-[10px] text-[14px] font-semibold text-m6m-navy"
        >
          Clock-out saved offline — it will sync when you&apos;re back online.
        </p>
      ) : null}

      {confirming && !queuedClockOut ? (
        <div
          data-testid="m-clock-out-confirm"
          className="mt-[12px] rounded-[14px] border border-m6m-border bg-m6m-card p-[14px]"
        >
          {noteRequired ? (
            <>
              <label
                htmlFor="m-clock-out-note"
                className="mb-[6px] block text-[14px] font-semibold text-m6m-navy"
              >
                What did you work on? <span className="text-m6m-danger">(required)</span>
              </label>
              <textarea
                id="m-clock-out-note"
                data-testid="m-clock-out-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px] text-m6m-navy"
              />
            </>
          ) : null}
          <button
            type="button"
            data-testid="m-clock-out-go"
            disabled={busy || (noteRequired && !note.trim())}
            onClick={submitClockOut}
            className="mt-[10px] flex h-[52px] w-full items-center justify-center rounded-[12px] bg-m6m-danger text-[15px] font-bold text-white disabled:opacity-40"
          >
            {busy ? 'Clocking out…' : 'Confirm clock out'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p
          data-testid="m-clock-error"
          role="alert"
          className="mt-[12px] rounded-[10px] border border-m6m-danger-border bg-[#fdf1f0] px-[12px] py-[8px] text-[14px] text-m6m-danger"
        >
          {error}
        </p>
      ) : null}

      {!confirming && !queuedClockOut ? (
        <button
          type="button"
          data-testid="m-clock-out"
          onClick={() => setConfirming(true)}
          className="mt-[12px] flex h-[60px] w-full items-center justify-center rounded-[14px] bg-m6m-danger text-[17px] font-bold text-white"
        >
          Clock out
        </button>
      ) : null}
    </div>
  );
}

// ===========================================================================
// QUEUED ON THE CLOCK — the shift exists only in the queue (§5.5.1's fully-
// offline shift). Rendered off the queued entries' payloads: the session
// insert carries clock_in, the segment insert carries type and project.
// Clock-out here enqueues the segment-end update (which coalesces into the
// segment's still-queued insert) and the session's clock-out update, gated by
// depends_on on the session insert — A-16c's three-entries-two-rows shape.
// No switch control: M-20 is a server render an offline shift cannot reach.
// ===========================================================================
function QueuedOnTheClock({
  sessionInsert,
  segmentInsert,
  projects,
  offlineSync,
}: {
  sessionInsert: QueueEntry;
  segmentInsert: QueueEntry | null;
  projects: PickerProject[];
  offlineSync: OfflineSyncApi | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const clockIn = sessionInsert.payload.clock_in as string;
  const segmentType = (segmentInsert?.payload.segment_type ?? null) as SegmentType | null;
  const projectId = (segmentInsert?.payload.project_id ?? null) as string | null;
  const project = projectId ? (projects.find((p) => p.id === projectId) ?? null) : null;
  const noteRequired = segmentType !== null && segmentType !== 'break';

  async function submitClockOut() {
    if (!segmentInsert || !offlineSync) return;
    if (noteRequired && !note.trim()) return;
    setBusy(true);

    // D-34 applies here too — a fix or a failure record, never a block.
    const gps = await captureGps();

    const captured_at = new Date().toISOString();
    const queued = buildClockOutEntries({
      segmentEntryId: crypto.randomUUID(),
      sessionUpdateEntryId: crypto.randomUUID(),
      sessionId: sessionInsert.target_id,
      segmentId: segmentInsert.target_id,
      end: {
        segment_id: segmentInsert.target_id,
        segment_type: segmentType as SegmentType,
        task_id: null,
        note: noteRequired ? note.trim() : null,
      },
      gps_out: gps,
      captured_at,
      // The session never came from the server: gate on its queued insert,
      // with a null base. The engine re-bases after the insert replays, so
      // §5.6's comparison asks a question that has an answer.
      sessionInsertEntryId: sessionInsert.entry_id,
      base_session_updated_at: null,
      base_segment_updated_at: null,
    });
    for (const entry of queued) await offlineSync.enqueue(entry);
    setBusy(false);
    // The parent's queuedShift derivation sees the clock-out update and falls
    // back to the clock-in form.
  }

  return (
    <div>
      <p
        data-testid="m-clock-status"
        className="text-center font-mono text-[13px] font-medium uppercase tracking-wide text-m6m-blue"
      >
        On the clock
      </p>
      <p
        data-testid="m-clock-elapsed"
        className="mt-[4px] text-center font-mono text-[52px] font-semibold leading-none text-m6m-navy"
      >
        {elapsed(clockIn, now)}
      </p>

      <div
        data-testid="m-state-card"
        className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card p-[15px]"
      >
        <p className="text-[16px] font-bold leading-tight text-m6m-navy">
          {project ? project.name : (TYPE_LABEL[segmentType ?? ''] ?? 'On the clock')}
        </p>
        <p className="mt-[3px] font-mono text-[12px] text-m6m-muted">
          {segmentType ? `${TYPE_LABEL[segmentType]} · since ${hhmm(clockIn)}` : `since ${hhmm(clockIn)}`}
        </p>
        <p
          data-testid="m-queued-shift-note"
          className="mt-[6px] font-mono text-[11px] font-semibold text-m6m-muted"
        >
          Saved offline — waiting to sync
        </p>
      </div>

      {confirming ? (
        <div
          data-testid="m-clock-out-confirm"
          className="mt-[12px] rounded-[14px] border border-m6m-border bg-m6m-card p-[14px]"
        >
          {noteRequired ? (
            <>
              <label
                htmlFor="m-clock-out-note"
                className="mb-[6px] block text-[14px] font-semibold text-m6m-navy"
              >
                What did you work on? <span className="text-m6m-danger">(required)</span>
              </label>
              <textarea
                id="m-clock-out-note"
                data-testid="m-clock-out-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px] text-m6m-navy"
              />
            </>
          ) : null}
          <button
            type="button"
            data-testid="m-clock-out-go"
            disabled={busy || (noteRequired && !note.trim())}
            onClick={submitClockOut}
            className="mt-[10px] flex h-[52px] w-full items-center justify-center rounded-[12px] bg-m6m-danger text-[15px] font-bold text-white disabled:opacity-40"
          >
            {busy ? 'Clocking out…' : 'Confirm clock out'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="m-clock-out"
          onClick={() => setConfirming(true)}
          className="mt-[12px] flex h-[60px] w-full items-center justify-center rounded-[14px] bg-m6m-danger text-[17px] font-bold text-white"
        >
          Clock out
        </button>
      )}
    </div>
  );
}

/** §4.5 — today's segments as 58px rows: type, mono start–end, mono duration. */
function TodaySegments({ segments }: { segments: TimeSegment[] }) {
  if (segments.length === 0) return null;
  return (
    <section className="mt-[20px]">
      <h2 className="mb-[8px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
        TODAY
      </h2>
      <ul className="rounded-[14px] border border-m6m-border bg-m6m-card px-[12px]">
        {segments.map((s) => {
          const mins = s.segment_end
            ? Math.round(
                (new Date(s.segment_end).getTime() - new Date(s.segment_start).getTime()) / 60000
              )
            : null;
          return (
            <li
              key={s.id}
              data-testid="m-today-segment"
              className="flex min-h-[58px] items-center gap-[10px] border-b border-m6m-border py-[8px] last:border-b-0"
            >
              <span className="min-w-0 flex-1 text-[15px] font-semibold text-m6m-navy">
                {TYPE_LABEL[s.segment_type] ?? s.segment_type}
              </span>
              <span className="font-mono text-[12px] text-m6m-muted">
                {hhmm(s.segment_start)}–{s.segment_end ? hhmm(s.segment_end) : 'now'}
              </span>
              <span className="w-[52px] text-right font-mono text-[12px] font-semibold text-m6m-navy">
                {mins !== null ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}` : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
