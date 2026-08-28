'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SessionWithSegments, TimeSegment } from '@/lib/services/time-tracking';
import {
  listPickerTasks,
  switchSegment,
  type PickerTask,
  type SegmentType,
} from '@/lib/services/time-tracking-client';
import { SetMobileHeader } from '../../mobile-header';
import { PROJECT_TYPES, type PickerProject } from '../timeclock-screen';

// M6M §4.12.2 — the 7b interaction, honouring all three §4.5a constraints:
//
//   1. CLOSE-AND-OPEN, NEVER EDIT IN PLACE (A-7j2). The submit is
//      switchSegment(), which ends the open segment and INSERTS the next one.
//      No path here issues an UPDATE against an ended segment —
//      time_segments_update_authorized refuses that for a crew member, so a
//      build that tried would not degrade, it would throw.
//   2. ALL SIX TYPES, THREE-AND-THREE (A-7j3). The handoff's 2×2 grid drew
//      four; §4.5a's table is the authority. material_run and warranty are
//      here, and they REQUIRE a project exactly as work does — the handoff's
//      "Break / Travel / Shop take no project" implied work-vs-not-work, which
//      violates the constraint on two types.
//   3. THE NOTE RULE (A-7j4). Closing any segment except `break` requires a
//      note — time_segments_note_on_end_check is DB-enforced, so without this
//      field the switch throws on every non-break segment.
//
// Adopted as drawn: the day timeline bar (derived from the session's own
// segments; no new data), the "Ends '…' at HH:MM" header, and the
// "Mark '<task>' complete" row — the ONLY surface that may write `completion`,
// and only on a `work` segment carrying a `task_id`.

const ALL_TYPES: { id: SegmentType; label: string }[] = [
  { id: 'work', label: 'Work' },
  { id: 'material_run', label: 'Material run' },
  { id: 'warranty', label: 'Warranty' },
  { id: 'travel', label: 'Travel' },
  { id: 'shop', label: 'Shop' },
  { id: 'break', label: 'Break' },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  ALL_TYPES.map((t) => [t.id, t.label])
);

