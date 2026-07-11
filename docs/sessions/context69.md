# Session 69 — Context

**Date:** Saturday, July 11, 2026
**Shape:** 6D (Material Deliveries) spec finalization + open-item resolution. Docs-only, path-scoped to `docs/specs/6D-spec.md`. No build, no migration.

---

## What this session did

Three commits on `main`, all path-scoped to `docs/specs/6D-spec.md`.

1. **`7335153` — 6D interview resolved.** Josh narrated a real Bishop delivery: **Sherwin-Williams, project 414, 2026-06-29**, 10 line items (3× 5-gal primer, 1× 5-gal paint, 8× 1-gal colors, one color each), received clean. This became the **§8 acceptance trace**, replacing the reconstructed Jones Lumber draft — which is **retained as §8.1** (illustrative exception path, split-truck/damaged/manual-close). Also in this commit: `issue_note` column on `delivery_items`; **§4.1 "Issue with delivery"** crew-flag flow; **two-path `has_exceptions`** (numeric derivation OR explicit crew flag, numeric path non-suppressible); **`author_member_id` rename** (was `entered_by_member_id`; renamed to match `change_orders.author_member_id`, 5D); **`received_by` offline caveat**.
2. **`0316c1a` — Q1 (read visibility) resolved.** POs/deliveries **inherit `can_view_project(project_id)`**: Owner/Admin see all company records, PM/Foreman/Crew assigned-only. Verified against migrations — matches the `projects_select_visible` policy. Child tables inherit via parent FK.
3. **`74f3a3d` — open item #2 (damaged-goods returns) resolved: WON'T BUILD for v1.** Josh's workflow is a vendor phone/email call (photos if needed); the physical goods go back on the truck or into the dumpster; there is no internal return lifecycle to track. `qty_damaged` + the §4.1 `issue_note` + optional job-file photos cover it. Also corrected in this commit: **photos go to the main job file (M3), not bound to the `deliveries` row.**

That's the whole session. Three commits.

---

## Git state at close (verified, not claimed)

- **Three new commits on `main`:** `7335153`, `0316c1a`, `74f3a3d` — confirmed ancestors of `HEAD`.
- **`main` is AHEAD of `origin/main` by 12 and UNPUSHED.** This session's three plus prior unpushed work (M7 doc, 6B/6C hardening merge, etc.). Docs-only — push when ready, no PR needed.
- **Working tree clean** except untracked `apps/web/.claude/` (see Housekeeping). The 6D edits are all committed; nothing left staged or dirty.

---

## Schema verification done this session (read-only, via CC)

Before resolving Q1, the RLS-critical objects the 6D build leans on were confirmed against `supabase/migrations/` — read-only, no writes:

- `get_my_company_id()` — FOUND (`baseline_schema.sql:153`), `RETURNS uuid`, SQL STABLE SECURITY DEFINER; reads `profiles` keyed on `user_id = auth.uid()`.
- `get_my_member_id()` — FOUND (`company_members_foundation.sql:104`), `RETURNS uuid`; joins `company_members → profiles` on `user_id = auth.uid()`, returns `company_members.id`.
- `can_view_project(p_project_id uuid)` — FOUND (`module5_5a_projects.sql:248`), `RETURNS boolean`; Owner/Admin → all; else `is_assigned_to_project()`.
- `projects` table + `projects_select_visible` SELECT policy — FOUND; same Owner/Admin-all-or-assigned gate.
- `company_members.id` — FOUND, `uuid` PK; `get_my_member_id()` resolves to it.

All FOUND with correct signatures. This is what let Q1 be resolved as **verified**, not assumed.

---

## Cross-module note (verified by reading, not assumed)

6B and 6C read-visibility were **already** resolved to assigned-only by prior work — **not** this session:

- **6C:** `d591ec6` — "PM/Foreman incident read is assigned-only, not company-wide."
- **6B:** the assigned-only rule (Q5) landed via the **`spec/module-6-hardening` merge (`2183963`)**; `054e49f` is a further 6B commit (trace-verified + Q3 shared-helper). *(The incoming prompt attributed 6B read-visibility to `054e49f` — git shows that commit's subject is trace/Q3, so the credit is the hardening merge. Minor attribution fix, noted for accuracy.)*

This session **confirmed** the above by **reading both specs** (they already say assigned-only via `can_view_project`) and **edited neither**. Only **6D** was still out of sync — its copy was frozen mid-reconciliation showing `[CONFLICT — do not resolve]` while 6B/6C were already done.

One imprecision left in place: 6D's §8a Q1 phrasing says "6B/6C being updated to the same rule this session" — slightly optimistic; they were already done before this session opened. Minor, not worth a fix commit.

---

## 6D status

**Decision-complete and spec-complete as of `74f3a3d`.** No open decisions remain. **NOT yet build-executed.** What's left is a routine build-time schema-confirmation pass (every column the four tables reference), which belongs at the **top of the BUILD session**, not here.

---

## Key 6D build facts (carry to the build session)

- **PO closes on USABLE qty** (`received − damaged`), **not** received.
- **Auto-close can't always fire** (the credit case) → **manual close by Owner/Admin** with required `closed_reason` (§5.1 CHECK).
- **`has_exceptions` trips two ways** — numeric derivation OR explicit crew flag; the **numeric path is non-suppressible** (a crew that forgets the button can't hide a short/damaged line).
- **`received_by`** defaults `get_my_member_id()` but the **offline client MUST set it explicitly** at capture (a synced-later insert would fire the default as whoever *syncs*, not who received).
- **`author_member_id`** = office author (`company_members` FK, default `get_my_member_id()`) — **NOT** `created_by`, which is audit `auth.uid()`.
- **Photos → job file (M3), not the `deliveries` row.** No delivery-scoped photo link in v1.
- **No `returns` table** (open item #2 won't-build).
- **Four tables:** `purchase_orders`, `purchase_order_items`, `deliveries`, `delivery_items`.

---

## Method note

The incoming plan was "edit 6B/6C too" — but it turned out to require editing **only 6D**. Reading all three specs first (instead of copy-pasting 6D's edit into 6B/6C) is exactly how we learned 6B/6C were **already** resolved. Verification-first caught it again — same lesson as the `cb8633e` reconciliation surprise earlier in this module. Read before you write; git and the specs are ground truth, the session prompt is a claim.

---

## Housekeeping (untracked, not acted on)

- `apps/web/.claude/` — CC config folder. Should be gitignored, not committed. Still the only dirty item in the tree.
- `main` is ahead of `origin/main` by 12 — the docs-only backlog (M7 doc, 6B/6C hardening, 6D finalization) is local until pushed.

---

## Next-session prompt (draft)

> FrameFocus — new session. 6D (Material Deliveries) is **decision- and spec-complete** (context69); no open decisions remain. This session **builds 6D**. First action is a git snapshot (git is ground truth). Then run the build-time schema-confirmation pass **before writing any migration**: confirm every column the four tables (`purchase_orders`, `purchase_order_items`, `deliveries`, `delivery_items`) reference against the live schema — especially the M5/M3/`company_members` FKs, and the RLS objects already verified in Session 69 (`can_view_project`, `get_my_member_id`, `projects_select_visible`). Honor the build facts in context69 §"Key 6D build facts": usable-qty close + manual close with `closed_reason`; two-path `has_exceptions` (numeric non-suppressible); explicit `received_by` on the offline path; `author_member_id` ≠ audit `created_by`; photos to the job file; no `returns` table. Per CLAUDE.md: branch off `main` before any edit; one thing at a time; Josh commits.
