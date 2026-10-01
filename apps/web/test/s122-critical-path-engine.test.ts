import { describe, expect, it } from 'vitest';
import {
  addWorkingDays,
  computeCriticalPath,
  type CpDependency,
  type CpInput,
  type CpTask,
} from '@framefocus/shared/utils/critical-path';

// S122 Part 2 — the engine, proved before any UI (§2-C). Every expectation is
// HAND-WORKED below, with each task's float stated. Calendar: Mon–Fri, no
// holidays unless a test adds one. Today = project start = Mon 2026-10-05.
//
//   ordinal  0     1     2     3     4     5     6     7     8     9
//   date    Mon05 Tue06 Wed07 Thu08 Fri09 Mon12 Tue13 Wed14 Thu15 Fri16

const MON_FRI = { workDays: [1, 2, 3, 4, 5], holidays: [] as string[] };
const TODAY = '2026-10-05';

function task(id: string, durationDays: number | null, over: Partial<CpTask> = {}): CpTask {
  return {
    id,
    title: id,
    status: 'not_started',
    durationDays,
    startDate: null,
    dueDate: null,
    completedOn: null,
    daysLeft: null,
    daysLeftAsOf: null,
    startConstraint: null,
    constraintDate: null,
    ...over,
  };
}
const fs = (p: string, s: string): CpDependency => ({
  predecessorId: p,
  successorId: s,
  type: 'finish_to_start',
});
function input(
  tasks: CpTask[],
  dependencies: CpDependency[] = [],
  over: Partial<CpInput> = {}
): CpInput {
  return {
    tasks,
    dependencies,
    calendar: MON_FRI,
    lostDays: [],
    projectStart: TODAY,
    today: TODAY,
    ...over,
  };
}

describe('working-day arithmetic', () => {
  const wd = (d: string) => [1, 2, 3, 4, 5].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  it('3 working days starting Friday ends Tuesday (§1-C)', () => {
    expect(addWorkingDays('2026-10-09', 3, wd)).toBe('2026-10-13');
  });
  it('a start on Saturday moves to Monday', () => {
    expect(addWorkingDays('2026-10-10', 1, wd)).toBe('2026-10-12');
  });
});

describe('a chain', () => {
  it('A(2) → B(3) → C(1): all critical, float 0, finish Mon12', () => {
    const r = computeCriticalPath(
      input([task('A', 2), task('B', 3), task('C', 1)], [fs('A', 'B'), fs('B', 'C')])
    );
    // A Mon05–Tue06; B Wed07–Fri09; C Mon12.
    expect(r.ok).toBe(true);
    expect(Object.keys(r.tasks).length).toBe(3);
    expect(r.tasks.A).toMatchObject({
      earlyStart: '2026-10-05',
      earlyFinish: '2026-10-06',
      totalFloat: 0,
      critical: true,
    });
    expect(r.tasks.B).toMatchObject({
      earlyStart: '2026-10-07',
      earlyFinish: '2026-10-09',
      totalFloat: 0,
      critical: true,
    });
    expect(r.tasks.C).toMatchObject({
      earlyStart: '2026-10-12',
      earlyFinish: '2026-10-12',
      totalFloat: 0,
      critical: true,
    });
    expect(r.projectedFinish).toBe('2026-10-12');
    expect(r.criticalChain).toEqual(['A', 'B', 'C']);
  });
});

describe('⚠️ the DIAMOND — where a naive engine reports the wrong critical path', () => {
  // A(2) → B(5) → D(1) and A(2) → C(3) → D(1).
  //   A  ES 0 EF 1 (Mon05–Tue06)
  //   B  ES 2 EF 6 (Wed07–Tue13)     C  ES 2 EF 4 (Wed07–Fri09)
  //   D  ES 7 EF 7 (Wed14)           finish = ordinal 7 = Wed14
  // Backward: D LF 7 LS 7; B LF 6 (float 0); C LF 6 → float 6 − 4 = 2;
  //   A LF = min(B.LS−1, C.LS−1) = min(1, 3) = 1 → float 0.
  const r = computeCriticalPath(
    input(
      [task('A', 2), task('B', 5), task('C', 3), task('D', 1)],
      [fs('A', 'B'), fs('A', 'C'), fs('B', 'D'), fs('C', 'D')]
    )
  );
  it('4 tasks, finish Wed14', () => {
    expect(Object.keys(r.tasks).length).toBe(4);
    expect(r.projectedFinish).toBe('2026-10-14');
  });
  it('floats: A 0, B 0, C 2, D 0', () => {
    expect([
      r.tasks.A.totalFloat,
      r.tasks.B.totalFloat,
      r.tasks.C.totalFloat,
      r.tasks.D.totalFloat,
    ]).toEqual([0, 0, 2, 0]);
  });
  it('critical chain A → B → D; C is not critical and may slide to Tue13', () => {
    expect(r.criticalChain).toEqual(['A', 'B', 'D']);
    expect(r.tasks.C.critical).toBe(false);
    expect(r.tasks.C).toMatchObject({ lateStart: '2026-10-09', lateFinish: '2026-10-13' });
  });
});

