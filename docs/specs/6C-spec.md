# 6C — Safety Incidents — Spec (DRAFT, for review)

> **Design authority:** `docs/specs/future_module_architecture.md` §7.3 / `CLAUDE_MODULES.md` §6.3.
>
> **Status:** DRAFT — not built. Acceptance trace (§8) is **VERIFIED** against a real Bishop incident this session.
>
> **Written against stale project knowledge.** All column references are **design-level** — confirm against live schema at build.
>
> **Depends on:** M5 (`projects`), M3 (photos, PDF storage), `company_members` foundation, Resend (notifications). **Not** dependent on 6A or 6B — 6B escalates _into_ 6C, but 6C stands alone.
>
> **Conventions (`CLAUDE.md`):** standard columns; per-tenant triggers; RLS via `get_my_company_id()`; identity via `get_my_member_id()`; server/client service split.

---

> ## ⚠️ AS-BUILT RECONCILIATION vs. 6A (added this pass — verified against migrations, not spec prose)
>
> Checked against 6A (`supabase/migrations/20260710130000_module6_6a_time_tracking.sql` on `feat/module-6a`, read via `git show`) and the M5 `change_orders` (5D) / projects (5A) migrations. 6C does not read 6A's tables (correct — it stands alone), but it inherits the same **identity/audit** and **RLS** conventions 6A established, and drifts from them below. Each is flagged **[DRIFT]** at the point of use.
>
> 1. **Domain reporter ≠ audit column.** `created_by` / `updated_by` are audit columns defaulting to `auth.uid()` (FK `auth.users`), in 6A and in `change_orders` (5D). The "who filed this" identity is a separate `*_member_id` column defaulting to `get_my_member_id()` (FK `company_members`) — `change_orders.author_member_id` is the reference. **This spec's "`created_by` = reporter" / "`created_by = get_my_member_id()`" is a [DRIFT].** See §2 and §5.
> 2. **Read-visibility helper exists; 6C now aligns with it.** M5 ships `can_view_project()` = "owner/admin see all **OR** the caller is assigned," i.e. **PM/Foreman are assigned-only**. This spec originally granted PM/Foreman company-wide incident read — that **[CONFLICT] is RESOLVED (Josh, this session): assigned-only, matching `can_view_project()`**. PM/Foreman (and Crew) read incidents only on projects they are assigned to; Owner/Admin read all. See §5 / Q2.
> 3. **`num_nonnulls()` is Postgres-native and unused elsewhere in this repo's migrations** (verified). The §2.1 conditional CHECKs are valid SQL; kept as-is. Still tracked as open item #8.
> 4. **Acceptance trace is VERIFIED** — walked against a real Bishop incident this session (§8, status line). The earlier "stays PROPOSED / NEEDS INTERVIEW" note was stale.

---

## 1. Scope

The formal record of something that actually happened: injury, property damage, or near miss. Distinct from 6B's hazard _flag_, which records a concern (6B §7).

**In scope (v1):** incident creation + edit; injured parties (members or outsiders, one row each — §2.1); witnesses (members or outsiders); treatment captured per injured party; photos; auto-PDF to M3; email notification to Owner/Admin/PM/Foreman; an incident log scoped by read-visibility (Owner/Admin see all; PM/Foreman/Crew see incidents on assigned projects — §5); pre-fill from a 6B hazard flag.

**Out of scope:**

- **OSHA 300 recordkeeping** (§6). No days-away, job-transfer, or restricted-duty columns. **OSHA compliance is handled outside the app in v1.**
- **Follow-up timeline** (§5). Treatment is captured once as fields on the injured-party row (§2.1), not an evolving multi-row follow-up log. Josh: "no follow up for now."
- **Workers' comp / insurance claim workflow** — later, and likely Module 7-adjacent.

---

## 2. `safety_incidents`

```sql
safety_incidents
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
project_id UUID REFERENCES projects(id) -- NULLABLE [AMENDED S88 — live schema is ground truth]: a shop/yard incident has no project. RLS: null-project incidents read by supervisors + the reporter.
incident_date DATE NOT NULL
incident_type TEXT NOT NULL -- 'injury' | 'property_damage' | 'near_miss'
description TEXT NOT NULL
prevention_notes TEXT -- nullable [S87]: corrective/preventive action taken
status TEXT NOT NULL DEFAULT 'open' -- [S87] enum, e.g. 'open' | 'closed' — Owner/Admin-editable; enum home per §9 #1
outcome TEXT -- nullable [S87]: resolution narrative — Owner/Admin-editable
pdf_file_id UUID REFERENCES files(id) -- M3
reported_by_member_id UUID NOT NULL DEFAULT get_my_member_id() REFERENCES company_members(id) -- domain reporter (§5)
-- standard columns (created_by / updated_by are AUDIT = auth.uid(), NOT the reporter)
```

