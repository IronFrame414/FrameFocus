'use client';

// S121 5-A — THE /m SCHEDULE: A ONE-DAY COLUMN. [RULED Josh, 2026-09-30]
//   "desktop and mobile. it is important that i can schedule staff while i am
//    on mobile. it is also important that they can see the details."
//   "for mobile scheduling, remove full month view. only do 1-2 view if it
//    makes sense. the calendar can be scrollable if needed."  (Q9: a day-column
//    view; Q10: ONE day only — the two-day toggle can come later; Q11/Q12: no
//    week, no Gantt on mobile.)
//
// ⚠️ THIS OVERTURNS M6M M-12, M-25 and D-24's list rulings (quoted, not
// deleted, in the S121 report and at each page). The 402px arithmetic: 402 −
// 2×16 gutters = 370px for ONE day — a full-width bar, a whole label. A month
// grid (~53px a column) is exactly the legibility failure M-12 named, and there
// is none here.
//
// ⚠️ NOT A SQUEEZED DESKTOP GRID. The bars are the same events, the same
// colours (scheduleColor, resolved server-side), the same sheet (ScheduleSheet)
// and the same move (moveCalendarEvent + lib/schedule/drag) as desktop —
// PARITY: one mechanism, a different layout.
//
// ⚠️ DRAG vs SCROLL ON A PHONE [5-E]. A plain swipe ALWAYS scrolls: bars carry
// no touch handlers until the user PRESSES AND HOLDS one (450ms). That puts the
// bar in MOVE MODE — three handles (start / move / end) with touch-action:none,
// so dragging them never scrolls the page, while everything else still does.
// Horizontal distance → whole days (56px a day). "Done" (or tapping another
// bar) leaves move mode. A resize past the other end CLAMPS at one day.
//
// RLS is unchanged: schedule_entries_select_scoped limits crew and subs to
// their OWN general entries; tasks and inspections stay project-scoped. No UI
// filter here disagrees with it (no ownMemberId — the M-25 reasoning stands).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/language-provider';
import type { CalendarEvent } from '@/lib/services/schedule';
import { moveCalendarEvent } from '@/lib/services/schedule-client';
import { useAlert, useConfirm } from '@/components/confirm/confirm-provider';
import { anyUntold, untoldNotice } from '@/lib/critical-path/notify-text';
import { addDays, applyDrag, type DragMode } from '@/lib/schedule/drag';
import { canAddToProjectFromSchedule, canSchedule } from '@/lib/schedule/authority';
import { ScheduleSheet, type ScheduleMember } from '@/components/schedule/schedule-sheet';
import type { MsgKey } from '@/lib/i18n/messages';

const PX_PER_DAY = 56;
const HOLD_MS = 450;

