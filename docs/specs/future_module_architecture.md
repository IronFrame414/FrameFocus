# FrameFocus — Future Module Architecture & Planning

> **Status:** Planning document. Lives OUTSIDE the repo until promoted to `docs/architecture/`.
> **Purpose:** Architecture only — not specs. The path is **Architecture → Interview → Spec → Build.**
> **Sources confirmed this session:** `CLAUDE.md`, `CLAUDE_MODULES.md`, `STATE.md`, `docs/module4-architecture.md` (exists), Module 5 architecture (design authority, provided), and the roadmap docx. `git` is ground truth over all context files.

---

## 1. How to read this document + module map

Defines boundaries, data models, RLS, and integration points for modules after the current Estimating build. Stops short of being a spec — a spec is written only after the interview gate (§2) clears for that specific module.

### Module map (confidence-flagged — do not over-trust unverified rows)

Verified against `FrameFocus_Platform_Roadmap.docx` (authoritative, 11 modules) this audit.

| #   | Module                         | Status                                                  |
| --- | ------------------------------ | ------------------------------------------------------- |
| 1   | Settings, Admin & Billing      | built                                                   |
| 2   | Contacts & CRM                 | built                                                   |
| 3   | Document & File Management     | in progress (some features deferred)                    |
| 4   | Sales & Estimating             | current build (4D/4E built on unpushed branch)          |
| 5   | Project Management             | not started — architecture doc is design authority      |
| 6   | Team & Field Operations        | not started — designed (this doc)                       |
| 7   | Job Finances                   | confirmed                                               |
| 8   | Inventory & Tools              | confirmed                                               |
| 9   | **Customer Experience Portal** | confirmed — **client Decision Gate clears before this** |
| 10  | Reporting & Analytics          | confirmed                                               |
| 11  | AI Marketing & Social          | confirmed (premium add-on)                              |

> **Audit correction:** M10 = **Reporting & Analytics** (was wrongly AI Marketing); **M11** = AI Marketing & Social. The client-facing module is **M9** (earlier-session correction stands).

> **Pre-Module 9 Decision Gate — unresolved product fork (from the roadmap).** M9 build is blocked until two questions resolve: (1) a **client-experience pivot** — possibly replace the hosted portal with email + magic-link tokenized pages + webhook sync to the company's own website (Is the portal FrameFocus, the company's site, or both? What replaces client messaging if clients don't log in? Magic-link signing on all tiers or Business only? Where does invoice payment live?); (2) a potential **Module 12 — outbound webhook system**. The magic-link mechanism overlaps the §5.1 subcontractor invite — design them together.

---

## 2. The Interview-First Mandate (READ BEFORE ANY SPEC)

**No spec file is written for any module until a structured interview for that module is complete and its output approved.** Module 4 was built with gaps that trace directly to specs written ahead of a thorough interview. The interview extracts the founder's domain knowledge before it gets expensive to discover.

### Interview procedure (per module)

1. **Open with intent, not questions** — state what the module is for and what it integrates with, then interview using decision tables with recommended defaults (accept-or-override).
2. **Cover five axes:** Data & schema · UI/UX & controls (every configurable field needs a control or explicit deferral) · **Real workflow fidelity** (§2a) · Edge cases · Tradeoffs the founder may not have considered.
3. **Sequential rounds with explicit approval gates** — one round, approve/override, next. No bundling.
4. **Worked examples before build** — any calculated/conditional output gets a worked example per variant before any code.
5. **Only then** write the spec in `docs/specs/`, kebab-case, no spaces, no nested duplication.

### §2a. The workflow walk-through (required step)

For each **important part**, before its spec:

1. Founder narrates the real workflow in plain language ("on a real job I first… then…"), including the messy parts and actual values typed.
2. Claude mirrors it back as a concrete trace: `enters X (fields, units) → stores Y → produces Z`, with real-looking numbers.
3. Founder corrects the trace until it matches reality.
4. The approved trace goes into the spec verbatim as the acceptance example. Code is built to the trace.

### The gate, stated plainly

