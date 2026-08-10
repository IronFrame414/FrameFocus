# FrameFocus — 5I: Subcontractor Portal (spec)

> **Series:** Module 5 (Project Management), post-launch letter **5I**.
> **Status:** Design-ready spec. Specs-only — no code, no migrations, no build. File this yourself, path-scoped, into `docs/specs/`. Do **not** hand it to a Claude Code build against `feat/module-5` while that tree is live.
> **House style:** design-level (schema shapes are _proposed_, not authoritative — every table/column carries a confirm-against-live-schema flag). Claude Code derives file/route/component structure from its own codebase analysis at build; **no paths, component names, or migration names are prescribed here.** The acceptance example is **PROPOSED** until run against a real Bishop job.
> **Number note:** `5H` is reserved for **Activity Log** (deferred, unspecced). This spec is **5I** to avoid that collision. If 5H has been reassigned, renumber.

---

## 1. Purpose & scope

5I gives subcontractors a **limited authenticated surface** to see the jobs they're on and to exchange documents and photos with the company.

**What a subcontractor is, for auth purposes (already decided — not re-opened here):** a subcontractor is a **real company role** (`subcontractor`) who authenticates as a normal Supabase user. Their login is **optional on both sides** — the company can schedule and assign a sub who has never logged in, and a sub is never forced to create an account. A sub starts life as a `company_members` row with `profile_id = NULL`; a profile is provisioned only if they accept an invite.

**Explicitly NOT the client external-surface gate.** Subs are limited _internal_ users (they view their own slice of internal M5 data), **not** the no-login _clients_ that the Pre-Module 9 external-surface gate exists for. There is **no hosted-portal vs. magic-link A/B decision for subs** — that fork is the client-experience question (the `client` role), and it does not apply here. See §10 for the coherence relationship.