function dayLabel(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
function shortDay(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function DayView({
  events,
  today,
  locale,
  role,
  projects,
  members,
  fixedProjectId,
  sourceKey,
}: {
  events: CalendarEvent[];
  /** The company's today (YYYY-MM-DD) — the view opens on it. */
  today: string;
  locale: string;
  role: string | null;
  projects: { id: string; name: string }[];
  members: ScheduleMember[];
  fixedProjectId?: string | null;
  sourceKey: Record<CalendarEvent['source'], MsgKey>;
}) {
  const t = useT();
  const router = useRouter();
  const may = canSchedule(role);
  const [day, setDay] = useState(today);
  const [open, setOpen] = useState<string | null>(null); // expanded bar key
  const [moving, setMoving] = useState<string | null>(null); // bar key in move mode
  const [preview, setPreview] = useState<{ key: string; start: string; end: string; clamped: boolean } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A SAVED move shows at once and stays until fresh data arrives (the same
  // rule as the desktop calendar — no snap-back, no second drag from stale dates).
  const [overrides, setOverrides] = useState<Record<string, { start: string; end: string }>>({});
  useEffect(() => setOverrides({}), [events]);
  const current = useMemo(
    () =>
      events.map((e) => {
        const o = overrides[`${e.source}:${e.id}`];
        return o ? { ...e, start_date: o.start, end_date: o.end } : e;
      }),
    [events, overrides]
  );
  const drag = useRef<{ e: CalendarEvent; mode: DragMode; x0: number } | null>(null);

  const onDay = useMemo(
    () => current.filter((e) => e.start_date <= day && e.end_date >= day),
    [current, day]
  );
  // A task's bars are per person; the detail lists everyone on it.
  const namesByTask = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of events) {
      if (e.source !== 'task' || !e.member_name) continue;
      const list = m.get(e.id) ?? [];
      if (!list.includes(e.member_name)) list.push(e.member_name);
      m.set(e.id, list);
    }
    return m;
  }, [events]);

  const movable = (e: CalendarEvent) => may && (e.source === 'task' || e.source === 'general');

  function startHold(e: CalendarEvent) {
    if (!movable(e)) return;
    cancelHold();
    holdTimer.current = setTimeout(() => {
      setMoving(e.key);
      setOpen(null);
      setNote(null);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(15);
    }, HOLD_MS);
  }
  function cancelHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function handleDown(p: React.PointerEvent, e: CalendarEvent, mode: DragMode) {
    p.preventDefault();
    p.stopPropagation();
    (p.currentTarget as HTMLElement).setPointerCapture?.(p.pointerId);
    drag.current = { e, mode, x0: p.clientX };
    setPreview({ key: e.key, start: e.start_date, end: e.end_date, clamped: false });
  }
  const confirm = useConfirm();
  const alert = useAlert();
  function handleMove(p: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const delta = Math.round((p.clientX - d.x0) / PX_PER_DAY);
    const r = applyDrag({ start: d.e.start_date, end: d.e.end_date }, d.mode, delta);
    setPreview({ key: d.e.key, ...r });
  }
  async function handleUp() {
    const d = drag.current;
    drag.current = null;
    const p = preview;
    if (!d || !p || (p.start === d.e.start_date && p.end === d.e.end_date)) {
      setPreview(null);
      return;
    }
    // [S122 Part 4] A Critical Path task's move names its edit and asks first.
    const r = await moveCalendarEvent(d.e, p.start, p.end, (arg) =>
      confirm({ ...arg, title: t('sched.cp.title'), confirmLabel: t(arg.held ? 'sched.cp.submit' : 'sched.cp.save') })
    );
    if (r.cancelled) setNote(null);
    else if (!r.success) setNote(r.error ?? null);
    else {
      setOverrides((o) => ({ ...o, [`${d.e.source}:${d.e.id}`]: { start: p.start, end: p.end } }));
      setNote(p.clamped ? t('sched.day.clamped') : null);
      // [S122 Part 6] The same notice as desktop (lib/critical-path/notify-text), in the /m language.
      if (r.untold && anyUntold(r.untold)) {
        await alert(untoldNotice(r.untold, { title: t('sched.cp.untoldTitle'), body: t('sched.cp.untoldBody'), client: t('sched.cp.untoldClient') }));
      }
    }
    setPreview(null);
    router.refresh();
  }

  return (
    <div data-testid="m-day-view" data-day={day} className="pb-[8px]">
      {/* The day, and the way to the next one — no grid. */}
      <div className="sticky top-0 z-[1] -mx-[18px] flex items-center gap-[8px] border-b border-m6m-border bg-m6m-surface px-[18px] py-[10px]">
        <button
          type="button"
          data-testid="m-day-prev"
          aria-label={t('sched.day.prev')}
          onClick={() => setDay((d) => addDays(d, -1))}
          className="flex h-[44px] w-[44px] items-center justify-center rounded-[11px] border border-m6m-border bg-m6m-card text-[18px] text-m6m-navy"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p data-testid="m-day-label" className="truncate text-[17px] font-extrabold text-m6m-navy">
            {dayLabel(day, locale)}
          </p>
          {day !== today ? (
            <button
              type="button"
              data-testid="m-day-today"
              onClick={() => setDay(today)}
              className="text-[13px] font-bold text-m6m-blue underline"
            >
              {t('sched.day.today')}
            </button>
          ) : (
            <p className="font-mono text-[11px] text-m6m-muted">{t('sched.day.today')}</p>
          )}
        </div>
        <button
          type="button"
          data-testid="m-day-next"
          aria-label={t('sched.day.next')}
          onClick={() => setDay((d) => addDays(d, 1))}
          className="flex h-[44px] w-[44px] items-center justify-center rounded-[11px] border border-m6m-border bg-m6m-card text-[18px] text-m6m-navy"
        >
          ›
        </button>
      </div>

      {may ? (
        <div className="mt-[12px] flex items-center justify-between gap-[10px]">
          <p className="text-[12px] text-m6m-muted">{t('sched.day.holdToMove')}</p>
          <button
            type="button"
            data-testid="m-day-add"
            onClick={() => setSheet(true)}
            className="flex min-h-[44px] shrink-0 items-center rounded-[11px] bg-m6m-navy px-[14px] text-[15px] font-bold text-white"
          >
            {t('sched.day.add')}
          </button>
        </div>
      ) : null}

      {toast ? (
        <p data-testid="m-day-toast" role="status" className="mt-[10px] text-[14px] font-semibold text-[#15803d]">
          {toast}
        </p>
      ) : null}
      {note ? (
        <p data-testid="m-day-note" role="status" className="mt-[10px] text-[14px] text-[#8a5a12]">
          {note}
        </p>
      ) : null}

      {onDay.length === 0 ? (
        <p
          data-testid="m-empty"
          className="mt-[14px] rounded-[15px] border border-dashed border-m6m-border bg-m6m-card px-[16px] py-[22px] text-center text-[15px] text-m6m-muted"
        >
          {t('sched.day.empty')}
        </p>
      ) : (
        <ul className="mt-[12px] flex flex-col gap-[8px]">
          {onDay.map((e) => {
            const c = e.color ?? '#475569';
            const isMoving = moving === e.key;
            const pv = preview && preview.key === e.key ? preview : null;
            const start = pv?.start ?? e.start_date;
            const end = pv?.end ?? e.end_date;
            const expanded = open === e.key;
            const people = e.source === 'task' ? (namesByTask.get(e.id) ?? []) : e.member_name ? [e.member_name] : [];
            return (
              <li
                key={e.key}
                data-testid="m-event-row"
                data-key={e.key}
                data-start={start}
                data-end={end}
                className="overflow-hidden rounded-[13px] border border-m6m-border bg-m6m-card"
                style={{ ...(isMoving ? { borderColor: c } : {}), borderLeftWidth: '5px', borderLeftColor: c }}
              >
                <button
                  type="button"
                  data-testid="m-event-open"
                  onPointerDown={() => startHold(e)}
                  onPointerUp={cancelHold}
                  onPointerLeave={cancelHold}
                  onPointerCancel={cancelHold}
                  onContextMenu={(x) => movable(e) && x.preventDefault()}
                  onClick={() => {
                    if (moving) return;
                    setOpen(expanded ? null : e.key);
                  }}
                  className="block w-full px-[12px] py-[10px] text-left"
                >
                  <span className="flex items-center justify-between gap-[8px]">
                    <span className="min-w-0 flex-1">
                      {e.member_name ? (
                        <span className="block truncate text-[15px] font-extrabold" style={{ color: c }}>
                          {e.member_name}
                          {e.color_note ? ` · ${t('sched.day.noTrade')}` : ''}
                        </span>
                      ) : null}
                      <span className="block truncate text-[16px] font-bold leading-tight text-m6m-navy">{e.title}</span>
                    </span>
                    <span
                      data-testid="m-event-source"
                      className="shrink-0 font-mono text-[11px] font-semibold text-m6m-muted"
                    >
                      {t(sourceKey[e.source])}
                    </span>
                  </span>
                  {/* §2 — every date is mono; the range says where the bar
                      continues so a multi-day bar never looks like a one-day one. */}
                  <span className="mt-[3px] flex flex-wrap gap-x-[10px] font-mono text-[11px] text-m6m-muted">
                    <span>{start === end ? start : `${start} – ${end}`}</span>
                    {start < day ? <span>{t('sched.day.from', { day: shortDay(start, locale) })}</span> : null}
                    {end > day ? <span>{t('sched.day.until', { day: shortDay(end, locale) })}</span> : null}
                  </span>
                  {e.project_label ? (
                    <span className="mt-[2px] block truncate text-[13px] text-m6m-muted">{e.project_label}</span>
                  ) : null}
                </button>

                {/* Staff SEE THE DETAILS [RULED Josh]. */}
                {expanded ? (
                  <div data-testid="m-event-detail" className="border-t border-m6m-border px-[12px] py-[10px] text-[14px] text-m6m-navy">
                    <p className="font-mono text-[11px] text-m6m-muted">{t('sched.day.dates')}</p>
                    <p className="mb-[6px]">{e.start_date === e.end_date ? e.start_date : `${e.start_date} → ${e.end_date}`}</p>
                    {people.length > 0 ? (
                      <>
                        <p className="font-mono text-[11px] text-m6m-muted">{t('sched.day.people')}</p>
                        <p data-testid="m-event-people" className="mb-[6px]">
                          {people.join(', ')}
                        </p>
                      </>
                    ) : null}
                    {e.detail.notes ? (
                      <>
                        <p className="font-mono text-[11px] text-m6m-muted">{t('sched.day.notes')}</p>
                        <p className="whitespace-pre-wrap">{e.detail.notes}</p>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {/* MOVE MODE — only after press-and-hold; its handles are the
                    ONLY touch-action:none surfaces on the screen. */}
                {isMoving ? (
                  <div data-testid="m-event-move" className="border-t border-m6m-border px-[10px] py-[10px]">
                    <p className="mb-[8px] text-[12px] text-m6m-muted">{t('sched.day.moveHelp')}</p>
                    <div className="flex gap-[6px]" onPointerMove={handleMove} onPointerUp={() => void handleUp()}>
                      {(
                        [
                          ['resize-start', 'sched.day.moveStart', 'm-move-start'],
                          ['move', 'sched.day.moveAll', 'm-move-all'],
                          ['resize-end', 'sched.day.moveEnd', 'm-move-end'],
                        ] as const
                      ).map(([mode, key, id]) => (
                        <div
                          key={mode}
                          data-testid={id}
                          onPointerDown={(p) => handleDown(p, e, mode)}
                          style={{ touchAction: 'none' }}
                          className="flex min-h-[48px] flex-1 select-none items-center justify-center rounded-[10px] border border-m6m-border bg-m6m-surface text-[14px] font-bold text-m6m-navy"
                        >
                          {t(key)}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      data-testid="m-move-done"
                      onClick={() => setMoving(null)}
                      className="mt-[8px] min-h-[44px] w-full rounded-[10px] border border-m6m-border text-[15px] font-bold text-m6m-navy"
                    >
                      {t('sched.day.doneMoving')}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {sheet ? (
        <ScheduleSheet
          open
          onClose={() => setSheet(false)}
          dayKey={day}
          projects={projects}
          fixedProjectId={fixedProjectId}
          members={members}
          canAssignToProject={canAddToProjectFromSchedule(role)}
          onSaved={(m) => {
            setToast(m);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
