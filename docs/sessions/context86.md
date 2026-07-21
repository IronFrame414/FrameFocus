# Session 86 — 6A UI Hardened + Pay Rates + Company Time Settings; Merged to Main and Deployed

**Branch at close:** `main`, tree clean except this file. `feat/module-6a-ui` merged via
`6e01f19` and pushed — `main` == `origin/main`, Vercel auto-deployed.
**Production (`jwkcknyuyvcwcdeskrmz`): TOUCHED this session** — six migrations applied
(list below), verified via `supabase migration list` (21/21 local↔remote in sync).
**Test DB:** rebuild-test `nmyphyhmfttxkdoposvf` also at 21/21 — prod and rebuild-test
are schema-identical for the first time since S77.
**CLI at close: linked to PROD** — RE-LINK to rebuild-test before any test-data work.

---

## Session goal (met, plus overrun)

Close out the S84 carry-forwards (TZ fix, RLS probes-adjacent wedge bug), then build the
two owed backends (effective-dated pay rates, batched Company Settings pass), reindex or
defer FFNav, and merge. All delivered; the wedge bug's root cause turned out to be an RLS
`WITH CHECK` defect worth its own writeup (below).

---

## Commits this session (`f2937ba` → merge)

| Commit    | Description                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------- |
| `584eb01` | fix(6a): self clock-out RLS rejection + close-only recovery path for wedged sessions              |
| `9c0a537` | fix(6a): thread company timezone through time rendering, replace hardcoded America/New_York       |
| `5cc6d64` | feat(6a): global header clock in/out button; nest timesheets under timeclock with redirect stubs  |
| `1075c88` | feat(6a): effective-dated pay rates with approval snapshots, chronological 1.5x OT, rate manager UI |
| `b5dd058` | feat(6a): company time settings — week start, OT threshold, paid breaks, GPS mode; drop admin-timeclock gate per spec amendment |
| `6a3cd10` | docs: UI-section spec rule in CLAUDE.md; FFNav reindex deferred to 6B UI, target order locked     |
| `6e01f19` | merge: Module 6A UI — timeclock, timesheets, pay rates, company time settings                     |

(`3383ad4` mounted-gate hydration fix predates `f2937ba` — S84/85 work, listed in context84.)

---

## Migrations — six applied to BOTH rebuild-test and prod

In timestamp order (first three written S85, rebuild-test-only until now; last three new):

1. `20260721000000_6a1_own_recent_segment_edit.sql`
2. `20260721010000_6a2_tiered_time_rls.sql`
3. `20260721020000_6a2_week_approval_fn.sql`
4. `20260721030000_6a_fix_session_update_with_check.sql`
5. `20260721040000_6a_member_pay_rates.sql`
6. `20260721050000_company_time_settings.sql`

Verified end-of-session: `supabase migration list` against prod shows all 21 local files
applied; same against rebuild-test earlier in the session. Prod now carries everything on
`main`.

---

## The wedge bug — RLS `WITH CHECK` root cause (fix: `20260721030000`)

The S84 "clock-out wedge" was not (only) the idempotency issue fixed in `d12641d`. Root
cause, shipped in the original 6A migration: `time_clock_sessions_update_authorized` had
`USING` but **no `WITH CHECK`** — Postgres then re-evaluates USING against the **NEW**
row. The self-edit arm (`member_id = get_my_member_id() AND clock_out IS NULL`)
references the very column a clock-out mutates, so the NEW row (clock_out just stamped)
fails the arm — **every non-Owner/Admin self clock-out was rejected**, deterministically.
The segment-end step passed (its predicate references no mutated column), the session
close died → the "segment ended / session still open" wedge was *manufactured by RLS*.

Fix: keep USING as-is (OLD-row openness still gates which rows are touchable); add an
explicit `WITH CHECK` whose self-arm drops `clock_out IS NULL`. Nothing is given away —
the column-scope trigger (migration `20260721010000`) still restricts self-edits to
`clock_out NULL→value`, `gps_out`, and the soft-delete pair. `584eb01` also added the
close-only recovery path (`closeSessionOnly`) for sessions already wedged.

**Lesson for every future UPDATE policy: if USING references a column the UPDATE itself
mutates, an explicit WITH CHECK is mandatory.**

---

## Also shipped

- **TZ threading (`9c0a537`)** — S84 bug 2 closed properly: `companies.timezone` threaded
  through all `fmtTime` call sites + the date header + the timeclock page (which now
  fetches company settings server-side); hardcoded `America/New_York` removed.
- **Global clock button + timesheets nesting (`5cc6d64`)** — header strip in
  `DashboardShell` with live clock state; clock flows extracted to shared
  `components/time/clock-modal.tsx`; Timesheets moved to
  `/dashboard/timeclock/timesheets` (tab strip, supervisor-only) with redirect stubs at
  the old `/dashboard/timesheets*` URLs.