> If you're writing a spec and can't point to the interview round where a decision was made — **stop**, it's being silently invented. And if there's no approved input→store→output trace for an important part, it isn't ready to spec. "Built correctly to spec but not how I operate" is the failure this prevents.

---

## 3. Lessons from Module 4 (Estimating)

1. **A setting with no control is a bug.** `proposal_pricing_level` shipped with no UI to set it → all proposals rendered lump-sum. _Rule:_ every configurable field gets a control or explicit deferral in the interview.
2. **Conditional output needs a worked example from real input** _(M4 Issue 1)_. Lump-sum vs. detailed output didn't match intent; built to spec, but the spec didn't pin down what each view produces. _Rule:_ approved input→output trace in the spec (§2a) before build.
3. **Upstream model changes ripple downstream — name the contracts early.** M5 verifications need re-running against the new line model. _Rule:_ list every cross-module data contract at architecture time; re-verify downstream when an upstream model changes.
4. **Spec file hygiene is enforced.** A spec was saved at a broken nested path. _Rule:_ `docs/specs/<module>-<topic>.md`, kebab-case, verified with `ls`.
5. **No silent design decisions.** Any spec/schema conflict is flagged for founder decision (e.g., this session's `profiles.id` vs `profiles.user_id` catch).
6. **"Correct to spec" is not "correct"** _(M4 Issue 2 — rate/sub entry)_. Built correctly against the info given, but the entry workflow didn't match how the founder works. _Rule:_ important parts require the §2a walk-through; acceptance = "matches how I operate."

---

## 4. Shared conventions every module inherits

Confirmed from `CLAUDE.md`. Module sections assume these; only deviations are called out.

- **Multi-tenancy/RLS:** every per-tenant table has `company_id UUID NOT NULL REFERENCES companies(id)`; RLS on ALL tables; regular tables use `get_my_company_id()`.
- **Storage RLS:** do NOT use the helper in `storage.objects` — use `(SELECT company_id FROM profiles WHERE id = auth.uid())`. Path: `{company_id}/{project_id}/{filename}`.
- **Profiles:** `profiles.id = auth.uid()` (never `profiles.user_id`).
- **Per-tenant column defaults** (or client INSERTs 403): `ALTER TABLE {t} ALTER COLUMN company_id SET DEFAULT get_my_company_id();` plus created_by/updated_by.
- **Naming:** columns `snake_case`; indexes `idx_{table}_{column}`; policies `{table}_{action}_{role}`.
- **Standard columns:** `id, company_id, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at`. Append-only logs omit the audit/soft-delete columns and have only SELECT+INSERT.
- **Soft delete** filtered in the service layer, not RLS.
- **SECURITY DEFINER** RLS-bypass triggers use SQL (not plpgsql) functions.
- **Platform admins** in `platform_admins`, no `company_id`, `/admin`.
- **AI principle:** AI drafts, humans approve — nothing client-facing or financial sent without owner review (M9/M10 etc.).

---

## 5. Cross-module decisions & amendments (consolidated)

### 5.1 FOUNDATION — Subcontractor-as-user (`company_members`) — DECIDED, deferred implementation

**Must land before Module 5 / 5A builds (hard sequencing constraint).** A subcontractor is a first-class assignable identity from creation; a login is optional, provisioned via the existing invite flow.

- **Model:** a `company_members` table = the single "assignable person" (crew + subs). Every assignment target references `member_id` — **no assignment polymorphism anywhere.**
- **`profiles` unchanged** (`profiles.id = auth.uid()`, profile = a real login); a profile links to a member. Crew = member + profile from creation. Sub = member at contact-creation with no profile; invite later creates the profile, links it, assigns a new `subcontractor` role.
- **Rejected:** dormant auth account per sub (pollutes auth/billing, touches the auth invariant).
- **Touches built M1:** new `subcontractor` role (limited: self clock-in, view own assignments, photo upload); sub-user seat/billing treatment (default: no paid seat); reuse invite infra.
- **Touches built M2:** contact/`subcontractors` creation auto-creates a linked `company_members` row + optional "send invite."
- **Migration work:** create `company_members`; backfill one member per existing profile; add `get_my_member_id()` helper for assignment RLS.
- **Conscious principle change:** relaxes CLAUDE.md "two completely separate layers of users… should never be confused."

### 5.2 M5 assignment references `member_id`

M5's assignment targets (`project_assignments`, `tasks.assignee_id`, `punch_list_items.assignee_id`, `schedule_entries`) reference `member_id` rather than `profiles.id`. This _replaces_ the earlier "polymorphic assignee" idea — 5.1 makes polymorphism unnecessary. Folds into the 5.1 amendment.

### 5.3 Punch-list cleanup

- `CLAUDE_MODULES.md` §6.4 (Punch Lists) is **stale** — Module 5 §5.9 / sub-module 5C is the design authority (richer: verification step, trade, location, client-visibility flag). Mark 6.4 superseded.
- The rule "all punch items must close before a project can be marked complete" (from old 6.4) is **missing** from M5's project-status lifecycle (§5.2a) — fold it into M5's project-complete logic.

---

## 6. Company Settings — running additions list

**Principle (Josh):** no consolidated settings-expansion exists yet. Collect EVERY new company setting surfaced during planning here and implement them in ONE batched pass — not piecemeal. Use sensible defaults now; build the structure to accommodate future additions.

- **[M6] Overtime rules** — weekly threshold (default 40 hr/wk); optional daily threshold (e.g. > 8 hr/day) toggle + value; extensible to more OT rule types.
- **[M6] GPS clock-in** — capture/enforce toggle, default OFF.
- **[M6] Break tracking** — default paid/unpaid + lunch handling (state-law variance).
- **[M4] Settings already added during Module 4** — enumerate the full set (known: configurable estimate-number prefix; default markup/margin; default tax rate). TODO: confirm complete list from M4.
- (more expected through M7–M10 planning)

---

## 7. Module 6 — Team & Field Operations (reconciled design)

Mobile-first, internal. Reconciles committed `CLAUDE_MODULES.md` §6 with this session's decisions. Punch lists removed (owned by M5). Worker identity = `company_members.member_id`. Depends on M5 (tasks, project_assignments) and M3 (files/markup, reused).

### 7.1 Time tracking — two-table model

> **AMENDED by `docs/specs/6A-spec.md` (§3), Session 63 — the spec wins over this section.** Five amendments below.
> **Correction:** this section previously read "supersedes committed single `time_entries`." **There was never a committed `time_entries` table, type, or migration** — verified by pickaxe across all branches and all history (`git log --all -S "time_entries" -- '*.sql' '*.ts'` → empty; only markdown mentions it). The two-table model supersedes a **planning concept only, never shipped code.**
>
> 1. **`time_clock_sessions.project_id` — REMOVED.** The clock is pure payroll, independent of any project; this is what lets one paid day span two job sites without a second clock-in. All project attribution moves to segments. (6A §3.1)
> 2. **`task_time_segments` → renamed `time_segments`**; it gains **`segment_type`** and **`project_id`**, and `task_id` becomes **nullable**. It no longer describes only task work — it holds travel, breaks, material runs, and taskless verbal work. (6A §3.2)
> 3. **`time_clock_sessions.category` — REMOVED.** Its values split: `travel`/`drive`/`shop` became `segment_type` values; `overtime` is **derived** from weekly paid hours and never user-selected; `regular` alone is not an enum. This **resolves** the "category grain" open question below — the grain is neither session nor segment, because OT is a property of **hours**. (6A §3.3)
> 4. **`break_minutes` / `break_paid` — REMOVED from the session.** A break is a `segment_type`; a session-level break number floats outside the segment chain and breaks the reconciliation invariant. (6A §3.4)
> 5. **Approval is HIERARCHICAL, not flat** (strictly-below, no self/peer approval, PM included, Owner has no timeclock) — reverses the flat-approval rule below and the §7.9 divergence entry. (6A §3.5, §8)

Both tables offline-ready (client-generated UUIDs, device timestamps).

**`time_clock_sessions`** — paid hours (payroll truth); never altered by task activity.
`member_id` · ~~`project_id`~~ **[DEAD — removed, 6A §3.1]** · `clock_in` · `clock_out` · ~~`category`~~ **[DEAD — removed, 6A §3.3; OT is derived, not a column]** · ~~`break_minutes`, `break_paid`~~ **[DEAD — removed, 6A §3.4; break is a `segment_type`]** · `gps_in`, `gps_out` (nullable; only if company enables GPS) · approval `status` (pending→approved), `approved_by`, `approved_at` · `qb_export_status` stub (M7) · standard columns.

**`task_time_segments` → `time_segments`** (renamed, 6A §3.2) — cost allocation, NOT payroll; nested in a session.
`session_id` · **`segment_type`** (`work|material_run|warranty|travel|shop|break` — NEW, 6A §3.2) · **`project_id`** (gated by `segment_type` — NEW, 6A §3.2) · `task_id` (**now nullable**; assigned to the member OR unassigned) · `segment_start`, `segment_end` · `completion` (complete|incomplete; required iff `task_id IS NOT NULL`) · `note` TEXT (mandatory on end for every type except `break`) · standard columns.

**Locked rules:**

- Paid hours = clock session; task activity never changes them.
- Task switch = end current segment (completion + mandatory note), optionally start another. ~~gaps allowed (clocked in, no active task).~~ **[DEAD — 6A §6/§7: clock-in opens the first segment, there is no clocked-in-with-no-segment state, and segments are contiguous/non-overlapping with Σ segment durations = session duration. Gaps are NOT allowed.]**
- Marking a segment complete writes task status → Complete in M5 (cross-module write).
- ~~Approval is **flat**: any Foreman/Owner/Admin can approve any member's hours. PM is **not** an hour-approver.~~ **[DEAD — superseded by 6A §8. Approval is HIERARCHICAL (`Owner > Admin > PM > Foreman > Crew`): approve strictly below you, no self-approval, no peer approval. PM approves Foreman/Crew. Owner has no timeclock; Admin's hours (setting ON) are approvable by Owner only.]**
- OT ~~auto-flag~~ **derived at read time** from weekly paid hours (default 40 h/wk threshold, §6); **never stored** on a session or segment (6A §9).
- QuickBooks: schema-ready now; connector built with M7. No half-integration in M6.
- Mileage: deferred to v2 (standalone `mileage_entries`, low re-work later).

