'use client';

// S122 Part 9 — THE PHONE BOARD: what is holding up the job right now.
//
//   · the running critical task, the next two behind it, and how many tasks
//     have room (holdingUp, packages/shared — the same engine answer the
//     desktop tab draws).
//   · ⚠️ NO GANTT at 402px [S121 Q12, RULED; spec Part 9].
//   · EXTENDING follows ruling 13's SHEET path, not the drag path: a duration
//     form, previewed with the SAME sentences as the desktop sheet
//     (previewEdit / editSentence / consequenceSentence) and saved through the
//     SAME route (saveCriticalPathTask). A foreman's change is HELD there, as
//     on desktop. PARITY: one mechanism; only the layout and language differ.
//     (The edit/consequence sentences are the engine's English, as the /m drag
//     confirm already shows them.)

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeCriticalPath, type CpInput } from '@framefocus/shared/utils/critical-path';
import { consequenceSentence, editSentence, previewEdit } from '@framefocus/shared/utils/critical-path-writes';
import { holdingUp, type HoldingTask } from '@framefocus/shared/utils/critical-path-holding';
import { saveCriticalPathTask } from '@/lib/critical-path/save-client';
import { anyUntold, untoldNotice } from '@/lib/critical-path/untold';
import { useAlert } from '@/components/confirm/confirm-provider';
import { useT } from '@/components/i18n/language-provider';

/** Test ids (not user-facing text). */
const RUNNING_ID = 'm-cp-running';
const NEXT_ID = 'm-cp-next';

function day(ymd: string | null, locale: string): string {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function CriticalPathCard({
  projectId,
  input,
  locale,
  canExtend,
}: {
  projectId: string;
  input: CpInput;
  locale: string;
  canExtend: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const alert = useAlert();
  const result = useMemo(() => computeCriticalPath(input), [input]);
  const h = useMemo(() => holdingUp(input, result), [input, result]);
  const [open, setOpen] = useState<string | null>(null);
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const editing = open ? input.tasks.find((x) => x.id === open) ?? null : null;
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1 && n <= 3650;
  const preview = useMemo(() => {
    if (!editing || !valid || n === editing.durationDays) return null;
    const p = previewEdit(input, { ...editing, durationDays: n });
    return { lines: p.parts.map(editSentence), consequence: consequenceSentence(p) };
  }, [editing, valid, n, input]);

  async function save() {
    if (!editing || !valid) return;
    setBusy(true);
    setError(null);
    const r = await saveCriticalPathTask(projectId, editing.id, { duration_days: n });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setOpen(null);
    setNote(r.held ? t('sched.cp.m.held') : t('sched.cp.m.saved'));
    if (anyUntold(r.untold)) {
      await alert(untoldNotice(r.untold, { title: t('sched.cp.untoldTitle'), body: t('sched.cp.untoldBody'), client: t('sched.cp.untoldClient') }));
    }
    router.refresh();
  }

  function row(task: HoldingTask, label: string, testid: string) {
    return (
      <div key={task.id} data-testid={testid} data-task={task.id} className="border-t border-m6m-border py-[10px] first:border-t-0">
        <p className="font-mono text-[11px] uppercase text-m6m-muted">{label}</p>
        <p className="text-[15px] font-bold text-m6m-navy">{task.title}</p>
        <p className="text-[13px] text-m6m-muted">
          {day(task.start, locale)} → {day(task.finish, locale)}
        </p>
        {canExtend && open !== task.id && (
          <button
            type="button"
            data-testid={`m-cp-extend-${task.id}`}
            onClick={() => {
              setOpen(task.id);
              setDays(String(input.tasks.find((x) => x.id === task.id)?.durationDays ?? ''));
              setError(null);
              setNote(null);
            }}
            className="mt-[6px] text-[13px] font-semibold text-m6m-blue"
          >
            {t('sched.cp.m.extend')}
          </button>
        )}
        {open === task.id && (
          <div data-testid="m-cp-sheet" className="mt-[8px] rounded-[10px] bg-m6m-surface p-[10px]">
            <label className="text-[13px] font-semibold text-m6m-navy">
              {t('sched.cp.m.days')}
              <input
                data-testid="m-cp-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="ml-[8px] w-[80px] rounded-[8px] border border-m6m-border px-[8px] py-[6px]"
              />
            </label>
            {preview && (
              <div data-testid="m-cp-preview" className="mt-[8px] text-[13px] text-m6m-navy">
                {preview.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
                <p data-testid="m-cp-consequence" className="text-m6m-muted">
                  {preview.consequence}
                </p>
              </div>
            )}
            {error && (
              <p data-testid="m-cp-error" role="alert" className="mt-[6px] text-[13px] text-m6m-danger">
                {error}
              </p>
            )}
            <div className="mt-[8px] flex gap-[8px]">
              <button
                type="button"
                data-testid="m-cp-save"
                disabled={busy || !preview}
                onClick={save}
                className="rounded-[8px] bg-m6m-blue px-[12px] py-[8px] text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {t('sched.cp.save')}
              </button>
              <button type="button" onClick={() => setOpen(null)} className="px-[12px] py-[8px] text-[13px] text-m6m-muted">
                {t('sched.cp.m.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <section data-testid="m-cp-card" className="mb-[14px] rounded-[14px] border border-m6m-border bg-white p-[14px]">
      <h2 className="text-[13px] font-extrabold uppercase text-m6m-navy">{t('sched.cp.m.title')}</h2>
      {note && (
        <p data-testid="m-cp-note" role="status" className="mt-[6px] text-[13px] text-m6m-navy">
          {note}
        </p>
      )}
      {h.running ? (
        <>
          {row(h.running, t('sched.cp.m.now'), RUNNING_ID)}
          {h.next.map((x) => row(x, t('sched.cp.m.next'), NEXT_ID))}
        </>
      ) : (
        <p data-testid="m-cp-none" className="mt-[6px] text-[13px] text-m6m-muted">
          {t('sched.cp.m.none')}
        </p>
      )}
      <p data-testid="m-cp-room" className="mt-[8px] text-[13px] text-m6m-muted">
        {t('sched.cp.m.room', { n: h.room })}
      </p>
    </section>
  );
}