/** Timeline fill per type — work-family blue, break grey, travel/shop amber. */
function barColor(type: string): string {
  if (type === 'break') return '#8a919c';
  if (type === 'travel' || type === 'shop') return '#f59e0b';
  return '#3b4ae0';
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function SwitchScreen({
  session,
  openSegment,
  projects,
}: {
  session: SessionWithSegments;
  openSegment: TimeSegment;
  projects: PickerProject[];
}) {
  const router = useRouter();

  const [nextType, setNextType] = useState<SegmentType | null>(null); // no default
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<PickerTask[]>([]);
  const [note, setNote] = useState('');
  const [markComplete, setMarkComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closingLabel = TYPE_LABEL[openSegment.segment_type] ?? openSegment.segment_type;
  // A-7j4 / A-7h — the note is for the segment being CLOSED, so the exemption
  // keys on the CLOSING segment's type, not the next one's.
  const noteRequired = openSegment.segment_type !== 'break';
  const needsProject = nextType !== null && PROJECT_TYPES.has(nextType);
  // Only `work` may carry a task (time_segments_task_gate_check).
  const mayPickTask = nextType === 'work' && projectId !== null;
  // The completion row: only when the CLOSING segment is work-on-task.
  const offerComplete = openSegment.segment_type === 'work' && openSegment.task_id !== null;

  useEffect(() => {
    if (!mayPickTask || !projectId) {
      setTasks([]);
      setTaskId(null);
      return;
    }
    let cancelled = false;
    listPickerTasks(projectId).then((t) => {
      if (!cancelled) setTasks(t);
    });
    return () => {
      cancelled = true;
    };
  }, [mayPickTask, projectId]);

  const ready =
    nextType !== null && (!needsProject || projectId !== null) && (!noteRequired || note.trim());

  async function submit() {
    if (!ready || nextType === null) return;
    setBusy(true);
    setError(null);

    const result = await switchSegment({
      end: {
        segment_id: openSegment.id,
        segment_type: openSegment.segment_type,
        task_id: openSegment.task_id,
        note: noteRequired ? note.trim() : null,
        completion: offerComplete && markComplete ? 'complete' : null,
      },
      next: {
        segment_type: nextType,
        project_id: needsProject ? projectId : null,
        task_id: mayPickTask ? taskId : null,
      },
    });

    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Switch failed.');
      return;
    }
    router.push('/m/timeclock');
    router.refresh();
  }

  const nowLabel = hhmm(new Date().toISOString());
  const segments = session.segments.filter((s) => !s.is_deleted);
  const dayStart = new Date(session.clock_in).getTime();
  const now = Date.now();
  const span = Math.max(now - dayStart, 60_000);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Switch segment" sub={`Ends ${closingLabel} at ${nowLabel}`} />

      {/* The day timeline bar — proportional widths of what is already logged,
          derived from the session's own segments. The crew sees their day
          before changing it. */}
      <div
        data-testid="m-day-timeline"
        className="flex h-[9px] w-full gap-[1px] overflow-hidden rounded-full bg-m6m-border"
      >
        {segments.map((s) => {
          const start = new Date(s.segment_start).getTime();
          const end = s.segment_end ? new Date(s.segment_end).getTime() : now;
          const width = Math.max(((end - start) / span) * 100, 1);
          return (
            <span
              key={s.id}
              style={{ width: `${width}%`, backgroundColor: barColor(s.segment_type) }}
            />
          );
        })}
      </div>
      <p className="mt-[4px] flex justify-between font-mono text-[11px] text-m6m-muted">
        <span>{hhmm(session.clock_in)}</span>
        <span>now {nowLabel}</span>
      </p>

      {/* ----------------------------------------------------------------- */}
      {/* CLOSING — the note the DB demands (A-7j4).                         */}
      {/* ----------------------------------------------------------------- */}
      <section className="mt-[16px] rounded-[15px] border border-m6m-border bg-m6m-card p-[15px]">
        <p className="text-[15px] font-bold text-m6m-navy">
          Ending: {closingLabel}
          <span className="ml-[6px] font-mono text-[12px] font-normal text-m6m-muted">
            since {hhmm(openSegment.segment_start)}
          </span>
        </p>

        {noteRequired ? (
          <>
            <label
              htmlFor="m-switch-note"
              className="mb-[4px] mt-[10px] block text-[14px] font-semibold text-m6m-navy"
            >
              What did you work on? <span className="text-m6m-danger">(required)</span>
            </label>
            <textarea
              id="m-switch-note"
              data-testid="m-switch-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-[10px] border border-m6m-border px-[12px] py-[8px] text-[15px] text-m6m-navy"
            />
          </>
        ) : (
          <p data-testid="m-switch-no-note" className="mt-[6px] font-mono text-[12px] text-m6m-muted">
            No note needed for a break.
          </p>
        )}

        {offerComplete ? (
          <label
            data-testid="m-mark-complete"
            className="mt-[10px] flex min-h-[44px] items-center gap-[10px] text-[15px] font-semibold text-m6m-navy"
          >
            <input
              type="checkbox"
              checked={markComplete}
              onChange={(e) => setMarkComplete(e.target.checked)}
              className="h-[22px] w-[22px]"
            />
            Mark the task complete
          </label>
        ) : null}
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* WHAT'S NEXT — six types (A-7j3), three-and-three project rule.     */}
      {/* ----------------------------------------------------------------- */}
      <h2 className="mb-[8px] mt-[18px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
        WHAT&apos;S NEXT
      </h2>
      <div data-testid="m-next-type-grid" className="grid grid-cols-3 gap-[8px]">
        {ALL_TYPES.map((t) => {
          const on = nextType === t.id;
          return (
            <button
              key={t.id}
              type="button"
              data-testid={`m-next-type-${t.id}`}
              data-active={on ? 'true' : 'false'}
              aria-pressed={on}
              onClick={() => {
                setNextType(t.id);
                if (!PROJECT_TYPES.has(t.id)) {
                  setProjectId(null);
                  setTaskId(null);
                }
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

      {/* Project block: present and required for the three project types,
          ABSENT — not disabled — for the other three (A-7g). */}
      {needsProject ? (
        <section data-testid="m-next-project-block">
          <h2 className="mb-[8px] mt-[16px] font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
            PROJECT
          </h2>
          <ul className="overflow-hidden rounded-[14px] border border-m6m-border bg-m6m-card">
            {projects.map((p) => {
              const on = projectId === p.id;
              return (
                <li key={p.id} className="border-b border-m6m-border last:border-b-0">
                  <button
                    type="button"
                    data-testid="m-next-project"
                    data-project-id={p.id}
                    data-active={on ? 'true' : 'false'}
                    onClick={() => setProjectId(p.id)}
                    className={`flex min-h-[58px] w-full items-center px-[14px] text-left ${
                      on ? 'border-l-[3px] border-m6m-blue bg-[#f5f7ff]' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[15px] font-bold ${on ? 'text-m6m-blue' : 'text-m6m-navy'}`}
                      >
                        {p.name}
                      </span>
                      <span className="block font-mono text-[11px] text-m6m-muted">
                        {p.project_number}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {mayPickTask && tasks.length > 0 ? (
            <div className="mt-[10px]">
              <label
                htmlFor="m-next-task"
                className="mb-[4px] block font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted"
              >
                TASK (OPTIONAL)
              </label>
              <select
                id="m-next-task"
                data-testid="m-next-task"
                value={taskId ?? ''}
                onChange={(e) => setTaskId(e.target.value || null)}
                className="h-[48px] w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] text-[15px] text-m6m-navy"
              >
                <option value="">No task</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p
          data-testid="m-switch-error"
          role="alert"
          className="mt-[12px] rounded-[10px] border border-m6m-danger-border bg-[#fdf1f0] px-[12px] py-[8px] text-[14px] text-m6m-danger"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="m-start-segment"
        disabled={!ready || busy}
        onClick={submit}
        className="mt-[16px] flex h-[60px] w-full items-center justify-center rounded-[14px] bg-m6m-amber text-[17px] font-bold text-m6m-navy disabled:opacity-40"
      >
        {busy ? 'Switching…' : 'Start segment'}
      </button>

      {/* ⚠️ THE CAPTURE SCREEN'S OWN EXIT [S121].
          §4.12's rule is that a capture screen owns its chrome and its exits,
          which is why `CAPTURE_SCREENS` in mobile-shell.tsx withholds the back
          chevron here. **It owned neither.** Before submitting there was no way
          off this screen at all: no chevron by that rule, no cancel in the form,
          and a standalone-display PWA has no browser back gesture — the same
          class of defect 295c6b5 fixed for the detail views, on a screen that
          ruling did not cover.
          Surveyed before fixing: `/m/capture` already carries Back and Discard
          (capture-screen.tsx), so the gap was exactly this screen and
          `/m/timeclock/switch`. Both are fixed; nothing else was missing one.
          `router.back()` and not a hard-coded route: this screen is reached from
          M-5's switch control, and returning somewhere the user did
          not come from is its own small defect. */}
      <button
        type="button"
        data-testid="m-switch-cancel"
        onClick={() => router.back()}
        className="mt-[10px] flex h-[52px] w-full items-center justify-center rounded-[14px] border border-m6m-border bg-m6m-card text-[15px] font-semibold text-m6m-navy"
      >
        Cancel
      </button>
    </div>
  );
}
