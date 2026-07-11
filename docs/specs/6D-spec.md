# 6D — Material Deliveries — Spec (DRAFT, for review)

> **Design authority:** `docs/specs/future_module_architecture.md` §7.4. **This spec amends §7.4** (§3).
>
> **Status:** DRAFT — not built. Acceptance trace (§8) is **PROPOSED/UNVERIFIED**, derived from a real Bishop delivery (Jones Lumber → Willow Ridge). Quantities are reconstructed. Verify before build.
>
> **Written against stale project knowledge.** All column references are **design-level** — confirm against live schema at build.
>
> **Depends on:** M5 (`projects`), M3 (photos, storage), `company_members` foundation, Resend (notifications). **6B consumes 6D** (read-only delivery display, 6B §6.3) — not the reverse.
>
> **Conventions (`CLAUDE.md`):** standard columns; per-tenant triggers; RLS via `get_my_company_id()`; identity via `get_my_member_id()`; server/client service split.

---

> ## ⚠️ AS-BUILT RECONCILIATION vs. 6A (added this pass — verified against migrations, not spec prose)
>
> Checked against 6A (`supabase/migrations/20260710130000_module6_6a_time_tracking.sql` on `feat/module-6a`, read via `git show`) and the M5 `change_orders` (5D) / projects (5A) migrations. 6D does not read 6A's tables, but inherits its **identity/audit** and **RLS** conventions. Each drift is flagged **[DRIFT]** at the point of use.
>
> 1. **Domain member ≠ audit column.** `closed_by` and `received_by` are already correct `company_members` FKs (good — matches the convention). But `purchase_orders`' "`created_by` = the office member who entered it" is a **[DRIFT]**: `created_by` is the audit `auth.uid()` column (FK `auth.users`); the office author should be an explicit `author_member_id` (`company_members`, default `get_my_member_id()`), exactly as `change_orders.author_member_id` (5D). See §6.
> 2. **No permissions/RLS section exists.** 6B and 6C each have one; 6D has none, yet it makes real authority claims (check-in = any member on a visible project, §3; manual PO close = Owner/Admin, §5.1). A flagged **§6a** is added below to align these to 6A/M5 patterns — including the same PM/Foreman read-visibility question 6B/6C raise. See §6a / Q1.
> 3. **`received_by` has no default.** Convention (and 6A's `member_id DEFAULT get_my_member_id()`) suggests `received_by` should default to `get_my_member_id()` so the client INSERT need not set it. Recommended in §6; confirm at build.
> 4. **Open item #2 (damaged-goods return) is left OPEN by explicit instruction** — flagged, not resolved. See §9 and Q2.
> 5. **Acceptance trace — RESOLVED.** Josh narrated a real Sherwin-Williams paint delivery (project 414, 2026-06-29); §8 now carries that approved trace, with the former reconstructed Jones Lumber draft retained as §8.1 (illustrative exception path).

---

## 1. Scope

The office orders material. The crew receives it, compares it against the order, documents damage, and the office finds out immediately.

**In scope (v1):** purchase orders (office-created); delivery check-in against a PO; **orderless check-in** (§4); per-item received/damaged quantities; photos; exception flagging; email to Owner/Admin/PM on every check-in; **split deliveries** — one PO, many trucks (§5); read-only display inside the day's daily log.

**Out of scope:**

- **Inventory** → Module 8. A received item does not enter a stock catalog.
- **Cost / invoice matching** → Module 7. A PO here carries quantities, not a payable.
- **Vendor records as first-class entities** — v1 stores a vendor name. Wiring to a vendor/supplier table is later.
- **Offline sync engine** → v2. v1 is offline-**ready** (client UUIDs, device timestamps).

---

## 2. Vocabulary

- **Purchase order (PO)** — what the office says was ordered. The "order slip from the office."
- **Delivery** — one truck arriving. What the driver actually brought. The "delivery slip."
- **Exception** — any line where received ≠ ordered, or damaged > 0.

The whole module exists to make the crew's paper comparison of those two slips into a record the office can see.

---

## 3. Amendments to §7.4

1. **Delivery check-in is NOT gated by project assignment.** §7.4 says "any assigned member." Wrong — **any company member may check in a delivery on any project they can see** (Josh, Session 63). The guy who happens to be on site signs for the truck.

---

## 4. No order, no problem — the escape hatch

**A delivery may be checked in with no PO attached.** `purchase_order_id` is nullable.

Rationale (Josh, this session): the office forgets to enter the order, the truck is already there. Blocking the crew on an office data-entry task guarantees they route around the app, and a delivery recorded loosely beats a delivery not recorded at all. The office reconciles later.

Consequence: an orderless delivery has **no ordered quantities to compare against**, so `has_exceptions` is whatever the crew says it is. Its items are free-text lines with received/damaged counts, not FK'd to PO lines.

---

### 4.1 "Issue with delivery" — explicit crew flag

The item list carries an **"Issue with delivery"** action. The crew taps it, selects the specific problem line(s), and adds a per-item `issue_note` on each (e.g. `"2 split, returned with driver"`).

This is additive to the numeric derivation in §6, not a replacement. `has_exceptions` still trips automatically whenever `qty_damaged > 0` or `qty_received <> qty_ordered` on a PO line — the arithmetic cannot be suppressed by a crew that forgets the button. The button's job is to (1) let the crew flag a problem the numbers don't capture, and (2) attach the `issue_note` that explains what went wrong. A short or damaged line is flagged either way; the note is what the button adds.

---

## 5. Split deliveries — one PO, many trucks

**A PO stays open until every ordered quantity is filled by usable material, not merely received.** Each truck is its own `deliveries` row.

- Usable quantity per PO line is the sum of `qty_received` **minus** `qty_damaged` across all that line's deliveries.
- The PO's status derives from that sum. It is never typed. See §5.1 for the case where auto-close cannot fire.
- The "order complete" signal therefore cannot fire on the first of two trucks — which is the failure this rule exists to prevent.

### 5.1 A PO closes on usable quantity, and may need closing by hand

**Received is not the same as usable.** A PO's ordered quantity is filled by the sum of `qty_received` **minus** `qty_damaged` across all its deliveries. Twelve joists received with two split leaves ten usable, so the line is short by two. (Josh, this session — usable over received.)

**Consequence: auto-close cannot always fire.** If the vendor issues a credit instead of a replacement, no further delivery arrives, and the PO would sit open forever.

**Manual close.** Owner and Admin may close an open PO. `closed_reason` is required — e.g. `"Jones credited us, not replacing."`

```sql
CHECK (status <> 'closed' OR closed_reason IS NOT NULL)
```

Rationale: an open PO and an unexplained closed PO look identical to the person who did not order the material.

---

## 6. Data model

```sql
purchase_orders
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
project_id UUID NOT NULL REFERENCES projects(id)
vendor_name TEXT NOT NULL -- free text in v1 (§1)
po_number TEXT -- vendor's or ours; nullable
status TEXT NOT NULL -- 'open' | 'closed' | 'cancelled'
ordered_at DATE
closed_reason TEXT
closed_by UUID REFERENCES company_members(id)
author_member_id UUID NOT NULL DEFAULT get_my_member_id() REFERENCES company_members(id) -- domain author (§6a)
-- standard columns (created_by / updated_by are AUDIT = auth.uid(), NOT the office author)
```

> **[DRIFT — corrected]** the office author is **`author_member_id`** (a `company_members` FK defaulting to `get_my_member_id()`), **not** `created_by`. `created_by`/`updated_by` are audit columns defaulting to `auth.uid()` (FK `auth.users`), per 6A and `change_orders.author_member_id` (5D). `closed_by` and `deliveries.received_by` are already correct `company_members` FKs.

```sql
purchase_order_items
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE
description TEXT NOT NULL -- "5/8 plywood sheet"
qty_ordered NUMERIC(10,2) NOT NULL
unit TEXT -- "each", "sheet", "lf" — free text v1
sort_order INT NOT NULL DEFAULT 0
-- standard columns
```

```sql
deliveries
id UUID PK -- client-generated (offline-ready)
company_id UUID NOT NULL REFERENCES companies(id)
project_id UUID NOT NULL REFERENCES projects(id)
purchase_order_id UUID REFERENCES purchase_orders(id) -- NULLABLE (§4)
vendor_name TEXT NOT NULL -- copied from PO, or typed if orderless
delivery_date DATE NOT NULL
has_exceptions BOOLEAN NOT NULL DEFAULT false
notes TEXT -- "2 splits, returned with driver."
received_by UUID NOT NULL DEFAULT get_my_member_id() REFERENCES company_members(id) -- the on-site member; default per convention (§6a)
-- standard columns (created_by / updated_by = audit auth.uid())
```

```sql
delivery_items
id UUID PK
company_id UUID NOT NULL REFERENCES companies(id)
delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE
po_item_id UUID REFERENCES purchase_order_items(id) -- NULL when orderless (§4)
description TEXT NOT NULL -- copied from PO item, or typed
qty_received NUMERIC(10,2) NOT NULL DEFAULT 0
qty_damaged NUMERIC(10,2) NOT NULL DEFAULT 0
issue_note TEXT                       -- per-item note when crew flags an issue (§4.1)
-- standard columns
CHECK (qty_damaged <= qty_received)
```

- `has_exceptions` is set true by either path (§4.1): **auto-derived at write time** when any child item has `qty_damaged > 0` or `qty_received <> qty_ordered` on its PO line, **or** set by the crew's explicit "Issue with delivery" flag. The numeric path cannot be suppressed. Store it so the notification and the list view don't recompute.
- `qty_damaged <= qty_received` — you cannot damage what didn't arrive. Damaged goods that leave on the truck were still _received_ first; that's what makes them a return.
- Photos attach via M3 against the `deliveries` row.
- **Offline caveat on `received_by`.** The `DEFAULT get_my_member_id()` is correct for online check-in (the person receiving the truck is the one submitting). But on the offline-ready path (§1), a synced-later insert would fire the default as whoever *syncs*, not who received. The offline client must therefore set `received_by` explicitly at capture time; the server default is a convenience for the online case only.

---

## 6a. Permissions & RLS — [ADDED this pass; align to 6A/M5, confirm at build]

> This section did not exist. 6D made authority claims (§3, §5.1) without a home for them. Written to match how 6A/M5 actually did RLS; **none of it is finalized** — the read-visibility line carries the same flag 6B/6C raise (Q1).

- Company-scoped: `company_id = get_my_company_id()` on all four tables.
- **Create PO:** office roles — Owner/Admin/PM (mirrors who creates `change_orders`); on a project they can see (`can_view_project`).
- **Check in a delivery:** **any company member on a project they can see** (§3 amendment) — `can_view_project(project_id)`. `received_by` defaults to `get_my_member_id()`.
- **Manual PO close:** **Owner/Admin only** (§5.1), with `closed_reason` required by CHECK. `closed_by = get_my_member_id()`.
- **Read:** **RESOLVED — inherits `can_view_project(project_id)`.** POs and deliveries are visible exactly as their project is: Owner/Admin see all company records; PM/Foreman/Crew see only projects they are assigned to. This is not a new rule — it matches the `projects_select_visible` SELECT policy verified in migrations (`module5_5a_projects.sql`), so a PO/delivery can never be visible for a project the caller cannot see. Child tables inherit via parent FK.
- **Delete:** soft-delete, Owner/Admin only, per convention.
- Child tables (`purchase_order_items`, `delivery_items`) inherit their parent's visibility via the parent FK, `ON DELETE CASCADE` as written (consistent with 6A's `time_segments → time_clock_sessions`).