describe('the four dependency types', () => {
  it('SS: B starts with A; FF: C finishes with A; SF: D finishes when A starts', () => {
    const r = computeCriticalPath(
      input(
        [
          task('A', 3),
          task('B', 2),
          task('C', 1),
          task('D', 1, { startConstraint: 'not_before', constraintDate: '2026-10-05' }),
        ],
        [
          { predecessorId: 'A', successorId: 'B', type: 'start_to_start' },
          { predecessorId: 'A', successorId: 'C', type: 'finish_to_finish' },
          { predecessorId: 'A', successorId: 'D', type: 'start_to_finish' },
        ]
      )
    );
    expect(r.tasks.B).toMatchObject({ earlyStart: '2026-10-05', earlyFinish: '2026-10-06' }); // SS
    expect(r.tasks.C).toMatchObject({ earlyStart: '2026-10-07', earlyFinish: '2026-10-07' }); // FF with A (Wed07)
    expect(r.tasks.D).toMatchObject({ earlyStart: '2026-10-05', earlyFinish: '2026-10-05' }); // SF: EF ≥ A.ES
    expect(r.projectedFinish).toBe('2026-10-07');
  });
});

describe('the calendar (§1-C) and weather days (§1-D)', () => {
  it('Fri + 3 working days = Tue (not_before Fri09)', () => {
    const r = computeCriticalPath(
      input([task('X', 3, { startConstraint: 'not_before', constraintDate: '2026-10-09' })])
    );
    expect(r.tasks.X).toMatchObject({ earlyStart: '2026-10-09', earlyFinish: '2026-10-13' });
  });
  it('a company holiday on Wed07 pushes a 3-day task from Wed to Thu', () => {
    const r = computeCriticalPath(
      input([task('X', 3)], [], {
        calendar: { workDays: [1, 2, 3, 4, 5], holidays: ['2026-10-07'] },
      })
    );
    expect(r.tasks.X).toMatchObject({ earlyStart: '2026-10-05', earlyFinish: '2026-10-08' }); // Mon, Tue, Thu
  });
  it('a lost day on Tue06 moves UNSTARTED work and NOT work in progress', () => {
    const r = computeCriticalPath(
      input(
        [
          task('U', 2), // unstarted: Mon05, (Tue06 lost), Wed07
          task('P', 4, {
            status: 'in_progress',
            startDate: '2026-10-01',
            daysLeft: 2,
            daysLeftAsOf: '2026-10-05',
          }), // Mon05, Tue06
        ],
        [],
        { lostDays: [{ start: '2026-10-06', end: '2026-10-06' }] }
      )
    );
    expect(r.tasks.U).toMatchObject({ earlyStart: '2026-10-05', earlyFinish: '2026-10-07' });
    expect(
      r.tasks.P.earlyFinish,
      'in progress keeps its finish — the lost day does not touch it'
    ).toBe('2026-10-06');
  });
  it('an unstarted task whose start lands ON a lost day starts the next day', () => {
    const r = computeCriticalPath(
      input([task('U', 1)], [], { lostDays: [{ start: '2026-10-05', end: '2026-10-06' }] })
    );
    expect(r.tasks.U).toMatchObject({ earlyStart: '2026-10-07', earlyFinish: '2026-10-07' });
  });
  it('a calendar with NO working days is refused, never looped on', () => {
    const r = computeCriticalPath(
      input([task('A', 1)], [], { calendar: { workDays: [], holidays: [] } })
    );
    expect(r).toMatchObject({ ok: false, error: 'no_working_days', projectedFinish: null });
  });
});

