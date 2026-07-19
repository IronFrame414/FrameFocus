# Session 67 — Module 6B spec hardening + 6A reorder fix + throwaway provisioning

> Written July 11, 2026. Sources of record: `git log` (real hashes below), the authoritative
> `docs/specs/6B-spec.md` on branch `spec/module-6-hardening` (commit `ab16be1`), and the live
> branch/infra state. Where a fact comes from the spec file, its wording is quoted.
>
> **Filename note:** filed as `context67.md`, not `context66.md` — `context66.md` was already occupied
> by a separate **Module 7 architecture** handoff (real, committed as `1e9a21d`). This 6B-hardening
> session collided on the number; the Module 7 file was left untouched. Session numbering across
> 64→(M7 architecture)→this session is loose — treat these as distinct sessions, not a clean sequence.

---

## 1. Session 67 outcome

The 6B (Daily Logs) acceptance trace was **verified against a real Bishop day** — a townhouse-remodel
finishing day narrated in the Module 6B interview — closing the last open blocker on the spec (§10 open
item #1). A `notes` free-text field was added (schema §4, behavior §6.7a, §3 field list) and interview
questions Q2/Q4/Q5 were resolved inline. Separately, an **ordering bug in the built 6A migration** was
found and fixed: two `LANGUAGE sql` functions referenced `time_clock_sessions` before the table was
created, which would fail at `CREATE FUNCTION` time. A **fresh throwaway Supabase project was
provisioned** (`framefocus-6a-test`) and **all 8 migrations applied clean** against it, leaving
production untouched.

---

## 2. Commits landed this session

Two commits carry this session's work. They are on **different branches** — the 6B spec work is **not
merged to main**.

- **`ab16be1`** — `docs(6B): verify acceptance trace against real Bishop day; add notes field; resolve Q2/Q4/Q5`
  - Branch: **`spec/module-6-hardening`** (NOT on main — `git merge-base --is-ancestor ab16be1 main` → false).
  - One commit, `1 file changed, 26 insertions(+), 21 deletions(-)`, all in `docs/specs/6B-spec.md`.
  - Bundles everything: §10 verified trace, §4 `notes` column, §6.7a Notes subsection, §3 `_notes_`
    field-list entry, and the Q2/Q4/Q5 resolutions + §8 Read-bullet resolution.
- **`4685bb5`** — `fix(6a): reorder time_clock_sessions table before dependent functions`
  - Branch: **`main`** (reachable from main — confirmed ancestor). Pure reorder,
    `1 file changed, 41 insertions(+), 41 deletions(-)`, no content change.

**⚠️ Flag — the "notes-to-§3 commit" you expected as a SEPARATE commit does not exist.** The §3
field-list `_notes_` edit was folded into `ab16be1` (verified: the `ab16be1` diff includes the line
`… _tasks for tomorrow_, _notes_.`). There is one 6B doc commit this session, not two.

Supporting main-branch context (Module 6A merge chain):
`1e9a21d docs(spec): land Module 7 architecture` · `7e09738 Merge Module 6A: time tracking` ·
`f928f7a docs: reconcile Module 6A architecture to built state` ·
`889b09f feat(services): Module 6A …` · `31497a7 feat(shared): Module 6A …` ·
`4790932 feat(db): Module 6A time tracking — sessions + segments schema`.

---

## 3. 6B decisions — full text

Pulled verbatim from `6B-spec.md` §11a (`ab16be1`). Q1 and Q6 are **build-facts**, not decisions.

- **Q1 — Employee-hours member join (BUILD FACT).** "`time_segments` has no `member_id`; hours-per-member
  requires joining through `time_clock_sessions`. This is a build fact, not a decision — flagged so it is
  not missed when 6B's derivation is written."

- **Q2 — Day boundary / timezone. RESOLVED — the company's local calendar day.** From the file: "Build
  dependency: a company-level timezone must exist (company settings) as the source; without it the day
  boundary is undefined. This governs both crew-present and employee-hours auto-fill."

- **Q3 — Who owns the per-member-per-day hours derivation? DECIDED IN CONVERSATION, NOT YET IN FILE.**
  The spec file still shows Q3 **unresolved**, worded as a recommendation: "6A exposes only project-grouped
  hours. Does 6B build its own member-grouped read, or should 6A grow a shared helper (e.g.
  `hoursByMemberForProjectDay`) so 6B and any future consumer share one source of truth? Recommend the
  latter to avoid a second derivation drifting from 6A's." **Session decision: adopt the shared 6A helper
  (the recommended "latter").** This is NOT written into `6B-spec.md` yet — see build blocker (a) in §5.

- **Q4 — Does a `warranty`-only visit count as "crew present"? RESOLVED — yes, include in crew-present, but
  label.** From the file: "Warranty carries a `project_id` (person was physically on the job) so they count
  as present; label to preserve the presence-vs-cost distinction, since warranty hours are budget-excluded."

- **Q5 — Daily-log read visibility for PM/Foreman. RESOLVED — assigned-only, matching M5.** From the file:
  "Daily-log read visibility uses `can_view_project()`; PM/Foreman read logs only for projects they are
  assigned to. No divergent RLS rule. This is the module-wide answer (also governs 6C/6D). Delete is
  Owner/Admin-only."

- **Q6 — Sub double-count (BUILD FACT, = open item #4).** "A subcontractor with a login who clocks in via 6A
  *and* is entered manually in §4.2 is counted twice. Surfaced here because 6A makes sub clock-in real (subs
  are `company_members` and rank with crew for approval)."

**§8 Read-visibility resolution (verbatim).** The former `[CONFLICT — flag, do not resolve]` bullet is now
`[RESOLVED — assigned-only via can_view_project()]`: "read visibility follows M5 content-visibility:
`can_view_project()` = 'owner/admin see all OR the caller is assigned' — restricting PM/Foreman to assigned
projects, not company-wide. … Crew read is assigned-only likewise. This is the module-wide decision (Q5)."

**Module-wide note.** Q5 is explicitly the answer for 6C and 6D too — with one exception: **6C incident logs
are company-wide, not assigned-only** (§7: 6C is a "company-wide incident log" with "immediate notification
to Owner/Admin/PM/Foreman"). Daily-log content (6B) is assigned-only; incident-log visibility (6C) is
company-wide. Do not collapse the two when building 6C's RLS.

---

## 4. 6B open items (§11 table — copied so they are not lost)

| #   | Item                                                                                                       | Owner             |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| 1   | **CLOSED** — acceptance trace (§10) verified against a real Bishop day.                                     | Closed            |
| 2   | PDF regenerate-on-edit vs. version-on-edit; filename disambiguation for same-project same-date logs        | 6B build          |
| 3   | **Voice-to-text vendor** — new external dependency, no offline path                                        | 6B build          |
| 4   | **Sub double-count** — a subcontractor with a login who clocks in via 6A _and_ is entered manually in §4.2 | 6B build          |
| 5   | "Tasks for tomorrow" ↔ 6E briefing: **resolved** — 6E displays this field read-only and stores nothing (no FK, no link), per 6E-spec §5. (M5 tasks overlap still open.) | Closed            |
| 6   | Crew-present snapshot staleness for late arrivals (§5)                                                     | Accepted; revisit |
| 7   | Which `segment_type`s count as "on site" (§5)                                                              | Build             |
| 8   | Photo auto-pull predicate — project + date, or explicit attach?                                            | Build             |
| 9   | Crew read-visibility depends on the M5 §5.2a decision actually shipping as recommended                     | Build             |

---

## 5. Two 6B build blockers (must clear before 6B build)

**(a) Q3 shared-helper decision is not yet in the file.** The session decided to grow a shared 6A helper
(`hoursByMemberForProjectDay`-style) rather than have 6B build its own member-grouped hours derivation
(§3 above). `6B-spec.md` §11a still shows Q3 as an open recommendation. **A Claude Code edit must write
this resolution into `6B-spec.md` (§11a Q3, and update §5/§6.1 "new derivation 6B must build" language)
before 6B build starts** — otherwise the build will re-derive hours in 6B and drift from 6A's source.

**(b) Company timezone column is UNVERIFIED.** Q2's resolution ("the company's local calendar day")
depends on a company-level timezone existing as the source, and **that column has not been confirmed to
exist**. The db-dump check to verify it **failed because Docker is not available in Codespaces**
(`supabase db dump` / local-stack paths need Docker). **6B build must verify or add a company timezone
column via a non-Docker method** — e.g. the Supabase MCP `list_tables`/`execute_sql` against the project,
or `supabase db pull` against the linked remote — before the day-boundary logic can be trusted.

---

## 6. Infra state

- **Throwaway (active test target):** ref **`bgjkgxpdbrixwvjtruad`** — name **`framefocus-6a-test`**,
  region **us-east-1**. **All 8 migrations applied** clean against it. This is where 6A is exercised.
- **Production:** ref **`jwkcknyuyvcwcdeskrmz`** — **untouched** this session.
- **WorthProp-Site:** ref **`sliyfisgkjnihmgqhzib`** — **paused** (the plan was upgraded past the 2-project
  free limit to make room for the throwaway; the marketing site was paused rather than deleted).
- **CLI gotcha:** the Supabase CLI **needs re-linking each session for IPv4** — re-run `supabase link`
  against the throwaway at the start of the next session before any migration/db command.

---

## 7. Provisioning learnings

- **(a) Free tier caps at 2 active projects.** Hit this limit **twice** this session; resolved by upgrading
  the plan.
- **(b) Option B (fresh throwaway) beat Option A (reconcile the old entangled throwaway).** The old
  throwaway carries **signed-artifacts migrations that are not on `main`** (branch `feat/signed-artifacts`,
  ahead of origin) — reconciling it would have meant untangling out-of-tree migrations. A clean project +
  replay of the 8 tracked migrations was faster and gave a known-good baseline.
- **(c) 6A bug root cause — a `LANGUAGE sql` function validates its body at `CREATE` time.** Postgres parses
  and resolves table references when the SQL function is created (unlike `plpgsql`, which defers). So
  `can_view_time_session()` / `owns_open_session()` referencing `time_clock_sessions` **required** the
  table to be created first. The reorder (`4685bb5`) was **mandatory, not cosmetic** — the original order
  would have failed `db push` with `relation "time_clock_sessions" does not exist`.

---

## 8. Next session plan

1. **6C interview first.** Read `6C-spec.md` end to end. Incident reports, **OSHA fields, notifications,
   and the company-wide incident log are all UNREAD this session — verify each against the file**, do not
   work from memory. 6C is the incident-report module that 6B's hazard flag escalates into.
2. **Then 6D** (material deliveries). The **PO-close-on-usable-quantity** behavior is from memory only —
   **verify against `6D-spec.md`** before relying on it.
3. **6B overnight build is deferred.** If 6B is built, **land the two §5 blockers first**.

---

## 9. Coupling — build order constraint

**6B's hazard checkbox escalates into 6C** (§7). **Build 6C before 6B so the escalation target exists** —
otherwise 6B ships with a dead escalation button.

---

## 10. Carry-forward unresolved (not touched this session)

- `co-builder.tsx` still has stale **"no email" copy**.
- **CO client autofill** — change-order client fields not auto-populating.
- **Markup import** — the M3 markup component reuse path still needs its import wired for 6B (§6.8).
- **Logo upload** — outstanding company-settings logo upload issue.
- **`CONSENT_TEXT` needs counsel**.
- **Company Settings paid-break flag** — deferred to the batched Company Settings pass.
- **Five-copy `row_type` enum is unfiled in `TECH_DEBT.md`**.
- **`apps/web/.claude` is untracked** — TECH_DEBT **#51**.