---

## 7. Notification

**Every check-in emails Owner, Admin, and PM.** One template, one code path. The subject line states whether the delivery was clean or flagged. (Josh, this session — option A over "only flag exceptions.")

Rationale: with exception-only email, silence is ambiguous — it means either _clean_ or _the crew never checked it in_. Those are very different, and one of them is a problem.

Sent via Resend, from `companyname@rafterworks.com`. **Failure to send must not roll back the delivery insert.** Foremen are not notified (divergence from 6C, which notifies four roles — deliberate; a delivery is not a safety event).

---

## 8. Acceptance example — from a real Bishop delivery

> Bishop paint order, narrated by Josh and mirrored to an approved input→store→output trace (this session). This replaces the earlier reconstructed Jones Lumber draft, which is retained below (§8.1) as an illustrative exception-path example only. Column references remain design-level — confirm against live schema at build.

**INPUT — office.** Phones in a paint order to Sherwin-Williams, receives the written PO, enters it. One PO, vendor _Sherwin-Williams_, project _414_. Ten line items:
- 5-gal primer — qty 3
- 5-gal paint — qty 1
- eight 1-gal paints, one color each — qty 1 each

**INPUT — truck, `2026-06-29`.** Crew opens the PO on a phone and checks each line for **quantity and color**. All ten match — nothing short, nothing damaged, no wrong colors. Submits.