**Open spec/§2a questions:** ~~category grain (per-session vs. intra-day spans — lean per-session)~~ **[RESOLVED — 6A §3.3: neither; OT is a property of hours.]** ~~self-approval (may a Foreman approve own hours?)~~ **[RESOLVED — 6A §8: no self-approval, ever.]**

### 7.2 Daily logs

> **AMENDED by `docs/specs/6B-spec.md` (§3), Session 63 — the spec wins over this section.** Four amendments:
> 1. **"One per project per day" — DEAD/REMOVED.** Multiple daily logs may exist for the same project on the same date (Josh: "no harm in having more than 1"). Creator-only-edit survives; "highest-ranking person on site writes it" reverts to a Bishop convention, not a system constraint — no rank gate. (6B §3.1)
> 2. **Crew present derives from `time_segments`, NOT clock-ins.** 6A removed `project_id` from `time_clock_sessions`, so a clock-in no longer knows its project; instead, distinct members with a segment on this project on this date. (6B §3.2) — the "auto-fills from that day's clock-ins" rule below is DEAD.
> 3. **Hours are derived, not typed.** Employee hours are read-only, computed from `time_segments` (6A owns hours) — a typed field would be a second source of truth. **Subcontractor hours and notes are manual.** (6B §3.3)
> 4. **"Materials delivered" is not a typed field** — 6D owns the delivery record; 6B renders that project-day's deliveries **read-only**. (6B §3.4, §6.3)
>
> **New fields (from the interview, not in this doc or `CLAUDE_MODULES.md` §6.2):** `material_used`, `material_needed`, `equipment_used` (free text), `tasks_tomorrow`. **Weather stays MANUAL** — an auto-fetch was considered and rejected (no weather vendor in-stack; needs the project address; no offline path). (6B §3)

