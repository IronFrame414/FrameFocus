# 6C — Safety Incidents — Spec (DRAFT, for review)

> **Design authority:** `docs/specs/future_module_architecture.md` §7.3 / `CLAUDE_MODULES.md` §6.3.
>
> **Status:** DRAFT — not built. Acceptance trace (§8) is **PROPOSED/UNVERIFIED**, derived from a real Bishop incident but with reconstructed details.
>
> **Written against stale project knowledge.** All column references are **design-level** — confirm against live schema at build.
>
> **Depends on:** M5 (`projects`), M3 (photos, PDF storage), `company_members` foundation, Resend (notifications). **Not** dependent on 6A or 6B — 6B escalates _into_ 6C, but 6C stands alone.
>
> **Conventions (`CLAUDE.md`):** standard columns; per-tenant triggers; RLS via `get_my_company_id()`; identity via `get_my_member_id()`; server/client service split.

---

## 1. Scope

The formal record of something that actually happened: injury, property damage, or near miss. Distinct from 6B's hazard _flag_, which records a concern (6B §7).

**In scope (v1):** incident creation + edit; injured party (member or outsider); witnesses (members or outsiders); treatment captured as fields; photos; auto-PDF to M3; email notification to Owner/Admin/PM/Foreman; company-wide incident log; pre-fill from a 6B hazard flag.

**Out of scope:**

- **OSHA 300 recordkeeping** (§6). No days-away, job-transfer, or restricted-duty columns. **OSHA compliance is handled outside the app in v1.**
- **Follow-up timeline** (§5). Treatment is a field on the incident, not a child record. Josh: "no follow up for now."
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
injured_member_id UUID REFERENCES company_members(id) -- nullable (§2.1)
injured_name TEXT -- nullable (§2.1)
treatment_sought BOOLEAN NOT NULL DEFAULT false
treatment_notes TEXT
pdf_file_id UUID REFERENCES files(id) -- M3
-- standard columns (created_by = reporter)
```

- `incident_type` is a CHECK-constrained enum. See §9 open item #1.
- `treatment_notes` is free text (e.g. `"Urgent care, stitches."`). Costs, co-pays, and clinic names are **not** structured in v1.
- Never locks. Editable by creator (§5), because treatment is usually learned a day later.

### 2.1 Injured party — member or outsider

At most one of `injured_member_id` / `injured_name` is populated. Both may be NULL for a `property_damage` or `near_miss` with nobody hurt — but **an `injury` must name someone.**

```sql
CHECK (num_nonnulls(injured_member_id, injured_name) <= 1)
CHECK (incident_type <> 'injury'
OR num_nonnulls(injured_member_id, injured_name) = 1)
```

Rationale: the homeowner who trips over an extension cord is the incident most worth recording, and will never appear in the roster. The second constraint stops an injury being filed with nobody injured.

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

---

## 5. Permissions & RLS

- Company-scoped: `company_id = get_my_company_id()`.
- **Create:** any member, on any project they can see.
- **Edit:** **creator only** — `created_by = get_my_member_id()`. Treatment details arrive late; the record never locks.
- **Read:** Owner/Admin/PM/Foreman read all company incidents. Crew read incidents on projects they are assigned to — **mirrors the M5 §5.2a project-visibility rule; confirm it landed that way at build.**
- **Delete:** soft-delete, Owner/Admin only. An incident a crew member can erase is not a record.

---

## 6. OSHA — explicit non-goal in v1

`CLAUDE_MODULES.md` §6.3 refers to "OSHA fields." **This spec does not implement them.** The OSHA 300 log requires days-away and restricted-duty counts, which require the follow-up timeline deferred in §1.

> **Legal exposure.** OSHA recordkeeping obligations depend on company size, state plan, and injury classification. This is **not** something to hand-author from a spec. Route to a professional (insurer or safety consultant) before marketing 6C as an OSHA solution.

---

## 7. PDF

- One PDF per incident, filed to the project's **Safety** folder in M3.
- Generated on create. Because incidents never lock, an edited incident's PDF goes stale — **regenerate-on-edit vs. version-on-edit is undecided,** same open question as 6B §11 item 2. Resolve both the same way.
- Generation reuses React-PDF (per repo tooling).

---

## 8. Acceptance example — PROPOSED / UNVERIFIED

> Derived from a real Bishop incident (two employees on site; one slipped off a platform and cut his hand; urgent care, stitches; co-pay paid by Josh). Names, project, and date are reconstructed. Verify before build.

**INPUT** — On project _Willow Ridge_, `2026-07-08`, Josh opens an incident.
`incident_type = 'injury'`. Description: `"Slipped off platform, cut hand."`
Injured party: selected from roster — member _Dave_.
`treatment_sought = true`. Treatment notes: `"Urgent care, stitches."`
Witness: the second employee on site, selected from roster. No photos.

**STORE** — One `safety_incidents` row: `project_id`, `incident_date = 2026-07-08`,
`incident_type = 'injury'`, `description`, `injured_member_id = <Dave>`, `injured_name` NULL,
`treatment_sought = true`, `treatment_notes = 'Urgent care, stitches.'`, `created_by = <Josh>`.
One `safety_incident_witnesses` row: `member_id = <second employee>`, `witness_name` NULL.
No follow-up rows. No OSHA columns.

**OUTPUT** — Incident appears in the company-wide incident log.
Email fires to Owner, Admin, PM, Foreman.
PDF generated and filed to Willow Ridge → Safety.
Had this been opened from a daily log's hazard flag, `project_id` and `incident_date` would have arrived pre-filled (§3).

---

## 9. Open items

| #   | Item                                                                                                                                                                           | Owner    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | `incident_type` enum — declare it once. The `row_type` enum is already hand-declared in five separate files; do not repeat that here. Not currently tracked in `TECH_DEBT.md`. | 6C build |
| 2   | PDF regenerate-on-edit vs. version-on-edit. **Resolve identically to 6B §11 item 2.**                                                                                          | 6C build |
| 3   | Acceptance trace (§8) is PROPOSED — verify against a real Bishop incident before build.                                                                                        | Josh     |
| 4   | Crew read-visibility depends on the M5 §5.2a decision actually shipping as recommended.                                                                                        | Build    |
| 5   | Notification failure handling — retry, dead-letter, or silent log?                                                                                                             | 6C build |
| 6   | OSHA (§6) — confirm with insurer before any OSHA claim is made in marketing.                                                                                                   | Josh     |
| 7   | No FK from a 6B hazard flag to the incident it escalated into. Add later if the link proves useful.                                                                            | Deferred |
| 8   | `num_nonnulls()` is Postgres-native — confirm it's available and that the conditional CHECK in §2.1 is accepted by the migration.                                              | Build    |

---

## 10. Doc corrections owed (same commit as this spec)

- `CLAUDE_MODULES.md` §6.3 — "OSHA fields" is superseded. v1 captures _what happened, who, when, treatment_ only (§6).