describe('§2-B case 1 — a task with NO DURATION (Q15-A)', () => {
  it('with both typed dates: a FIXED SPAN, flagged; successors move from its typed finish', () => {
    const r = computeCriticalPath(
      input(
        [task('T', null, { startDate: '2026-10-05', dueDate: '2026-10-08' }), task('S', 2)],
        [fs('T', 'S')]
      )
    );
    expect(r.tasks.T).toMatchObject({
      state: 'fixed_span',
      earlyStart: '2026-10-05',
      earlyFinish: '2026-10-08',
    });
    expect(r.tasks.T.flags).toContain('duration_not_set');
    expect(r.tasks.S).toMatchObject({ earlyStart: '2026-10-09', earlyFinish: '2026-10-12' });
  });
  it('with one date or none: NEEDS DURATION, left out — never zero-length; its successor is flagged', () => {
    const r = computeCriticalPath(
      input([task('N', null, { startDate: '2026-10-05' }), task('S', 2)], [fs('N', 'S')])
    );
    expect(r.tasks.N).toMatchObject({
      state: 'needs_duration',
      earlyStart: null,
      earlyFinish: null,
      totalFloat: null,
      critical: false,
    });
    expect(r.tasks.S.flags).toContain('waits_on_unscheduled');
    expect(r.tasks.S).toMatchObject({ earlyStart: '2026-10-05', earlyFinish: '2026-10-06' });
  });
});

describe('§2-B case 2 — ⚠️ A CYCLE is REPORTED, never looped on (stop rule 11)', () => {
  // A wall-clock budget: a hang would blow it. Each case is a few microseconds.
  const quick = (f: () => void) => {
    const t0 = Date.now();
    f();
    expect(Date.now() - t0, 'must return, not hang').toBeLessThan(1000);
  };
  it('a 2-cycle A ⇄ B', () =>
    quick(() => {
      const r = computeCriticalPath(
        input([task('A', 1), task('B', 1)], [fs('A', 'B'), fs('B', 'A')])
      );
      expect(r).toMatchObject({ ok: false, error: 'cycle', projectedFinish: null });
      expect(r.cycle).toEqual(['A', 'B', 'A']);
      expect(r.tasks.A.state).toBe('in_cycle');
    }));
  it('a 3-cycle A → B → C → A', () =>
    quick(() => {
      const r = computeCriticalPath(
        input(
          [task('A', 1), task('B', 1), task('C', 1)],
          [fs('A', 'B'), fs('B', 'C'), fs('C', 'A')]
        )
      );
      expect(r.cycle).toEqual(['A', 'B', 'C', 'A']);
    }));
  it('a cycle beside an acyclic part, with a task DOWNSTREAM of the loop', () =>
    quick(() => {
      // X → Y is fine; A → B → A loops; B → D hangs off the loop.
      const r = computeCriticalPath(
        input(
          [task('X', 1), task('Y', 1), task('A', 1), task('B', 1), task('D', 1)],
          [fs('X', 'Y'), fs('A', 'B'), fs('B', 'A'), fs('B', 'D')]
        )
      );
      expect(r.ok).toBe(false);
      expect(r.cycle).toEqual(['A', 'B', 'A']);
      expect(r.tasks.D.state, 'downstream of the loop is not computed either').toBe('in_cycle');
      expect(r.tasks.X).toMatchObject({
        state: 'scheduled',
        earlyStart: '2026-10-05',
        totalFloat: null,
      });
    }));
  it('a 500-node ring returns quickly', () =>
    quick(() => {
      const n = 500;
      const ts = Array.from({ length: n }, (_, i) => task(`T${String(i).padStart(3, '0')}`, 1));
      const ds = ts.map((t, i) => fs(t.id, ts[(i + 1) % n].id));
      const r = computeCriticalPath(input(ts, ds));
      expect(r.error).toBe('cycle');
      expect(r.cycle!.length).toBe(n + 1);
    }));
});

describe('§2-B case 3 — a DISCONNECTED task', () => {
  it('starts at the project start, flagged, float measured against the project finish', () => {
    const r = computeCriticalPath(
      input([task('A', 2), task('B', 3), task('Z', 1)], [fs('A', 'B')])
    );
    // finish = B's Fri09 (ordinal 4); Z Mon05 (0) → float 4.
    expect(r.tasks.Z.flags).toContain('disconnected');
    expect(r.tasks.Z).toMatchObject({ earlyStart: '2026-10-05', totalFloat: 4, critical: false });
  });
});