~~One per project per day~~ **[DEAD — amendment 1; multiple allowed]**; any member may author. Committed fields (weather, work performed, materials, issues) + hazard checkbox/notes + photos auto-pulled from the day + voice-to-text + end-of-day auto-PDF to M3. Offline-ready.

- **Crew present:** ~~auto-fills from that day's clock-ins~~ **[DEAD — amendment 2; derives from `time_segments`]**; editable.
- **Edit rights:** only the creator can edit. **[6B §8: a PM who arrives after a Crew member wrote the log cannot edit it — the PM writes their own log instead (a consequence of amendment 1).]**
- **Locking:** never locks (always editable). Accepted consequence: first author owns their log. End-of-day PDF is a point-in-time snapshot. **[6B §9: two logs on the same project-date produce two PDFs, same date, filename disambiguated by author; regenerate-on-edit vs. version-on-edit is open — 6B §11 item 2.]**

### 7.3 Safety incident reporting

Formal incident form, separate from the daily-log hazard flag; OSHA fields; auto-PDF to M3; company-wide incident log.

- **Who can file:** any assigned member. **Notifications:** Owner, Admin, assigned PM, **and Foreman**. **Project link:** optional (`project_id` nullable) — shop/yard incidents allowed.

### 7.4 Material deliveries

