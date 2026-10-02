# S123 report — Critical Path close-out (D-1 to D-4)

Running record. Branch `feature/s123-cp-closeout`. Every measurement names its ref.

---

## PHASE 1 — ASSESS (nothing built)

### 1.0 — First action
- `ListAgents` → **no other Claude Code session on this machine.** (Honest note: I opened `S123-prompt.md` to learn what the first action
  was, then ran `ListAgents` before any other read.)

### 1.1 — `origin/main`
- `git fetch --prune` exit 0. `origin/main` = **`b7e6b7fe`** *"[S122] Merge feature/s122-p9-mobile: the S122 final report, folded into
  docs/sessions/S122-report.md (draft file removed) [skip ci]"*. Part 9 = `8cd52cec`, Part 8 = `cb9873e6`, Part 7 = `48f7cf01`,
  Part 6 = `bacf1bb8`, Part 5 = `a955dac5`, all ancestors of `origin/main`. **Stop rule 7 does not fire.**

### 1.2 — The close-out decisions file
- `git log --all --pretty=format: --name-only -- 'docs/sessions/*lose*ut*'` → exactly one path: **`docs/sessions/S122-closeout-decisions.md`**.
- **Not on `main`** (`git cat-file -e origin/main:docs/sessions/S122-closeout-decisions.md` → 128). It was on `feature/s122-p9-mobile`
  only (`440522ca`), with this prompt (`20e0f6c4`).
- **Brought forward:** `feature/s123-cp-closeout` was branched from `origin/main` `b7e6b7fe` and both commits were cherry-picked
  (`a10f05b1`, `ddfc6781`); diff vs `origin/main` = those two files only. Read from **`feature/s123-cp-closeout` at `ddfc6781`**.

### 1.3 — `docs/sessions/S122-report.md` on `main`
Read on `origin/main` `b7e6b7fe` (identical on this branch). It agrees with this prompt on parts, merges and the twelve unattended decisions.
Where code was checked below, the code matches it unless stated.

### 1.4a — The client portal's schedule paths (code at `ddfc6781`; functions live on **rebuild-test** `nmyphyhmfttxkdoposvf`)

| | `client_schedule(p_project_id)` | `client_critical_path(p_project_id)` |
| --- | --- | --- |
| returns | `id, project_id, phase_name, title, start_date, due_date, status` (one row per live task) | `phase_name, phase_sort, phase_start, phase_finish, task_title, task_sort, projected_finish` |
| gate | `is_client_of_project` AND `client_has_full_access()` | the same two, AND `project_schedule_settings.critical_path_enabled = true` (live row) |
| on a CP project | **still returns every task's start, due and status** (D-1's finding) | phases with min/max task dates, titles, the stored `projected_finish` |
| on a non-CP project | the task list | 0 rows |
| SECURITY DEFINER / STABLE / SQL | yes / yes / yes | yes / yes / yes |
| md5 of `pg_get_functiondef` (rebuild-test) | `22d6e081…0153f` (= production's, per S122 R3.x) | `ac958d4f…24f53` |

**Which page calls which:** ONE page, `app/portal/[projectId]/page.tsx` (the Dashboard tab), via `lib/services/portal.ts`. It calls
`getPortalCriticalPath` first; if that returns rows it renders the CP card (projected finish + `CLIENT_DISCLAIMER` + phases with
date ranges + task title bullets) and **does not call `client_schedule`**. Otherwise it calls `getPortalSchedule` and renders the S164
task list (title, phase, start → due) **with no disclaimer**. No other app/lib caller of either function (`grep` across `apps/web`,
`packages`; the S164 live test calls `getPortalSchedule` too).

**What a linked full-access client sees today:** CP project → the CP card (with disclaimer). Non-CP → the task-date list (no disclaimer).
A CP project with zero tasks → `client_critical_path` returns 0 rows → falls back to the list's empty sentence (no disclaimer, nothing to disclaim).
**The prompt's finding is confirmed by object:** `client_schedule`'s body has no CP condition, so a direct RPC call on a CP project returns task dates
and status. **No float column exists in either function's return type.** On a CP project `tasks.start_date/due_date` ARE the engine's computed
dates (write-through), so both functions already read engine dates; D-1 is about one page, one disclaimer, and a Gantt — not a new data source.

### 1.4d — The disclaimer string(s) (code at `ddfc6781`)
`grep -rniE "fluid and dynamic|planning purposes|and figures|cannot be guaranteed"` over `apps`, `packages`, `supabase` (ts/tsx/sql/html/json):
- **ONE definition:** `apps/web/lib/critical-path/client-disclaimer.ts:13` — *"The construction industry is fluid and dynamic; these dates are for
  planning purposes and cannot be guaranteed."* (imports nothing).
- Used by: the portal CP card (`app/portal/[projectId]/page.tsx:72`) and the client finish email (`lib/critical-path/notify-text.ts:24`, re-exported
  at :18). Pinned by `test/s122-cp-notify-text.test.ts:25` and `e2e/portal-critical-path-s122.spec.ts:34`.
- **"and figures" appears NOWHERE in code** (0 hits). No client surface that shows money carries any disclaimer today.
- ⇒ **D-2 is already true in code** ("these dates", everywhere it appears). D-2's build reduces to: the D-1 list AND Gantt views use the same
  constant; nothing is renamed; the "and figures" wording is not introduced anywhere (there is no money surface that has a disclaimer to keep).