**STORE.** One `deliveries` row: `purchase_order_id` set, `delivery_date = 2026-06-29`, `has_exceptions = false`, `received_by` = the crew member (set explicitly at capture, per the §6 offline caveat). Ten `delivery_items` rows, each `qty_received = qty_ordered`, `qty_damaged = 0`, `po_item_id` → its PO line. No `issue_note` on any row.

**OUTPUT.** Email to Owner, Admin, PM; subject states clean. Delivery renders read-only in project 414's daily log for `2026-06-29` (6B §6.3). PO view shows all ten lines fully received. Every line is filled by usable quantity, so the PO **auto-closes** that day (§5.1).

---

### 8.1 Illustrative exception path (reconstructed — NOT a real delivery)

> Kept to show the split-truck / damaged / manual-close behavior the clean paint trace above does not exercise. Project, date, and quantities are reconstructed; do not treat as fact.

**INPUT — office.** A PO for project _Willow Ridge_, vendor _Jones Lumber_. Two items: `40 × 5/8 plywood sheet`, `12 × 2x10-16'`.

**INPUT — truck one, `2026-07-07`.** Crew opens the PO. Driver's slip: 20 sheets, 12 joists. Crew counts 20 sheets present; 12 joists present, **2 split**. Photos of the split ends. Marks plywood `received 20, damaged 0`; joists `received 12, damaged 2`. Hits "Issue with delivery," flags the joist line, per-item `issue_note`: `"2 split, returned with driver."` Submits.