- **Pay rates (`1075c88`, migration `20260721040000`)** — the S85 owed backend, per the
  locked interview decisions: `member_pay_rates` is **effective-dated** (company-tz
  calendar DATE, applies forward — a mid-week raise legitimately splits the week);
  Owner/Admin-only RLS, deliberately NOT a column on company-readable `company_members`
  (Financial Visibility Floor). `time_session_rate_snapshots` **freezes the rate at
  approval time** — approved sessions price from their snapshot forever; backdated rate
  changes touch only unapproved/future sessions; a session approved with no rate on file
  freezes NULL and never reprices (decision 5). OT pricing is derived at read time
  (`weekLaborCost`): threshold hours straight, later hours 1.5x, **chronological
  attribution** — OT prices at the rate of the day it falls on. Rate manager UI on the
  team detail page; Labor Cost (wk) KPI is now real for Owner/Admin with
  priced-members-coverage reporting.
- **Company time settings (`b5dd058`, migration `20260721050000`)** — the batched
  Company Settings pass, five columns on `companies`: `week_starts_on` (0–6, default
  Monday; Sun/Mon in UI), `ot_threshold_hours` (numeric(5,2), default 40), `breaks_paid`
  (default false), `paid_break_cap_minutes` (default 30), `gps_clock_mode`
  (`off|capture|enforce`, default capture — desktop honors `off` by not capturing;
  `enforce` is mobile-future). Read via `getCompanyTimeSettings()` (generalizes
  `getCompanyTimezone()`); new "Time Tracking" card on the Owner+Admin settings page with
  the re-bucketing and legal-review captions. **`paidHours()` per-session cap divergence
  fixed**: new `paidHoursPerSession()` applies the paid-break cap PER COMPANY-TZ DAY
  (shared allowance, chronological grant) — queue, weekly summary, and day detail all use
  it. Daily OT threshold (6A open item #4) deferred entirely — no column.
- **SPEC AMENDMENT — `admin_timeclock_enabled` DROPPED (Josh).** 6A-spec §4/§8/§13
  promised an Admin-timeclock company gate (default OFF). Not built, won't be: timeclocks
  are always available to every role. Supersede markers in 6A-spec; logged in the 6a
  build report S86 addendum. Admin hours remain Owner-only-approvable via strictly-below.

---

## Decisions locked this session

1. **CLAUDE.md standing rule (Platform Modules):** every module spec must include a UI
   section (screens, roles, entry points, nav placement) before it is complete; no UI
   build proceeds from a schema/service-only spec. The S85/S86 6A experience (interim nav
   links, reindex owed against a stale handoff) is the failure this prevents.
2. **FFNav reindex: DEFERRED to the 6B UI build**, decisions locked (build report S86
   round-2 addendum): target **12-item** order `Dashboard · Projects · Schedule · Field
   Ops · Timeclock · Contacts · Subs & Vendors · Estimates · Cost Catalog · Settings ·
   Team · Billing`; Timeclock permanent first-class; Settings before Team (ui-01 wins
   over the stale handoff); Field Ops after Schedule, ungated by default. Supersedes the
   S85 "must build 10 items" note (the handoff FFNav predates both the ui-01 Schedule
   item and the S85 timeclock nesting).
3. **Week-start re-bucketing accepted, no effective-dating** — TECH_DEBT **#92**
   documents it (changing `week_starts_on` re-groups history and re-derives OT at read
   time; manual payroll-cutover procedure noted there).

---

## Doc state

- **STATE.md is STALE** — header still says Session 79; its prod-migration claims
  (signed_artifacts unapplied, "7 pending") were superseded by the S83 prod push and are
  now doubly stale after this session's six. Needs a full refresh pass: module 6 row,
  infrastructure/link state, prod migration record.
- **TECH_DEBT.md confirmed at repo root** (`/TECH_DEBT.md`); #92 added this session. Its
  "Last updated" header also lags (says Session 40) — fold into the STATE refresh.
- 6a build report carries two S86 addenda (settings pass + admin-timeclock drop; FFNav
  deferral with locked target).

---

## Newly owed

- **Domain cutover: `rafterworks.com` → Vercel** — point the domain at the Vercel
  project and configure it as the production domain.
- **Login-screen branding** — the dashboard shell ships the RafterWorks wordmark, but the
  login screen still says FrameFocus. Rebrand it in the same pass as the domain cutover.

---

## Next session — in order

1. **6C UI spec (handoff 4d), then 6D (4e)** — 6B-1 (4c) already exists; 6E last (its
   acceptance trace is invented — verify against real briefings first).
2. **6B/6C/6D UI build** — carries the FFNav reindex (locked 12-item target) and the
   Field Ops hub route with it.
3. **`feat/module-6bcd` merge decision** once that build lands.
4. STATE.md + TECH_DEBT.md refresh (see Doc state).
5. Domain cutover + login rebrand (newly owed, above).

---

## Environment state at close

- **Branch:** `main`, clean except this context file; `main` == `origin/main` (deployed).
- **CLI: linked to PROD `jwkcknyuyvcwcdeskrmz`** — relink to rebuild-test
  (`nmyphyhmfttxkdoposvf`) before any test-data or experimental migration work.
- **Migrations:** prod 21/21, rebuild-test 21/21 — in sync with the repo, nothing pending
  anywhere.
- **Types:** `database.ts` on main includes the S86 columns (hand-mirrored at build, then
  migration applied). Belt-and-suspenders: run `npm run db:push` once against prod and
  confirm zero diff on `database.ts`.