- **[DRIFT — corrected]** the reporter is **`reported_by_member_id`** (a `company_members` FK defaulting to `get_my_member_id()`), **not** `created_by`. `created_by`/`updated_by` are audit columns defaulting to `auth.uid()` (FK `auth.users`), per 6A and `change_orders.author_member_id` (5D).
- `incident_type` is a CHECK-constrained enum. See §9 open item #1.
- Never locks. Editable by creator (§5), because treatment is usually learned a day later.
- **[S87]** `prevention_notes` is free text — what was done so it doesn't happen again.
- **[S88]** Photos are **incident-bound** via `files.safety_incident_id` (nullable FK, `ON DELETE SET NULL`, migration `20260722010000`), `category 'safety'`, `client_visible` false — mirroring 6B's log-bound rule. v1: photo attach requires a project (file paths are project-keyed); shop/yard incidents record without photos.
- **[S88]** Creation is atomic via `create_safety_incident()` (SECURITY INVOKER, migration `20260722020000`) — the injury invariant is a DEFERRED constraint trigger, so the incident and its injury rows must commit together.
- **[S87]** `status` + `outcome` track resolution. These two fields are **Owner/Admin-editable**
  (an exception to the creator-only edit rule in §5 — closing out an incident is a leadership
  act, not a reporter act). The automated 2-day follow-up prompt discussed alongside them is
  **DEFERRED** — scheduler infrastructure doesn't exist; see §9 open item #10.

### 2.1 `safety_incident_injuries` — injured party (member or outsider)

A single incident can hurt more than one person, so injured parties are a **child table**, not columns on `safety_incidents`. Treatment is captured **per injured person**.

```sql
safety_incident_injuries
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
incident_id UUID NOT NULL REFERENCES safety_incidents(id) ON DELETE CASCADE
member_id UUID REFERENCES company_members(id) -- nullable
injured_name TEXT -- nullable
treatment_sought BOOLEAN NOT NULL DEFAULT false
treatment_notes TEXT
-- standard columns
CHECK (num_nonnulls(member_id, injured_name) = 1)
```

Junction table mirroring `safety_incident_witnesses` (§2.2) — exactly one of `member_id` / `injured_name` per row, so member-or-outsider stays consistent across the two tables (they must not drift on who counts as a person).

`treatment_notes` is free text (e.g. `"Urgent care, stitches."`). Costs, co-pays, and clinic names are **not** structured in v1.

Rationale: the homeowner who trips over an extension cord is the incident most worth recording, and will never appear in the roster — this table is where such outsiders live.

> **Injury invariant (cross-table).** `incident_type = 'injury'` ⇒ **at least one** `safety_incident_injuries` row. This replaces the old column-level "an injury must name someone" CHECK, which can no longer be expressed on `safety_incidents` now that injured parties are a separate table. Enforce as a **build-time invariant (application logic or a trigger)**, not a column CHECK. See §9 open item #9.

### 2.2 `safety_incident_witnesses`

```sql
safety_incident_witnesses
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
incident_id UUID NOT NULL REFERENCES safety_incidents(id) ON DELETE CASCADE
member_id UUID REFERENCES company_members(id) -- nullable
witness_name TEXT -- nullable
-- standard columns
CHECK (num_nonnulls(member_id, witness_name) = 1)
```

Junction table, mirroring `daily_log_crew`. Same member-or-outsider rule as §2.1 — two tables that disagree about who counts as a person will drift.

> **Build note.** An optional witness list is usually an empty witness list, and an empty list reads as _"nobody saw it."_ The form should **ask** ("Was anyone else present?") rather than render a blank grid. Not schema — UI.

---

## 3. Escalation from 6B

When a daily log's `hazards_present` is ticked, 6B surfaces a **"File an incident report"** action that opens 6C pre-filled with `project_id` and `incident_date`. The hazard flag stays on the log; the incident is a separate record. No FK links them in v1.

---

## 4. Notification