**STORE.** One `deliveries` row: `purchase_order_id` set, `has_exceptions = true`. Two `delivery_items` rows: plywood `qty_received 20.00, qty_damaged 0.00`; joists `qty_received 12.00, qty_damaged 2.00`, `issue_note` set. Photos filed to M3. PO remains `open` — 20 of 40 sheets outstanding (§5).

**OUTPUT.** Email to Owner, Admin, PM; subject flags exceptions. Delivery renders read-only in Willow Ridge's daily log for `2026-07-07`. PO view shows plywood `20/40`, joists `12/12 received, 2 damaged`.

**INPUT — truck two, `2026-07-09`.** Remaining 20 sheets. Clean, no damage.

**STORE.** Second `deliveries` row against the same PO, `has_exceptions = false`. One `delivery_items` row: plywood `qty_received 20.00, qty_damaged 0.00`. Plywood now sums to `40/40`.

**OUTPUT.** Email to Owner, Admin, PM; subject states clean. Plywood is `40/40` usable — filled. Joists are `10/12` usable (12 received, 2 damaged) — short by 2, unfilled. The PO does **not** auto-close on Thursday; it stays `open`. It closes only when Jones delivers 2 replacement joists, or when an Owner or Admin closes it by hand with a required `closed_reason` (§5.1).

---

## 8a. Questions for Josh (raised by the 6A as-built reconciliation — resolve nothing silently)

- **Q1 — Read visibility — RESOLVED (this session).** Verified against migrations: `can_view_project()` and the `projects_select_visible` policy both gate Owner/Admin → all company projects, everyone else → assigned-only. 6D adopts the identical rule (§6a Read). 6B/6C are being updated to the same rule this session; the answer is consistent across all three.
- **Q2 — Damaged-goods return has no record of its own (existing open item #2 — LEFT OPEN by instruction, not resolved here).** A return that never comes back is invisible: `qty_damaged` + a note record that goods *were* damaged, but nothing tracks the return itself (did the driver take them? was a credit issued? a replacement promised?). §5.1's manual PO close partly covers the credit case via `closed_reason`, but there is no first-class `returns` concept. **Decision deferred to you — do not let this pass be read as resolving it.**
- **Q3 — Author/audit split — RESOLVED (this session).** Josh confirmed `author_member_id` (office author, `company_members` FK defaulting to `get_my_member_id()`, named to match `change_orders` 5D) and the defaulted `received_by`, both distinct from audit `created_by = auth.uid()`. Verified against migrations. Q1 (read-visibility) remains the only open question.

---

## 9. Open items

| #   | Item                                                                                                                                                                                                                                                                | Owner |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | **PO-close semantics — resolved (§5.1).** Closes on _usable_ quantity (`qty_received − qty_damaged` summed across deliveries); auto-close can't always fire, so Owner or Admin may close by hand with a required `closed_reason`.                                     | Closed |
| 2   | Damaged-goods return has no record of its own. A return that never comes back is invisible. Add a `returns` concept, or is the `qty_damaged` + note enough for v1?                                                                                                  | Josh  |
| 3   | Acceptance trace (§8) is PROPOSED — verify against a real Bishop delivery before build.                                                                                                                                                                             |