> **AMENDED by `docs/specs/6D-spec.md` (§3.1), Session 63 — the spec wins over this section.** **Delivery check-in is NOT gated by project assignment.** The "any assigned member" rule below is DEAD — **any company member may check in a delivery on any project they can see** (Josh, Session 63). The person who happens to be on site signs for the truck.

Both scheduled and walk-up arrivals. **Who checks in:** ~~any assigned member~~ **[DEAD — any member who can see the project; not assignment-gated, 6D §3.1]**. Contents via packing-slip photo OR typed list; discrepancies flagged. **M8 hook:** discrepancy → Inventory & Tools return flag stored now, consumed when M8 is built.

### 7.5 Crew briefing / huddle

> **RECONCILED with `docs/specs/6E-spec.md`, Session 63 — where they differ, the spec wins.** The "huddle" description here is superseded on three points:
> - **Not a task list of its own.** 6E authors **no** tasks — it displays yesterday's 6B `tasks_tomorrow` **read-only** (6E §5, §1 out-of-scope). The "morning task list pushed to crew" framing is superseded; the briefing carries a free-text `safety_topic` and free-text `plan_notes`.
> - **Who can create:** ~~Foreman/PM/Owner/Admin~~ — **any member, on any project they can see** (6E §4). Superseded.
> - **No acknowledgment tap.** Attendance is **hand-checked from the project roster** (a briefing happens before anyone clocks in, so there are no `time_segments` to read yet), not an ack tap. **Members only — no typed-in outsiders** (6E §3.1, §3.2). No email, no PDF, no signatures (6E §1). The record's value is proof a safety topic was delivered and evidence of who heard it (6E §2).

Optional morning briefing: a free-text safety topic + plan notes, with hand-checked attendance from the roster, plus a read-only view of yesterday's 6B tasks. **[Original text — "Optional morning task list + safety note pushed to crew; who can send Foreman/PM/Owner/Admin; optional ack tap captured (not required to clock in)" — superseded per the note above.]**

### 7.6 Photo markup

Reuse the Module 3 markup component unchanged. No new build.

### 7.7 Offline

Sync engine deferred to v2. v1 is offline-READY only (append-friendly events, client UUIDs, device timestamps).

### 7.8 M6 table set (reconciled)

`time_clock_sessions`, `task_time_segments`, `daily_logs` (extended), `safety_incidents`, `material_deliveries`, `crew_briefings` (+ optional ack). Dropped from v1: `mileage_entries` (→ v2). All per-tenant, `member_id`-based, offline-ready where applicable; photos/markup reuse M3.

### 7.9 Conscious divergences from the platform roadmap (by decision, not drift)