**Boundaries.** Payment, lien releases, and waivers are **Module 7**. The portal may later _surface_ those, but 5I builds none of that machinery. Compliance-doc _tracking_ (COI/license/W9 + expirations) is in scope; payment-side blocking on compliance is not (that's M7).

---

## 2. What already exists vs. what 5I builds

**Verified this session** by reading `supabase/migrations/20260704210000_company_members_foundation.sql` (untracked on `feat/module-5`). The **accept-side** of the sub-invite flow is built:

- `company_members` table; `member_type` CHECK allows `'crew'` / `'subcontractor'`; `profile_id` nullable.
- `get_my_member_id()` — the RLS keystone; resolves `auth.uid()` → `profiles.user_id` → the caller's member `id`. A sub with `profile_id = NULL` never calls it (no `auth.uid()`).
- `subcontractor` added to **both** role CHECKs (`profiles` and `invitations`).
- `invitations.member_id` column **+ FK** to `company_members(id)`.
- `get_invitation_for_signup()` **returns** `member_id`.
- `handle_new_user()` **links** an accepted sub's new profile to its existing member row when `member_id` is set; **skips** new-member creation for `client` / `subcontractor` roles.
- `create_member_for_new_subcontractor()` + trigger `subcontractors_create_member` (AFTER INSERT on `subcontractors`) → auto-creates a `member_type='subcontractor'` row, `profile_id = NULL`, `display_name = company_name`. Plus a backfill for existing subs.

**The gap 5I fills.** Nothing sets `invitations.member_id` **when a sub is invited** — the create-side is app-layer and unbuilt. So 5I builds:

1. **Invite create-side** (§4) — the piece the accept-side already expects.
2. **Compliance & document tracking** (§5) — net-new.
3. **The portal surface** (§6) — subs are excluded from `DASHBOARD_ROLES`, so they land on a distinct surface, not the dashboard. **⚠️ This sentence was FALSE when written and is TRUE now — see §6.**

**[confirm-at-build]** `seats.ts` (sub seat exclusion) and `roles.ts` (`DASHBOARD_ROLES`, `INVITABLE_ROLES`, `TEAM_MANAGEMENT_ROLES`) are modified in the tree but were **not read this session** — confirm their actual contents before building §4/§6. Do **not** re-decide seat exclusion; confirm it.

---

## 3. Data model (design-level — confirm all shapes at build)

> `[DERIVED — review before build]` shapes below are proposed by this spec. Confirm names/types against the shipped schema; do not treat this block as authoritative. Sub-related records **key on `company_members(id)`**, matching the established pattern in `subcontractor_contracts` (5A-spec §6b).

### 3a. Subcontractor compliance documents (net-new)

```
subcontractor_compliance_documents
  id               uuid pk
  member_id        uuid not null references company_members(id)   -- the sub identity (aligns w/ subcontractor_contracts)
  doc_type         text not null            -- 'coi' | 'license' | 'w9' | 'other'   [confirm enum vs check]
  file_id          uuid references files(id)                      -- the uploaded PDF  [confirm files table]
  issued_date      date                                           -- optional
  expiration_date  date                                           -- NULLABLE — null for W9 / no-expiry docs
  notes            text
  + standard audit cols (created_at, created_by, updated_at, updated_by, is_deleted, deleted_at)
```

- **Docs are per-sub, not per-job** (one COI/license/W9 on file per sub; an award just checks currency). One insurance policy covers all of that sub's jobs.
- **`expiration_date` NULLABLE** — W9 carries no expiration and gets **no** alerts. Only COI + license are expiry-tracked.
- **Compliance status is derived, not stored** — `current` / `expiring_soon` / `expired` is computed from `expiration_date` vs. today at read time (avoids stale flags).
- **COI granularity:** one COI usually lists GL + WC + Auto. For launch, track the **single soonest expiration** on the COI record (do not split by coverage). Per-coverage split is reserved as an additive block, not built now.
- **Certificate-holder + additional-insured** are handled as **requirement copy** shown to the sub at award (the requirement text names Bishop as certificate holder **and** requires additional-insured status) — **not** structured verification fields for launch. Structured "additional-insured verified" tracking is a reserved additive block.

### 3b. License-required flag

An award requires a license only "if applicable" (an electrician needs one; general labor may not). Model this as a **design-level flag** — proposed as `license_required boolean` at the sub level.

- **[confirm-at-build / TECH_DEBT #79]** where this lives depends on the `subcontractors` baseline, which is **not committed** (see §9). Confirm whether it lands on `subcontractors` or on the member record.

### 3c. "Visible to subs" flag (touches built Module 3)

Documents and photos become sub-visible via a **project-wide boolean**, not per-sub targeting (a doc/photo flagged visible on a project is visible to **all** subs assigned to that project).

- Proposed: `visible_to_subs boolean not null default false` on the relevant Module 3 file/photo record. **[confirm-at-build]** against the actual M3 files/photos schema.
- **Coherence flag:** a _client_ file-sharing mechanism is already planned (a `file_shares` junction, per the Module 9 follow-up). Subs use a project-wide boolean; clients use per-file targeting. Confirm these two audiences stay coherent (or unify later) rather than colliding by accident.

### 3d. Award = the compliance trigger

"Awarded" means the sub's `subcontractor_contracts` row reaches **`signed`** status (5A-spec §6b). That transition is what turns on the compliance requirement for that sub. **[confirm-at-build]** the status enum and that `signed` is the correct trigger value.

---

## 4. Invite create-side

**Entry point.** The "Invite to portal" action lives **on the subcontractor's record**, where the member row already exists. The invite is created with `role = 'subcontractor'` **and `member_id` set to that sub's existing `company_members.id`.** This is the missing write that the accept-side (§2) already expects.

- **No cold generic-dropdown invite for subs.** A generic invite with no `member_id` would provision a profile with **no member row** → an unassignable sub. Disallow it.
- **Email source.** The invite needs the sub's contact email from the `subcontractors` record. **[confirm-at-build / TECH_DEBT #79]** confirm that email field exists on the (uncommitted-baseline) `subcontractors` table.
- **Delivery.** Reuse the existing invite email infrastructure (Resend). Acceptance flows entirely through the built accept-side: provision profile → link to member via `member_id` → assign `subcontractor`.

**Invite authority (fork resolved).**

- **Owner / Admin:** full team-management — may invite any role (unchanged).
- **PM / Foreman:** a **narrow, subcontractor-only** invite capability — they may invite `role = 'subcontractor'` and nothing else. A foreman cannot invite an admin.
- **[confirm-at-build]** this touches `INVITABLE_ROLES` / `TEAM_MANAGEMENT_ROLES` (built M1). The **scoping** (PM/foreman restricted to `subcontractor`) is new logic, not just adding them to a role list — build the guard, don't just widen the constant.

**One active login per sub company (fork resolved).**

- A `company_members` row is one per sub **company** (e.g., "Volt Electric LLC"). Launch model: **one active login per sub company.** The invite links one person to that member row.
- Guard: if the member already has a `profile_id` set (an active login), the invite action is **blocked/disabled** — no second login for the same sub company.
- **Turnover = deactivate the existing profile + re-invite.** (Seats already exclude subs, so multiple logins wouldn't cost anything — this is a UX-simplicity call, not billing.)

---

## 5. Compliance & document tracking

**On award** (§3d), the sub's required-document checklist becomes active: **COI**, **license** (if `license_required`), **W9**. The checklist is **derived** over `subcontractor_compliance_documents` (per-sub docs, §3a) — an awarded sub is "compliant" when a _current_ doc of each required type is on file. No separate checklist table is required.

**Two upload paths** (forced by login-optional):

- **Path A — no login:** the sub emails the PDFs; the company uploads them and enters dates on the sub's record.
- **Path B — login:** the sub uploads them via the portal (§6).

Both paths write the same `subcontractor_compliance_documents` records.

**Expiry alerts — to the company** (subs are not alerted about their own doc expiry for launch):

- **COI + license only.** W9 → none.
- Thresholds per doc: **−30 days**, **−7 days**, then **EXPIRED** after `expiration_date`.
- Delivery: an in-app compliance surface for the company; email via existing Resend infra is design-level/optional. **[confirm-at-build]** a **scheduled daily evaluation** (e.g., a Supabase scheduled function / cron — CC determines the mechanism) computes which docs have crossed the −30 / −7 / expired thresholds. Alerts are derived from `expiration_date`; nothing is precomputed and stored.

**Missing / expired docs = warn, don't block.** The compliance flag is visible but does **not** stop scheduling or assignment (consistent with 5G warn-but-allow). Any hard block on compliance is a payment-side concern and belongs to **Module 7**.

---

## 6. Portal surface

> ### ⚠️ AMENDMENT [S131] — THIS SECTION REASONED FROM A PREMISE THAT WAS NOT TRUE
>
> The sentence below is the spec's foundation, and **for as long as this spec
> existed it was false.** `DASHBOARD_ROLES` did exclude `subcontractor`, exactly
> as stated — but **no code consulted the constant**. A repo-wide grep found the
> declaration and three comments and nothing else. Neither `middleware.ts` nor
> the dashboard layout read role at all, and `defaultSignedInPath()` branched on
> user agent only.
>
> **What that meant in practice**, measured on rebuild-test in S130 as the real
> QA identities rather than inferred: a subcontractor signing in reached
> `/dashboard` and read the company's **full contacts list, sub roster and team
> roster — 6 / 4 / 7 rows, identical to the Owner's.** Not an empty shell. The
> same held for `client`.
>
> **It is true now.** Ruling A [Josh, S131] enforces the constant in
> `middleware.ts` and `app/dashboard/layout.tsx` through
> `apps/web/lib/dashboard-access.ts`; a sub is redirected to `/m/projects`.
> Ruling B closes the data half in RLS (`20260911000000_roster_visibility_floor.sql`),
> because a redirect does not stop `/m` or an API route reading the same tables.
>
> **Recorded rather than silently corrected**, because the failure mode worth
> remembering is not the gap itself — it is that a spec was written on top of it,
> and a constant that no code consults reads exactly like a rule that is being
> enforced. Anything else in this spec that assumed the exclusion was live
> should be re-read with that in mind.
>
> **Ruling B also narrows what §6 can show a sub.** Even on their own surface a
> sub now reads **no contacts and no subcontractor records at all**, and of the
> team only Owner, Admin and PM (plus their own row). A "My Jobs" surface that
> expects to list client or vendor names will get nothing back — by ruling, not
> by defect.

Subs are **not** in `DASHBOARD_ROLES`, so they land on a **distinct sub route tree**, not the dashboard. _(Claude Code derives the actual route/component structure from its own codebase analysis — no paths prescribed.)_

**Landing — "My Jobs":** the projects the sub's member is assigned to.

**Per job, the sub can:**

- **Schedule / their tasks** — read-only. The sub sees **only their own** tasks/assignments (not other subs' scopes).
- **Documents** — files on that project flagged `visible_to_subs`, **plus** documents the sub uploaded.
- **Photos** — photos on that project flagged `visible_to_subs`, **plus** photos the sub uploaded.
- **Upload** — documents and photos (Path B for compliance docs, plus general job photos/docs).

**The sub never sees:** other subs' scopes/assignments, financials (contract values, budgets, draws), or internal-only files/photos (anything not flagged `visible_to_subs`).

**RLS (design-level — confirm at build).** Every sub read keys on `get_my_member_id()`:

- Projects: those where the caller's member has an assignment.
- Tasks: caller's own assignments only.
- Files/photos: `visible_to_subs = true` on the caller's assigned projects, **OR** uploaded by the caller.
- Compliance docs: the caller's own (`member_id = get_my_member_id()`).

**[confirm-at-build]** confirm the member→project reach used by the assignment RLS (via 5B's assignment model) and that keying compliance docs on `member_id` is sufficient — the sub trigger (§2) creates a member from a `subcontractors` INSERT but does not appear to store a back-pointer to `subcontractors.id`; if any surface needs to reach the business record from the member, confirm that path exists or add it.

---

## 7. Schedule / task visibility

- Tasks/assignments come from **5B** (migration present in-tree), keyed on the member.
- On award, schedule and tasks are set **tentatively, with the ability to adjust** — the PM sets/adjusts literal dates. Model "tentative/adjustable" as a flag or status on the assignment/task. **[confirm-at-build]** against 5B's task model (5B stores literal dates — no duration/offset column).
- **Read-only to the sub.** The sub views their dates; only the PM adjusts them.
- **Date-shift handling:** when a sub's tentative dates change, **surface the change in-portal only** (e.g., a "changed" indicator on the affected task). **Active push (email/SMS notification to the sub) is deferred** to the external-comms mechanism / Module 7 — not built in 5I.

---

## 8. Acceptance example — **PROPOSED**

> Real Bishop job, real numbers. **PROPOSED** until run against an actual Bishop job; the approved run becomes the locked acceptance example. Demonstrates the rules in §3–§7.

**Sub:** Volt Electric LLC. **Job:** Bishop's "Henderson Kitchen Remodel."

1. **Sub exists, nothing required (pre-award).** Bishop adds "Volt Electric LLC" as a Module 2 subcontractor → trigger auto-creates a `company_members` row (`member_type='subcontractor'`, `profile_id=NULL`, `display_name='Volt Electric LLC'`). No contract, no docs, no login. Volt is already assignable by name.
2. **Award triggers compliance.** Bishop awards Volt the electrical scope → a `subcontractor_contracts` row (scope "Electrical rough-in + finish", value **$18,500**) reaches `signed`. Required docs for Volt now expected: **COI** (Bishop = certificate holder + additional insured), **electrical license**, **W9**. Checklist: COI ☐ License ☐ W9 ☐.
3. **Tentative schedule (independent of login/docs).** PM drops Volt's tasks: "Electrical rough-in" **Aug 3–7 2026**, "Electrical finish/trim" **Sep 14–16 2026**, both flagged tentative/adjustable. Stored as assignments to Volt's member row with literal dates. Happens whether or not Volt ever logs in.
4. **Docs in (two paths).** _Path A (no login):_ Volt emails PDFs; PM uploads and enters dates. _Path B (login):_ Volt uploads. Stored on Volt's record: COI `expiration_date = 2026-11-30`, license `expiration_date = 2027-03-31`, W9 on file / `expiration_date = NULL`. Checklist → ✓ ✓ ✓.
5. **Expiry alerts (to the company).** COI: alert **2026-10-31** (−30d) and **2026-11-23** (−7d); shows EXPIRED after 2026-11-30. License: alert **2027-03-01** (−30d) and **2027-03-24** (−7d). W9: no alerts.
6. **What Volt sees IF logged in.** Own tasks/schedule on Henderson; documents Volt uploaded + any flagged `visible_to_subs` on Henderson; photos Volt uploaded + any flagged `visible_to_subs`. Not other subs' scopes, financials, or internal-only files.

---

## 9. Confirm-at-build flags & dependencies

- **TECH_DEBT #79 (hard dependency).** `subcontractors` has **no committed `CREATE TABLE` baseline** (placeholder migration). Anything in 5I touching that table — the invite email field (§4), the `license_required` flag (§3b), and even the existing auto-create trigger — has no schema baseline. Resolve #79 (recover true DDL via `supabase db dump`; do not reconstruct from `database.ts`) before building those pieces.
- **`seats.ts`** — sub seat exclusion is modified in-tree but unread this session. **Confirm** (do not re-decide) that subs are excluded from paid seats, active + pending.
- **`roles.ts`** — confirm `DASHBOARD_ROLES` excludes `subcontractor` (drives §6's distinct surface); confirm `INVITABLE_ROLES` / `TEAM_MANAGEMENT_ROLES` before the §4 authority change; the PM/foreman **subcontractor-only** scoping is new guard logic.
- **Sub email field** on `subcontractors` — required by the §4 invite; existence gated on #79.
- **Module 3 files/photos** — `visible_to_subs` placement + RLS (§3c/§6); reconcile with the planned client `file_shares` junction.
- **5B task model** — tentative/adjustable flag + member-keyed assignment reach (§6/§7).
- **`subcontractor_contracts`** (5A-spec §6b) — award = `signed`; confirm status enum + trigger value (§3d).
- **`get_my_member_id()`** — the portal RLS keystone; already built (§2). Portal reads depend on it.
- **Member → subcontractor linkage** — confirm compliance docs keying on `member_id` is sufficient, or add a back-pointer if any surface must reach the business record from the member (§6).
- **Scheduled evaluation** for expiry thresholds (§5) — CC determines the mechanism.

---

## 10. Relationship to the external-surface fork & Module 7 (state explicitly)

- The **subcontractor portal is the authenticated-sub surface** — real accounts, optional login. It is **distinct** from the client no-login surface that the **Pre-Module 9 external-surface gate** (hosted portal vs. email + magic-link) governs. That A/B fork is a **client** decision and does **not** gate 5I.
- **Coherence to preserve:** the architecture flags that the client magic-link mechanism should be designed _together with_ the sub invite, and **Module 7's subcontractor lien-release / waiver external delivery follows the external-surface gate decision.** So: subs authenticate here for _viewing_ their scope; when M7 later delivers **waivers/lien releases** to subs externally, that delivery follows the gate's chosen mechanism — the portal may _surface_ those items, but 5I does not build waiver/payment delivery. Reconcile the two at M7 spec time rather than implementing a one-off.
