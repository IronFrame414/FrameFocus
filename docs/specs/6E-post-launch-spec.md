# 6E — Crew Briefings — Spec (DRAFT, for review)

> **Design authority:** `docs/specs/future_module_architecture.md` §7.5 (called "huddles" there) / `CLAUDE_MODULES.md` §6.6.
>
> **Status:** DRAFT — not built. Acceptance trace (§6) is **INVENTED/UNVERIFIED** — a designed workflow with **no field basis**. Josh has never run a crew briefing at Bishop Contracting. Unlike 6A–6D, whose traces are PROPOSED from a real workflow, 6E's trace was invented for this spec.
>
> **Build 6E LAST of the Module 6 sub-modules** — after Josh has actually run briefings for a month and can correct the trace against real practice. See §7 item 1.
>
> **Written against stale project knowledge.** All column references are **design-level** — confirm against live schema at build.
>
> **Depends on:** M5 (`projects`), `company_members` foundation, **6B (daily logs)** for the read-only tasks display (§5). **Not** dependent on 6A.
>
> **Conventions (`CLAUDE.md`):** standard columns; per-tenant triggers; RLS via `get_my_company_id()`; identity via `get_my_member_id()`; server/client service split.

---

## 1. Scope

Before the work starts, the crew stands together, hears a safety topic and the day's plan, and there is a record that it happened and who was there.

**In scope (v1):** one briefing record per project per day; a free-text safety topic; free-text plan notes; hand-checked attendance from the project roster; read-only display of yesterday's 6B tasks-for-tomorrow (§5).

**Out of scope:**

- **Signatures.** Foreman check-off only — no per-attendee signature. See §7 item 2.
- **Email notification.** A daily internal ritual that mails four people every morning trains them to ignore mail. No notification.
- **PDF.** No generated document.
- **Reusable safety-topic library.** Free text every time — no picklist, no catalog. See §7 item 3.
- **A task list of its own.** 6E displays 6B's tasks read-only (§5); it never authors tasks.

---

## 2. Purpose

The record's value is **not the plan**. It is **proof that a safety topic was delivered, and evidence of who heard it**. That is the document an insurer asks for after an incident.

Everything else in the record — the plan notes, the topic text — is secondary to that one fact: on this date, on this project, these named people were briefed. Build for that.

---

## 3. Data model

Two tables, standard columns per `CLAUDE.md`, `company_id`-scoped.

```sql
crew_briefings
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
project_id UUID NOT NULL REFERENCES projects(id)
briefing_date DATE NOT NULL
safety_topic TEXT
plan_notes TEXT
led_by UUID REFERENCES company_members(id) -- who ran the huddle
-- standard columns (created_by = the member who entered it)
```

```sql
crew_briefing_attendees
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
briefing_id UUID NOT NULL REFERENCES crew_briefings(id) ON DELETE CASCADE
member_id UUID NOT NULL REFERENCES company_members(id)
-- standard columns
UNIQUE (briefing_id, member_id)
```

### 3.1 Attendees are company members only — divergence from 6C

There is **no typed-in outsider name** on an attendee row, unlike 6C's injured party and witnesses (6C §2.1, §2.2), which allow a free-text `*_name` for someone off the roster. An inspector standing on the site is not crew, and did not receive the briefing. This is a **deliberate divergence from 6C** — the member-or-outsider pattern is correct there and wrong here, because a briefing's evidentiary value is exactly _who on the crew heard the topic_.

### 3.2 Attendance is hand-checked — divergence from 6B

Attendance is **hand-checked from the project roster, not auto-filled from `time_segments`.** This diverges from 6B, whose crew-present list auto-fills from clock-in data. The reason is timing: **a briefing happens before anyone clocks in.** There are no time segments to read at 6:50am, so the foreman ticks names by hand.

---

## 4. Permissions & RLS

- Company-scoped: `company_id = get_my_company_id()`.
- **Create:** any member, on any project they can see.
- **Edit:** **creator only** — `created_by = get_my_member_id()`.
- **Read:** Owner/Admin/PM/Foreman read all company briefings. Crew read briefings on projects they are assigned to — **mirrors the M5 §5.2a project-visibility rule; confirm it landed that way at build.**
- **Delete:** soft-delete, per convention.

---

## 5. Yesterday's tasks — read-only from 6B

6E displays this project's **yesterday's 6B `tasks_tomorrow` field**, read-only. It **stores nothing**, holds **no FK**, and copies no text — the panel reads live from 6B at display time.

This **closes 6B open item 5** ("who displays tasks-for-tomorrow?"): 6E is the consumer. The daily log authors the tasks; the next morning's briefing shows them. Mark 6B §11 item 5 resolved in the same commit (§8).

---

## 6. Acceptance example — INVENTED / UNVERIFIED

> **This trace is invented.** Josh has never run a crew briefing at Bishop. It is a designed workflow, not a reconstructed one — weaker than every other Module 6 trace. Verify against real practice before build (§7 item 1).

**INPUT.** Foreman opens a briefing on project _Willow Ridge_, `2026-07-08`, 6:50am.
Checks off three names from the roster: himself, _Dave_, and one other.
Safety topic: `"Ladder setup, 4:1 rule, tie off at top."`
Plan notes: `"Sheath east wall, set remaining joists."` Submits.

**STORE.** One `crew_briefings` row: `project_id`, `briefing_date = 2026-07-08`,
`safety_topic`, `plan_notes`, `led_by = <foreman's member id>`, `created_by = <foreman>`.
Three `crew_briefing_attendees` rows (foreman, Dave, one other). No signatures. No task rows.

**OUTPUT.** Briefing appears in the project's briefing log.
A read-only panel shows yesterday's daily-log tasks-for-tomorrow — `"Sheath east wall"` — pulled live from 6B and **not stored** (§5).
No email. No PDF.

---

## 7. Open items

| #   | Item                                                                                                                                                                                                                 | Owner    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | Acceptance trace (§6) is **INVENTED** — Josh has never run a briefing. Verify against real practice before build. **Weaker than 6A–6D**, whose traces are PROPOSED from real workflow.                                | Josh     |
| 2   | Hand-checked attendance with no signature is weaker evidence than a signed sheet. Accepted for v1 because an unsigned sheet that gets filled in beats a signed one that does not. Revisit if insurance requires it.   | Josh     |
| 3   | Free-text safety topics cannot be reported on — you will never answer "who has had the ladder talk this year?" A topic library is the fix. Deferred.                                                                 | Deferred |
| 4   | Multiple briefings per project per day are legal — no unique constraint, mirroring the 6B decision. Confirm this is intended.                                                                                         | 6E build |
| 5   | Yesterday's tasks display (§5): which daily log, if 6B allows multiple logs per project per day? All of them concatenated, or the most recent?                                                                       | 6E build |
| 6   | Crew read-visibility (§4) depends on the M5 §5.2a decision shipping as recommended.                                                                                                                                  | Build    |

---

## 8. Doc corrections owed (same commit as this spec)

- `docs/specs/future_module_architecture.md` §7.5 — confirm the "huddle" description matches this spec; mark **superseded** where it does not.
- `CLAUDE_MODULES.md` §6.6 — same.
- `docs/specs/6B-spec.md` §11 open item 5 — mark **resolved**: 6E displays 6B's tasks-for-tomorrow read-only and stores nothing (§5).