**[AMENDED S87/S88 — HIERARCHY, not a flat role list.]** Every incident, regardless of type or severity, emails **everyone whose role is strictly above the submitter's**, within the supervisory set (Owner/Admin/PM/Foreman): crew- or sub-filed → Foreman + PM + Admin + Owner; foreman-filed → PM + Admin + Owner; PM-filed → Admin + Owner; Admin-filed → Owner. **Floor: an Owner-filed incident notifies Admin(s)** — no incident is ever silent. This supersedes the earlier flat "Owner, Admin, PM, Foreman" wording (and the 6B §7 cross-reference inherits this rule). Rank source: the shared `ROLE_HIERARCHY` constant.

**Notification is independent of read-visibility (§5):** a recipient in the hierarchy is notified of every qualifying incident — including one on a project they are **not** assigned to and therefore cannot browse in the incident log. The email reaches them; the log listing stays assigned-scoped.

Sent via Resend, from `companyname@rafterworks.com`, per the existing convention. Failure to send must not roll back the incident insert.

**On send failure (Josh, this session): log the failure _and_ surface a retry affordance to the Owner.** Silent-log is rejected — a swallowed email on an injury means the Owner never learns it happened. The retry is Owner-visible, not a background-only reattempt, so the failure cannot pass unnoticed. (Resolves §9 item #5.)

**[S87]** Email + the hierarchy rule above stand as-is for v1. **Future:** prep for mobile push notifications — when the mobile app ships, push supplements (does not replace) email.

---

## 5. Permissions & RLS

- Company-scoped: `company_id = get_my_company_id()`.
- **Create:** any member, on any project they can see.
- **Edit:** **reporter OR Owner/Admin** — **[AMENDED S88, live RLS is ground truth]**: the shipped `safety_incidents_update_authorized` policy grants Owner/Admin full row edit, not a status/outcome-only carve-out (consistent with the 6B S87 decision and the Admin-role principle). Keyed on **`reported_by_member_id = get_my_member_id()`**, not `created_by` (the audit `auth.uid()` column, §2). Treatment details arrive late; the record never locks. The `status`/`outcome` **controls** are UI-gated to Owner/Admin (§2 [S87]).
- **Read:** **[RESOLVED — assigned-only via `can_view_project()`]** Owner/Admin read **all** company incidents; **PM/Foreman and Crew read only incidents on projects they are assigned to**, via `can_view_project(project_id)`. This aligns 6C with M5 content-visibility — no divergent rule. (Josh, this session: safety incidents get **no** broader read grant than ordinary project content. What reaches leadership about an injury on a project they cannot browse is the **notification**, not the log listing — see §4. Q2.)
- **Delete:** soft-delete, Owner/Admin only. An incident a crew member can erase is not a record.

---

## 6. OSHA — explicit non-goal in v1

`CLAUDE_MODULES.md` §6.3 refers to "OSHA fields." **This spec does not implement them.** The OSHA 300 log requires days-away and restricted-duty counts, which require the follow-up timeline deferred in §1.

> **Legal exposure.** OSHA recordkeeping obligations depend on company size, state plan, and injury classification. This is **not** something to hand-author from a spec. Route to a professional (insurer or safety consultant) before marketing 6C as an OSHA solution.

---

## 7. PDF

- One PDF per incident, filed to the project's **Safety** folder in M3.
- Generated on create. Because incidents never lock, an edited incident's PDF goes stale — **regenerate (overwrite) on edit.** Josh, this session. Edits only ever add data (treatment learned later, a witness remembered); nothing is deleted, so one always-current PDF is correct and there is no versioning. The stored PDF is replaced in place on every edit.
- Generation reuses React-PDF (per repo tooling).

---

## §U — Desktop UI [S87]

Added per the CLAUDE.md spec completeness rule (2026-07-20): no UI build proceeds from a
schema/service-only spec.

- **Screens:** M6 UI handoff **4d** — company incident log + incident detail. Entry point:
  **Field Ops** nav item → **Safety** tab, per the locked 12-item FFNav order
  (`docs/sessions/6a-ui-build-report.md` S86 round-2 addendum).
- **Create/edit form:** desktop (path A — no handoff design; the handoff defers entry forms to
  mobile). Built now as the foundation for the future mobile capture surface.
- **Roles:** mirror §5 — Owner/Admin see all company incidents; PM/Foreman/Crew assigned-only
  via `can_view_project()`. Create: any member on a visible project. Edit: creator only, except
  `status`/`outcome` (Owner/Admin — §2). Delete: Owner/Admin soft-delete.

---

## 8. Acceptance example — VERIFIED

> Confirmed against a real Bishop incident this session: two employees on site; one slipped off a platform and cut his hand on metal framing; urgent care, stitches; co-pay paid by Josh.

**INPUT** — On project _Stevens_, `2026-01-15`, Josh opens an incident.
`incident_type = 'injury'`. Description: `"Slipped off platform, cut hand on metal framing."`
Injured party: selected from roster — the injured employee.
Treatment: `treatment_sought = true`, notes `"Urgent care, stitches."`
Witness: the second employee on site, selected from roster. Photos attached.

**STORE** — One `safety_incidents` row: `project_id`, `incident_date = 2026-01-15`,
`incident_type = 'injury'`, `description`, `created_by = <Josh>` — **no injured or treatment columns; they live in §2.1 now.**
One `safety_incident_injuries` row: `member_id = <injured employee>`, `injured_name` NULL,
`treatment_sought = true`, `treatment_notes = 'Urgent care, stitches.'`.
One `safety_incident_witnesses` row: `member_id = <second employee>`, `witness_name` NULL.
Photos stored per M3. No OSHA columns.
The injury invariant (§2.1) is satisfied — one injury row exists for an `injury`-type incident.

**OUTPUT** — Incident appears in the company-wide incident log.
Email fires to Owner, Admin, PM, Foreman.
PDF generated and filed to Stevens → Safety.
Had this been opened from a daily log's hazard flag, `project_id` and `incident_date` would have arrived pre-filled (§3).

---

## 9. Open items

| #   | Item                                                                                                                                                                           | Owner    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | `incident_type` enum — declare it once. The `row_type` enum is already hand-declared in five separate files; do not repeat that here. Not currently tracked in `TECH_DEBT.md`. | 6C build |
| 2   | **RESOLVED** — PDF regenerate (overwrite) on edit; no versioning (§7). Edits only add data, so one always-current PDF is correct.                                              | Closed   |
| 3   | **RESOLVED** — acceptance trace (§8) verified against a real Bishop incident this session.                                     | Closed   |
| 4   | Crew read-visibility depends on the M5 §5.2a decision actually shipping as recommended.                                                                                        | Build    |
| 5   | **RESOLVED** — on send failure: log it **and** surface a retry affordance to the Owner (§4). Silent-log rejected — a swallowed injury email means the Owner never learns. Insert never rolls back on send failure. | Closed   |
| 6   | OSHA (§6) — confirm with insurer before any OSHA claim is made in marketing.                                                                                                   | Josh     |
| 7   | No FK from a 6B hazard flag to the incident it escalated into. Add later if the link proves useful.                                                                            | Deferred |
| 8   | **RESOLVED [S88]** — `num_nonnulls()` identity CHECKs confirmed live on both party tables (`*_identity_check`).                                                                 | Closed   |
| 9   | **RESOLVED [S88] — DB trigger, as-built.** The invariant ships as DEFERRABLE INITIALLY DEFERRED constraint triggers on both tables (`enforce_injury_has_injured_party`); creation therefore goes through the atomic `create_safety_incident()` RPC (§2). App-level validation duplicates the check for friendly errors only. | Closed   |
| 10  | **[S87] DEFERRED** — automated 2-day follow-up prompt on open incidents (nudge toward `status`/`outcome` closure, §2). Scheduler infrastructure doesn't exist; revisit when it does.  | Deferred |

---

## 9a. Questions for Josh (raised by the 6A as-built reconciliation — resolve nothing silently)

- **Q1 — Reporter identity. CONFIRMED [S87].** The reporter is a `company_members` FK (`reported_by_member_id`, default `get_my_member_id()`), distinct from the audit `created_by = auth.uid()` — matching 6A and `change_orders.author_member_id`. (Correction applied in §2/§5; signed off.)
- **Q2 — Incident read visibility for PM/Foreman. RESOLVED — assigned-only, matching `can_view_project()`.** PM/Foreman (and Crew) read incidents only on projects they are assigned to; Owner/Admin read all. No broader safety grant — notification (§4), not the log listing, is what reaches leadership about an off-project injury. Applied in §5 and the §0 reconciliation block.
- **Q3 — `incident_type` enum home (existing open item #1). RESOLVED [S88].** Declared ONCE in `packages/shared/constants/safety.ts` (`INCIDENT_TYPES`, `INCIDENT_STATUSES` + label maps), exported through the shared barrel and consumed by UI, validation, and service types. The SQL CHECKs remain the DB-side source. No hand-copies — the `row_type` mistake is not repeated.

---

## 10. Doc corrections owed (same commit as this spec)

- `CLAUDE_MODULES.md` §6.3 — "OSHA fields" is superseded. v1 captures _what happened, who, when, treatment_ only (§6).