describe('§2-B case 4 — IN PROGRESS: remaining time entered, percent never read (ruling 13)', () => {
  it('days left 3 as of Mon05 → finishes Wed07; percent_complete is not an input at all', () => {
    const r = computeCriticalPath(
      input([
        task('P', 10, {
          status: 'in_progress',
          startDate: '2026-09-28',
          daysLeft: 3,
          daysLeftAsOf: '2026-10-05',
        }),
      ])
    );
    expect(r.tasks.P).toMatchObject({
      state: 'in_progress',
      earlyStart: '2026-09-28',
      earlyFinish: '2026-10-07',
    });
    // CpTask has no percent field — the engine cannot read one.
    expect(Object.keys(task('x', 1))).not.toContain('percentComplete');
  });
  it('no days left entered → the planned finish, flagged', () => {
    const r = computeCriticalPath(
      input([task('P', 5, { status: 'in_progress', startDate: '2026-10-05' })])
    );
    expect(r.tasks.P.flags).toContain('days_left_missing');
    expect(r.tasks.P.earlyFinish).toBe('2026-10-09');
  });
  it('a stale entry whose finish has passed finishes TODAY at the earliest, flagged', () => {
    const r = computeCriticalPath(
      input([
        task('P', 5, {
          status: 'in_progress',
          startDate: '2026-09-21',
          daysLeft: 1,
          daysLeftAsOf: '2026-09-25',
        }),
      ])
    );
    expect(r.tasks.P.flags).toContain('days_left_stale');
    expect(r.tasks.P.earlyFinish).toBe(TODAY);
  });
  it('a complete task is fixed at its actuals and never critical', () => {
    const r = computeCriticalPath(
      input(
        [
          task('C', 3, { status: 'complete', startDate: '2026-09-28', completedOn: '2026-09-30' }),
          task('S', 1),
        ],
        [fs('C', 'S')]
      )
    );
    expect(r.tasks.C).toMatchObject({ state: 'complete', totalFloat: null, critical: false });
    expect(r.tasks.S.earlyStart, 'its successor cannot start before today').toBe(TODAY);
  });
});

describe('§2-B case 5 — a FIXED date earlier than its predecessor allows', () => {
  it('keeps its fixed date and reports the CONFLICT with the gap in working days', () => {
    // A(4) Mon05–Thu08 → B fixed on Tue06: A would push B to Fri09 = 3 working days late.
    const r = computeCriticalPath(
      input(
        [task('A', 4), task('B', 1, { startConstraint: 'fixed', constraintDate: '2026-10-06' })],
        [fs('A', 'B')]
      )
    );
    expect(r.tasks.B).toMatchObject({ earlyStart: '2026-10-06', earlyFinish: '2026-10-06' });
    expect(r.conflicts).toEqual([{ taskId: 'B', predecessorId: 'A', gapDays: 3 }]);
    // A's float is NEGATIVE (it ends after B, which depends on it): behind, so critical.
    expect(r.tasks.A.totalFloat).toBe(-3);
    expect(r.tasks.A.critical).toBe(true);
  });
  it('not_before is the soft form: the later of the predecessor and the date, no conflict', () => {
    const r = computeCriticalPath(
      input(
        [
          task('A', 4),
          task('B', 1, { startConstraint: 'not_before', constraintDate: '2026-10-06' }),
        ],
        [fs('A', 'B')]
      )
    );
    expect(r.tasks.B.earlyStart).toBe('2026-10-09');
    expect(r.conflicts).toEqual([]);
  });
});

describe('time passing (recompute trigger 9)', () => {
  it('the same unstarted plan computed a week later finishes a week later', () => {
    const ts = [task('A', 2), task('B', 3)];
    const a = computeCriticalPath(input(ts, [fs('A', 'B')]));
    const b = computeCriticalPath(input(ts, [fs('A', 'B')], { today: '2026-10-12' }));
    expect(a.projectedFinish).toBe('2026-10-09');
    expect(b.projectedFinish).toBe('2026-10-16');
  });
});

describe('robustness', () => {
  it('a link to a task not in the project is dropped and counted', () => {
    const r = computeCriticalPath(input([task('A', 1)], [fs('ghost', 'A')]));
    expect(r.unknownLinks).toBe(1);
    expect(r.ok).toBe(true);
  });
  it('a schedule past the 10-year horizon is refused, not walked forever', () => {
    const r = computeCriticalPath(input([task('A', 5000)]));
    expect(r).toMatchObject({ ok: false, error: 'horizon' });
  });
  it('an empty project computes to no finish', () => {
    expect(computeCriticalPath(input([]))).toMatchObject({
      ok: true,
      projectedFinish: null,
      criticalChain: [],
    });
  });
});
