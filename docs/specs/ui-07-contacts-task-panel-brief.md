# BRIEF — UI Redesign: Contacts IA & Task-Creation Panel

**Repo home:** `docs/specs/ui-07-contacts-task-panel-brief.md`
**Status: PRE-SPEC. Do not build from this.** Planning input from Session 79 manual testing. Each item needs its own interview-first planning session (Josh narrates → trace → approval) before a spec exists.
**Sequencing:** Item 3's data-model fork must be decided **before** Item 4's panel is designed — they are coupled through the assignee list.

---

## Item 3 — Unify contacts under a single "Contacts" surface

Today the sidebar has two destinations: "Contacts" and "Subs & Vendors." Intent: one "Contacts" page holding everyone the company deals with, broken down by type — Clients, Subs, Vendors. One page, internal views; not separate sidebar items.

**Why beyond tidiness:** the split model already leaks downstream. The project-schedule assignee dropdown labels both subs and vendors as "(Sub)" — vendors show mislabeled (**tech debt #89**). Settling the contact model at the source is what makes the label correct everywhere.

**Current behavior — confirmed Session 79, INTENDED, not a bug:** subs become assignable in project scheduling only when entered through the "Subs & Vendors" list. That is correct — Subs & Vendors is the source of truth for subs. **There is no assignment gap to fix.**

**The actual confusion to resolve:** subs also appear in the "Contacts" list, which makes it look like Contacts is where you'd manage them. **Decision for the redesign: subs do NOT appear in the Contacts/Clients view** — the Subs view is their home. This folds directly into the unified breakdown: subs under Subs, clients under Clients, vendors under Vendors.

**Open decisions for the planning session:**
1. Breakdown shape: tabs (Clients / Subs / Vendors switchable views, Contractor Foreman-style) vs. a single list with a type filter/column.
2. **The big fork:** presentation-layer merge (two tables, one UI) vs. true data-model consolidation. Clients live differently from subs/vendors today, and the schema separation is real — but it is **not** the `member_type`-on-subs/vendors shape earlier drafts of this brief assumed. Verified against live schema 2026-07-20:
   - **`subcontractors`** table holds both subs and vendors, discriminated by a **`sub_type`** column (values `'subcontractor'` / `'vendor'`). There is **no `member_type` column on `subcontractors`.**
   - **`company_members`** is a separate table with its own **`member_type`** column (values `'crew'` / `'subcontractor'`) — internal team/crew records, not the Subs & Vendors list.
   - **Assignment consequence (confirmed):** project-schedule task assignment reads **only from `subcontractors`**. Subs entered through the Contacts surface (which is not the `subcontractors` table) **cannot be assigned to tasks.** This is the mechanism behind the "source of truth is Subs & Vendors" behavior noted above, and any consolidation decision must preserve it (or explicitly migrate the assignee source).
   This drives everything else, including Item 4.
3. `/subs-and-vendors` route + deep links: redirect or retire.
4. Per-type fields (sub insurance/trade fields a client doesn't have): per-type form design on the unified page.

**Effect on ui-01 (Foundation):** ui-01 ships the nav **as the app is today** — both "Contacts" and "Subs & Vendors" items. If Item 3 lands, the nav drops by one item in a later amendment. Do not pre-merge in ui-01, and do not change which list subs appear in — that's this planning session's output, not Foundation's.

---

## Item 4 — Task creation opens a modal/panel, not an inline form

On the project schedule, creating a new task should open a dedicated entry surface — slide-in panel or modal (reference: Contractor Foreman "New task" slide-in) — instead of today's inline form. The pattern is the request; field-for-field parity with the reference is a scoping decision.

**Open decisions for the planning session:**
1. Modal (centers, blocks) vs. slide-in (keeps the Gantt/schedule visible). Reference product chose slide-in.
2. v1 field set: assignee, dates, duration are core; type/color/progress/send-email-on-save are candidates for later.
3. Create-only vs. create-and-edit (click existing task → same panel, pre-filled). One reusable component is usually right — decide before build so it's built once.
4. **Assignee picker depends on Item 3's data decision.** Do not spec this panel until the contact-model fork is resolved.

**Scope home:** this belongs to the Schedule page body / Module 6A UI work — explicitly out of scope of ui-01 through ui-06.

---

## Recommended order
1. Item 3 planning session → resolve the data-model fork; lock the subs-not-in-Clients rule into the spec.
2. Item 3 spec + build (also fixes the "(Sub)" mislabel, tech debt #89, at the source — note: assignment behavior itself is intended and stays).
3. Item 4 planning session → panel spec on top of the settled contact model.
4. Item 4 builds with (or after) the 6A schedule UI.
