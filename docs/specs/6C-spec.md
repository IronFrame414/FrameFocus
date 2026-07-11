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
> 2. **Read-visibility helper exists and is narrower than this spec.** M5 ships `can_view_project()` = "owner/admin see all **OR** the caller is assigned," i.e. **PM/Foreman are assigned-only**. This spec grants PM/Foreman company-wide incident read — a **[CONFLICT]**, flagged not resolved. See §5 / Q2.
> 3. **`num_nonnulls()` is Postgres-native and unused elsewhere in this repo's migrations** (verified). The §2.1 conditional CHECKs are valid SQL; kept as-is. Still tracked as open item #8.
> 4. **Acceptance trace stays PROPOSED.** See the NEEDS INTERVIEW blocker in §8.

---

## 1. Scope

The formal record of something that actually happened: injury, property damage, or near miss. Distinct from 6B's hazard _flag_, which records a concern (6B §7).

**In scope (v1):** incident creation + edit; injured parties (members or outsiders, one row each — §2.1); witnesses (members or outsiders); treatment captured per injured party; photos; auto-PDF to M3; email notification to Owner/Admin/PM/Foreman; company-wide incident log; pre-fill from a 6B hazard flag.

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
project_id UUID NOT NULL REFERENCES projects(id)
incident_date DATE NOT NULL
incident_type TEXT NOT NULL -- 'injury' | 'property_damage' | 'near_miss'
description TEXT NOT NULL
pdf_file_id UUID REFERENCES files(id) -- M3
reported_by_member_id UUID NOT NULL DEFAULT get_my_member_id() REFERENCES company_members(id) -- domain reporter (§5)
-- standard columns (created_by / updated_by are AUDIT = auth.uid(), NOT the reporter)
```

- **[DRIFT — corrected]** the reporter is **`reported_by_member_id`** (a `company_members` FK defaulting to `get_my_member_id()`), **not** `created_by`. `created_by`/`updated_by` are audit columns defaulting to `auth.uid()` (FK `auth.users`), per 6A and `change_orders.author_member_id` (5D).
- `incident_type` is a CHECK-constrained enum. See §9 open item #1.
- Never locks. Editable by creator (§5), because treatment is usually learned a day later.

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

**Every incident, regardless of type or severity, emails Owner, Admin, PM, and Foreman.** (Josh, this session — option A over a narrower Owner/Admin-only alternative.) Matches the promise already written into 6B §7, so no divergence entry is owed.

Sent via Resend, from `companyname@rafterworks.com`, per the existing convention. Failure to send must not roll back the incident insert.

**On send failure (Josh, this session): log the failure _and_ surface a retry affordance to the Owner.** Silent-log is rejected — a swallowed email on an injury means the Owner never learns it happened. The retry is Owner-visible, not a background-only reattempt, so the failure cannot pass unnoticed. (Resolves §9 item #5.)

---

## 5. Permissions & RLS

- Company-scoped: `company_id = get_my_company_id()`.
- **Create:** any member, on any project they can see.
- **Edit:** **creator only** — **[DRIFT — corrected]** keyed on **`reported_by_member_id = get_my_member_id()`**, not `created_by` (the audit `auth.uid()` column, §2). Treatment details arrive late; the record never locks.
- **Read:** **[CONFLICT — flag, do not resolve]** this spec grants Owner/Admin/**PM/Foreman** read of **all** company incidents, but M5's `can_view_project()` restricts **PM/Foreman to assigned projects**. Safety incidents may warrant broader visibility than ordinary project content (an injury the whole leadership should see) — but that is Josh's call, not a silent default. Pick one at build — Q2. Crew read is assigned-only regardless (`can_view_project(project_id)`).
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
| 8   | `num_nonnulls()` is Postgres-native — confirm it's available for the §2.1 / §2.2 member-or-outsider identity CHECKs.                                                            | Build    |
| 9   | Enforcement mechanism for the injury cross-table invariant (`incident_type = 'injury'` ⇒ ≥1 `safety_incident_injuries` row) — application logic vs. DB trigger. Decide at build. | 6C build |

---

## 9a. Questions for Josh (raised by the 6A as-built reconciliation — resolve nothing silently)

- **Q1 — Reporter identity.** Confirm the reporter is a `company_members` FK (`reported_by_member_id`, default `get_my_member_id()`), distinct from the audit `created_by = auth.uid()` — matching 6A and `change_orders.author_member_id`. (Correction applied in §2/§5; flagging for sign-off.)
- **Q2 — Incident read visibility for PM/Foreman.** All company incidents (as this spec says) or only incidents on projects they can see (`can_view_project`, matching M5)? Safety may deserve the broader grant, but it is your call.
- **Q3 — `incident_type` enum home (existing open item #1).** Declare once and add to `TECH_DEBT.md` (the `row_type` enum is already hand-duplicated across five files — don't repeat that). Where should the single declaration live?

---

## 10. Doc corrections owed (same commit as this spec)

- `CLAUDE_MODULES.md` §6.3 — "OSHA fields" is superseded. v1 captures _what happened, who, when, treatment_ only (§6).