> **AMENDED by `docs/specs/6A-spec.md` (§3.5, §8, and the §3 consequence note), Session 63.** The flat-approval divergence below is retired — see the first bullet.

- ~~**Flat hour-approval** (any Foreman/Owner/Admin) replaces the roadmap's two-tier chain (Foreman→PM/Admin→Owner). PM is not an approver.~~ **[DEAD — reversed by 6A §8.** Approval is now **hierarchical**: `Owner > Admin > PM > Foreman > Crew`; approve strictly below you, no self-approval, no peer approval. **PM is included** (approves Foreman, Crew); **Owner has no timeclock** so no one approves an Owner; Admin's hours (setting ON) are approvable by Owner only. This **substantially returns** to the committed `CLAUDE_MODULES.md` §6.1 two-tier chain rather than diverging from it, so it is no longer a "conscious divergence."]
- **Offline sync engine deferred to v2** — roadmap describes offline-first as in-scope; v1 ships offline-_ready_ only.
- **Mileage deferred to v2** — roadmap lists it in M6 scope.
- **Punch lists owned by M5** — roadmap §6.4 _and_ `CLAUDE_MODULES.md` §6.4 both still place them in M6; the M5 architecture doc (newer) is the authority.
- Sub costing: M2 `subcontractors` already carry `default_hourly_rate` / `default_markup_percent` — reuse for M6/M7, don't re-invent.

---

## 8. Modules 7–10+ — not yet worked (interview-first)

Each gets its own interview (§2) before any spec. At architecture time, flag the parts needing a §2a walk-through.

- [ ] Module 7 — Job Finances (budget actuals, invoicing, pay apps, CO budget impact, QuickBooks connector, AIA/G702-G703)
- [ ] Module 8 — Inventory & Tools
- [ ] Module 9 — Customer Experience Portal _(Pre-Module 9 Decision Gate must clear first — see §1)_
- [ ] Module 10 — Reporting & Analytics
- [ ] Module 11 — AI Marketing & Social (premium add-on)
- [x] Module list/numbering verified against `FrameFocus_Platform_Roadmap.docx` (this audit)

---

## 9. Cross-cutting systems

- [ ] AI Layer (pgvector for estimating; GPT-4o drafting for M9 client summaries, M10 reporting insights, M11 marketing)
- [ ] Workflow Automation Engine (Supabase DB webhooks → Edge Functions; built P2, extended P3)

---

## 10. Open tracked items (consolidated checklist)

**Before Module 5 builds:**

- [ ] Implement `company_members` foundation (§5.1) + the `subcontractor` role + M1/M2 changes + `get_my_member_id()`.
- [ ] M5 assignment tables reference `member_id` (§5.2).

**Module 4 finish-out (carryover from prior sessions — separate from this planning):**

- [ ] Output-data issue feeding lump-sum vs. detailed proposal (confirm on test).
- [ ] Push `feature/4d-revision`; set Vercel env vars; configure Resend webhook.
- [ ] Per-estimate `proposal_pricing_level` control (verify).
- [ ] Spec-file path cleanup; re-run M5 "Group B" grep verifications vs. new line model.

**Cleanup / verification:**

- [ ] Mark `CLAUDE_MODULES.md` §6.4 superseded by M5 §5.9 (§5.3).
- [ ] Fold punch-close-before-complete gate into M5 project-complete logic (§5.3).
- [ ] Enumerate full M4 company-settings set (§6).
- [x] Module numbering verified against Platform_Roadmap.docx (this audit): M10 = Reporting, M11 = AI Marketing.
- [ ] Amend the M5 architecture doc: assignment targets → `member_id` (record in its own §5.13 amendment tracking).
- [ ] Refresh `STATE.md` after pushing `feature/4d-revision` — it currently shows "4D NEXT" but 4D/4E are built.
- [ ] Verify M3 photo-markup component is complete before M6 build (M6 §7.6 reuses it; roadmap shows M3 "in progress").
- [ ] When M9 planning starts: resolve the Pre-Module 9 Decision Gate (portal vs. magic-link/webhook; potential M12) — design alongside the §5.1 sub-invite mechanism.

— End —
