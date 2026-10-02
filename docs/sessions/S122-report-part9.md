# S122 Part 9 — report entries (side file; folded into S122-report.md when this branch is rebased after Part 8 merges)

### R5.1 — Part 9 (mobile), build log — branch `feature/s122-p9-mobile` from `48f7cf01`

- **`holdingUp(input, result)`** (`packages/shared/utils/critical-path-holding.ts`, pure): the open critical task that starts first, the next TWO
  open critical tasks behind it, and how many open tasks have float. Unit `s122-cp-holding-up.test.ts`, hand-worked: **4/4**.
  - Sabotages: (room counts float ≥ 0) → **2 ✘**; (next takes 3), first GREEN (vacuous: the 3-task chain left only 2 behind), so a 5-task chain
    test was added → **1 ✘**. Restored, `cmp` 0.
  - ⚠️ **Removed, not tested:** a "prefer the in-progress critical task" rule. An in-progress task's start is its ACTUAL start, which no open task
    can precede, so the rule equals "earliest open critical". No test could tell them apart, so it was dead code.
  - **Stated residual:** the "open" filter (skip complete) stays green when removed, because the engine already reports a complete task as not
    critical and with no float. It is kept as a guard against an engine change; no test covers it.

#### DECIDED UNATTENDED — Part 9

| # | decided | alternative rejected | why |
| --- | --- | --- | --- |
| D9-1 | The card lives on the **/m project SCHEDULE page** (M-12) | the /m project hub (M-3) | M-3's layout is pinned by M6M rulings and e2e (A-11e's 50/50 stat strip, exactly nine tiles, no finance tile). M-12 is the schedule screen. |
| D9-2 | Shown only to the roles that see the desktop Critical Path tab (Owner, Admin, PE, PM, foreman), on a CP project | showing crew/subs too | It shows float-derived facts ("N tasks have room"). The desktop tab already draws that line; crew are sent to Schedule. |
| D9-3 | "Extend" = the card's **duration form**, through the SAME `previewEdit` sentences and the SAME `saveCriticalPathTask` route as the desktop sheet (a foreman's change is HELD, as there) | a drag, or a mobile-only save path | Spec: "follows ruling 13's sheet path, not the drag path"; PARITY: one mechanism. The edit/consequence sentences are English on /m, as the existing /m CP drag confirm already is (server sentences). |
